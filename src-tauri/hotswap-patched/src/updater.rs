use crate::error::{Error, Result};
use crate::manifest::{HotswapManifest, HotswapMeta};
use crate::resolver::{CheckContext, HotswapResolver};
use flate2::read::GzDecoder;
use minisign_verify::{PublicKey, Signature};
use semver::Version;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tar::Archive;
use tauri::{Emitter, Runtime};

/// Default maximum bundle size: 512 MB.
pub const DEFAULT_MAX_BUNDLE_SIZE: u64 = 512 * 1024 * 1024;

/// Default number of download retry attempts.
pub const DEFAULT_MAX_RETRIES: u32 = 3;

/// Payload emitted on `hotswap://download-progress` events.
#[derive(Debug, Clone, Serialize)]
#[non_exhaustive]
pub struct DownloadProgress {
    /// Bytes downloaded so far.
    pub downloaded: u64,
    /// Total expected bytes (from Content-Length), if known.
    pub total: Option<u64>,
}

/// Lifecycle event payload emitted on `hotswap://lifecycle`.
#[derive(Debug, Clone, Serialize)]
#[non_exhaustive]
pub struct LifecycleEvent {
    /// Event name (e.g. "check-start", "download-complete", "apply", "rollback").
    pub event: String,
    /// Version string, if applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Sequence number, if applicable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sequence: Option<u64>,
    /// Error message, if this is an error event.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub(crate) fn emit_lifecycle<R: Runtime>(
    app: Option<&tauri::AppHandle<R>>,
    event: &str,
    version: Option<&str>,
    sequence: Option<u64>,
    error: Option<&str>,
) {
    if let Some(app) = app {
        let _ = app.emit(
            "hotswap://lifecycle",
            LifecycleEvent {
                event: event.into(),
                version: version.map(|s| s.to_string()),
                sequence,
                error: error.map(|s| s.to_string()),
            },
        );
    }
}

/// Check for an available update using the configured resolver,
/// then validate binary compatibility and sequence.
pub(crate) async fn check_update<R: Runtime>(
    resolver: &dyn HotswapResolver,
    ctx: &CheckContext,
    app: Option<&tauri::AppHandle<R>>,
) -> Result<Option<HotswapManifest>> {
    emit_lifecycle(app, "check-start", None, None, None);

    let result = resolver.check(ctx).await;

    let manifest = match result {
        Ok(Some(m)) => m,
        Ok(None) => {
            emit_lifecycle(app, "check-complete", None, None, None);
            return Ok(None);
        }
        Err(e) => {
            emit_lifecycle(app, "check-error", None, None, Some(&e.to_string()));
            return Err(e);
        }
    };

    // Check binary compatibility
    let required = Version::parse(&manifest.min_binary_version)
        .map_err(|e| Error::Version(format!("invalid min_binary_version: {}", e)))?;
    let current_bin = Version::parse(&ctx.binary_version)
        .map_err(|e| Error::Version(format!("invalid binary version: {}", e)))?;

    if current_bin < required {
        log::warn!(
            "[hotswap] Seq {} requires binary >= {}, current binary is {}. Skipping.",
            manifest.sequence,
            manifest.min_binary_version,
            ctx.binary_version
        );
        emit_lifecycle(app, "check-complete", None, None, None);
        return Ok(None);
    }

    if manifest.sequence <= ctx.current_sequence {
        log::info!(
            "[hotswap] Manifest sequence {} is not newer than current {}",
            manifest.sequence,
            ctx.current_sequence
        );
        emit_lifecycle(app, "check-complete", None, None, None);
        return Ok(None);
    }

    log::info!(
        "[hotswap] Update available: seq {} -> {} (v{}, requires binary >= {})",
        ctx.current_sequence,
        manifest.sequence,
        manifest.version,
        manifest.min_binary_version
    );

    emit_lifecycle(
        app,
        "check-complete",
        Some(&manifest.version),
        Some(manifest.sequence),
        None,
    );
    Ok(Some(manifest))
}

/// Options for the download operation, bundled to avoid excessive arguments.
pub(crate) struct DownloadOptions<'a> {
    pub pubkey: &'a str,
    pub base_dir: &'a Path,
    pub max_bundle_size: u64,
    pub require_https: bool,
    pub max_retries: u32,
    pub client: &'a reqwest::Client,
    pub headers: &'a HashMap<String, String>,
}

/// Download, verify, and extract a bundle with retry and atomic extraction.
pub(crate) async fn download_and_extract<R: Runtime>(
    manifest: &HotswapManifest,
    opts: &DownloadOptions<'_>,
    app: Option<&tauri::AppHandle<R>>,
) -> Result<PathBuf> {
    let base_dir = opts.base_dir;
    let pubkey = opts.pubkey;

    if opts.require_https && !manifest.url.starts_with("https://") {
        return Err(Error::InsecureUrl(manifest.url.clone()));
    }

    let version_dir = base_dir.join(format!("seq-{}", manifest.sequence));

    emit_lifecycle(
        app,
        "download-start",
        Some(&manifest.version),
        Some(manifest.sequence),
        None,
    );

    let buf = download_with_retry(
        &manifest.url,
        opts.max_bundle_size,
        opts.max_retries,
        opts.client,
        opts.headers,
        app,
    )
    .await
    .inspect_err(|e| {
        emit_lifecycle(
            app,
            "download-error",
            Some(&manifest.version),
            Some(manifest.sequence),
            Some(&e.to_string()),
        );
    })?;

    log::info!(
        "[hotswap] Downloaded {} bytes, verifying signature...",
        buf.len()
    );

    verify_signature(&buf, &manifest.signature, pubkey)?;

    emit_lifecycle(
        app,
        "download-complete",
        Some(&manifest.version),
        Some(manifest.sequence),
        None,
    );

    log::info!(
        "[hotswap] Signature verified, extracting to: {}",
        version_dir.display()
    );

    // Atomic extraction: extract to temp dir, then rename
    let tmp_dir = base_dir.join(format!(".tmp-seq-{}", manifest.sequence));
    if tmp_dir.exists() {
        std::fs::remove_dir_all(&tmp_dir)?;
    }
    std::fs::create_dir_all(&tmp_dir)?;

    let extract_result = {
        let url_lower = manifest.url.to_lowercase();
        if url_lower.ends_with(".zip") {
            #[cfg(feature = "zip")]
            {
                extract_zip(&buf, &tmp_dir)
            }
            #[cfg(not(feature = "zip"))]
            {
                Err(Error::Extraction(
                    "bundle is a .zip but the 'zip' feature is not enabled — \
                     add features = [\"zip\"] to your Cargo.toml"
                        .into(),
                ))
            }
        } else {
            extract_tar_gz(&buf, &tmp_dir)
        }
    };

    if let Err(e) = extract_result {
        // Clean up failed extraction
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(e);
    }

    // Write metadata into the temp dir before renaming
    write_meta_file(
        &tmp_dir,
        &HotswapMeta {
            version: manifest.version.clone(),
            sequence: manifest.sequence,
            min_binary_version: manifest.min_binary_version.clone(),
            confirmed: false,
            unconfirmed_launch_count: 0,
        },
    )?;

    // Atomic rename: tmp dir → final seq dir
    if version_dir.exists() {
        std::fs::remove_dir_all(&version_dir)?;
    }
    std::fs::rename(&tmp_dir, &version_dir)?;

    log::info!("[hotswap] Extraction complete: {}", version_dir.display());

    Ok(version_dir)
}

/// Download with retry and exponential backoff.
async fn download_with_retry<R: Runtime>(
    url: &str,
    max_bundle_size: u64,
    max_retries: u32,
    client: &reqwest::Client,
    headers: &HashMap<String, String>,
    app: Option<&tauri::AppHandle<R>>,
) -> Result<Vec<u8>> {
    let mut last_error = None;

    for attempt in 0..=max_retries {
        if attempt > 0 {
            let delay = std::time::Duration::from_millis(1000 * (1 << (attempt - 1).min(4)));
            log::info!(
                "[hotswap] Retry {}/{} after {:?}",
                attempt,
                max_retries,
                delay
            );
            tokio::time::sleep(delay).await;
        }

        match download_once(url, max_bundle_size, client, headers, app).await {
            Ok(buf) => return Ok(buf),
            Err(e) => {
                log::warn!("[hotswap] Download attempt {} failed: {}", attempt + 1, e);
                last_error = Some(e);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| Error::Network("download failed".into())))
}

/// Single download attempt with streaming progress.
async fn download_once<R: Runtime>(
    url: &str,
    max_bundle_size: u64,
    client: &reqwest::Client,
    headers: &HashMap<String, String>,
    app: Option<&tauri::AppHandle<R>>,
) -> Result<Vec<u8>> {
    log::info!("[hotswap] Downloading bundle from: {}", url);

    let mut req = client.get(url).timeout(std::time::Duration::from_secs(300));

    for (key, value) in headers {
        req = req.header(key.as_str(), value.as_str());
    }

    let response = req
        .send()
        .await
        .map_err(|e| Error::Network(e.to_string()))?;

    if !response.status().is_success() {
        return Err(Error::Http {
            status: response.status().as_u16(),
            message: "bundle download failed".into(),
        });
    }

    if let Some(content_length) = response.content_length() {
        if content_length > max_bundle_size {
            return Err(Error::BundleTooLarge {
                size: content_length,
                limit: max_bundle_size,
            });
        }
    }

    let total = response.content_length();
    let mut downloaded: u64 = 0;
    let initial_capacity = total.unwrap_or(1024 * 1024).min(max_bundle_size) as usize;
    let mut buf = Vec::with_capacity(initial_capacity);

    let mut stream = response;
    loop {
        let chunk = stream
            .chunk()
            .await
            .map_err(|e| Error::Network(e.to_string()))?;
        match chunk {
            Some(data) => {
                downloaded += data.len() as u64;
                if downloaded > max_bundle_size {
                    return Err(Error::BundleTooLarge {
                        size: downloaded,
                        limit: max_bundle_size,
                    });
                }
                buf.extend_from_slice(&data);
                if let Some(app) = app {
                    let _ = app.emit(
                        "hotswap://download-progress",
                        DownloadProgress { downloaded, total },
                    );
                }
            }
            None => break,
        }
    }

    Ok(buf)
}

/// Write metadata to a version directory with restrictive file permissions.
fn write_meta_file(version_dir: &Path, meta: &HotswapMeta) -> Result<()> {
    let meta_path = version_dir.join("hotswap-meta.json");
    let meta_json =
        serde_json::to_string_pretty(meta).map_err(|e| Error::Serialization(e.to_string()))?;

    std::fs::write(&meta_path, &meta_json)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&meta_path, std::fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

/// Validate that an archive entry path is safe to extract into `dest`.
fn validate_entry_path(entry_path: &Path, dest: &Path) -> Result<PathBuf> {
    let path_str = entry_path.to_string_lossy();

    if entry_path.is_absolute() {
        return Err(Error::Extraction(format!(
            "absolute path in archive: {}",
            path_str
        )));
    }

    for component in entry_path.components() {
        match component {
            std::path::Component::Normal(_) | std::path::Component::CurDir => {}
            _ => {
                return Err(Error::Extraction(format!(
                    "unsafe path component in archive: {}",
                    path_str
                )));
            }
        }
    }

    let target = dest.join(entry_path);
    if !target.starts_with(dest) {
        return Err(Error::Extraction(format!(
            "path escapes destination: {}",
            path_str
        )));
    }

    Ok(target)
}

fn extract_tar_gz(bytes: &[u8], dest: &Path) -> Result<()> {
    let decoder = GzDecoder::new(bytes);
    let mut archive = Archive::new(decoder);

    for entry in archive
        .entries()
        .map_err(|e| Error::Extraction(e.to_string()))?
    {
        let mut entry = entry.map_err(|e| Error::Extraction(e.to_string()))?;
        let path = entry
            .path()
            .map_err(|e| Error::Extraction(e.to_string()))?
            .to_path_buf();

        let target = validate_entry_path(&path, dest)?;

        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }

        if entry.header().entry_type().is_file() {
            let mut file = std::fs::File::create(&target)?;
            std::io::copy(&mut entry, &mut file)?;
        }
    }

    Ok(())
}

#[cfg(feature = "zip")]
fn extract_zip(bytes: &[u8], dest: &Path) -> Result<()> {
    let cursor = std::io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| Error::Extraction(e.to_string()))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| Error::Extraction(e.to_string()))?;

        let entry_path = PathBuf::from(file.name());
        let target = validate_entry_path(&entry_path, dest)?;

        if file.is_dir() {
            std::fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&target)?;
            std::io::copy(&mut file, &mut outfile)?;
        }
    }

    Ok(())
}

fn verify_signature(data: &[u8], signature_str: &str, pubkey_str: &str) -> Result<()> {
    let pk = PublicKey::from_base64(pubkey_str)
        .map_err(|e| Error::Signature(format!("invalid public key: {}", e)))?;

    let sig_text = if signature_str.starts_with("untrusted comment:") {
        signature_str.to_string()
    } else {
        let decoded = base64_decode(signature_str)
            .map_err(|e| Error::Signature(format!("base64 decode failed: {}", e)))?;
        String::from_utf8(decoded)
            .map_err(|e| Error::Signature(format!("signature is not valid UTF-8: {}", e)))?
    };

    let sig = Signature::decode(&sig_text)
        .map_err(|e| Error::Signature(format!("invalid signature format: {}", e)))?;

    pk.verify(data, &sig, false)
        .map_err(|e| Error::Signature(e.to_string()))?;

    Ok(())
}

fn base64_decode(input: &str) -> std::result::Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(input.trim())
        .map_err(|e| e.to_string())
}

/// Activate a downloaded version by atomically updating the `current` pointer.
pub(crate) fn activate_version(base_dir: &Path, version_dir: &Path) -> Result<()> {
    let current_link = base_dir.join("current");
    let tmp_link = base_dir.join("current.tmp");

    let dir_name = version_dir
        .file_name()
        .ok_or_else(|| Error::Extraction("invalid version dir".into()))?
        .to_string_lossy();

    std::fs::write(&tmp_link, dir_name.as_bytes())?;
    std::fs::rename(&tmp_link, &current_link)?;

    log::info!("[hotswap] Activated version: {}", dir_name);
    Ok(())
}

fn parse_seq(name: &str) -> Option<u64> {
    name.strip_prefix("seq-")?.parse::<u64>().ok()
}

fn sorted_version_dirs(base_dir: &Path) -> Vec<(u64, std::fs::DirEntry)> {
    let mut versions: Vec<_> = std::fs::read_dir(base_dir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let seq = parse_seq(&name)?;
            Some((seq, e))
        })
        .collect();

    versions.sort_by(|a, b| b.0.cmp(&a.0));
    versions
}

fn validate_pointer(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        log::warn!("[hotswap] Rejecting unsafe pointer value: {:?}", trimmed);
        return None;
    }
    if parse_seq(trimmed).is_none() {
        log::warn!(
            "[hotswap] Rejecting pointer with unexpected format: {:?}",
            trimmed
        );
        return None;
    }
    Some(trimmed)
}

pub(crate) fn resolve_current_dir(base_dir: &Path) -> Option<PathBuf> {
    let current_pointer = base_dir.join("current");
    if !current_pointer.exists() {
        return None;
    }

    let raw = std::fs::read_to_string(&current_pointer).ok()?;
    let version_name = validate_pointer(&raw)?;

    let version_dir = base_dir.join(version_name);

    if !version_dir.starts_with(base_dir) {
        log::warn!(
            "[hotswap] Pointer resolved outside base dir: {}",
            version_dir.display()
        );
        return None;
    }

    if version_dir.is_dir() {
        Some(version_dir)
    } else {
        log::warn!(
            "[hotswap] Current pointer references missing dir: {}",
            version_dir.display()
        );
        None
    }
}

pub(crate) fn read_meta(version_dir: &Path) -> Option<HotswapMeta> {
    let meta_path = version_dir.join("hotswap-meta.json");
    let content = std::fs::read_to_string(&meta_path).ok()?;
    serde_json::from_str(&content).ok()
}

pub(crate) fn check_compatibility(
    base_dir: &Path,
    binary_version: &str,
    cache_policy: &dyn crate::policy::BinaryCachePolicy,
    confirmation_policy: &dyn crate::policy::ConfirmationPolicy,
    rollback_policy: &dyn crate::policy::RollbackPolicy,
) -> Option<PathBuf> {
    let version_dir = resolve_current_dir(base_dir)?;
    let mut meta = match read_meta(&version_dir) {
        Some(m) => m,
        None => {
            log::warn!(
                "[hotswap] Failed to read metadata from {}. Falling back to embedded.",
                version_dir.display()
            );
            return None;
        }
    };

    let required = match Version::parse(&meta.min_binary_version) {
        Ok(v) => v,
        Err(e) => {
            log::warn!(
                "[hotswap] Invalid semver in min_binary_version '{}': {}. Falling back to embedded.",
                meta.min_binary_version,
                e
            );
            return None;
        }
    };
    let current = match Version::parse(binary_version) {
        Ok(v) => v,
        Err(e) => {
            log::warn!(
                "[hotswap] Invalid semver in binary_version '{}': {}. Falling back to embedded.",
                binary_version,
                e
            );
            return None;
        }
    };

    // Safety invariant: binary too old → always fall back (not trait-controlled)
    if current < required {
        log::warn!(
            "[hotswap] Cached v{} requires binary >= {}, current is {}. Falling back to embedded.",
            meta.version,
            meta.min_binary_version,
            binary_version
        );
        return None;
    }

    if cache_policy.should_discard(&current, &meta, None) {
        log::info!(
            "[hotswap] Binary cache policy discards cached v{} (binary={}, min={}).",
            meta.version,
            binary_version,
            meta.min_binary_version
        );
        if let Err(e) = std::fs::remove_file(base_dir.join("current")) {
            log::warn!("[hotswap] Failed to remove current pointer: {}", e);
        }
        if let Err(e) = std::fs::remove_dir_all(&version_dir) {
            log::warn!(
                "[hotswap] Failed to remove version dir {}: {}",
                version_dir.display(),
                e
            );
        }
        return None;
    }

    if !meta.confirmed {
        use crate::policy::ConfirmationDecision;
        match confirmation_policy.on_startup_unconfirmed(&meta) {
            ConfirmationDecision::KeepForNow => {
                log::info!(
                    "[hotswap] v{} unconfirmed (launch {}), keeping for now.",
                    meta.version,
                    meta.unconfirmed_launch_count + 1
                );
                meta.unconfirmed_launch_count += 1;
                if let Err(e) = write_meta_file(&version_dir, &meta) {
                    log::error!(
                        "[hotswap] Failed to persist unconfirmed launch count for {}: {}",
                        version_dir.display(),
                        e
                    );
                }
                return Some(version_dir);
            }
            ConfirmationDecision::RollbackNow => {
                log::warn!(
                    "[hotswap] v{} was not confirmed (notifyReady not called). Rolling back.",
                    meta.version
                );
                rollback(base_dir, rollback_policy);
                return resolve_current_dir(base_dir).and_then(|dir| {
                    let prev_meta = read_meta(&dir)?;
                    if prev_meta.confirmed {
                        Some(dir)
                    } else {
                        None
                    }
                });
            }
        }
    }

    Some(version_dir)
}

pub(crate) fn rollback(
    base_dir: &Path,
    rollback_policy: &dyn crate::policy::RollbackPolicy,
) -> Option<String> {
    let current_pointer = base_dir.join("current");
    let raw = std::fs::read_to_string(&current_pointer).ok()?;
    let current_version = validate_pointer(&raw)?.to_string();
    let current_seq = parse_seq(&current_version);

    if let Err(e) = std::fs::remove_file(&current_pointer) {
        log::warn!(
            "[hotswap] Failed to remove current pointer during rollback: {}",
            e
        );
    }

    let broken_dir = base_dir.join(&current_version);
    if broken_dir.exists() {
        if let Err(e) = std::fs::remove_dir_all(&broken_dir) {
            log::warn!(
                "[hotswap] Failed to remove broken version dir {}: {}",
                broken_dir.display(),
                e
            );
        }
    }

    // Collect confirmed candidates from remaining version dirs, sorted desc
    let versions = sorted_version_dirs(base_dir);
    let confirmed_candidates: Vec<HotswapMeta> = versions
        .iter()
        .filter_map(|(_, entry)| {
            let dir = entry.path();
            let meta = read_meta(&dir)?;
            if meta.confirmed {
                Some(meta)
            } else {
                None
            }
        })
        .collect();

    if let Some(target_seq) = rollback_policy.select_target(current_seq, &confirmed_candidates) {
        let target_name = format!("seq-{}", target_seq);
        let target_dir = base_dir.join(&target_name);
        if let Some(meta) = read_meta(&target_dir) {
            let tmp_link = base_dir.join("current.tmp");
            if let Err(e) = std::fs::write(&tmp_link, &target_name) {
                log::error!(
                    "[hotswap] Failed to write rollback pointer for {}: {}",
                    target_name,
                    e
                );
                return None;
            }
            if let Err(e) = std::fs::rename(&tmp_link, &current_pointer) {
                log::error!(
                    "[hotswap] Failed to activate rollback pointer for {}: {}",
                    target_name,
                    e
                );
                return None;
            }
            log::info!("[hotswap] Rolled back to {}", target_name);
            return Some(meta.version);
        }
    }

    log::info!("[hotswap] Rolled back to embedded assets (no valid previous version)");
    None
}

pub(crate) fn cleanup_old_versions(
    base_dir: &Path,
    retention_policy: &dyn crate::policy::RetentionPolicy,
    rollback_policy: &dyn crate::policy::RollbackPolicy,
) {
    let current_seq = std::fs::read_to_string(base_dir.join("current"))
        .ok()
        .and_then(|raw| parse_seq(raw.trim()));

    let versions = sorted_version_dirs(base_dir);

    // Collect all available version metas (sorted desc by sequence)
    let available: Vec<HotswapMeta> = versions
        .iter()
        .filter_map(|(_, entry)| read_meta(&entry.path()))
        .collect();

    // Determine rollback candidate
    let confirmed_candidates: Vec<HotswapMeta> =
        available.iter().filter(|m| m.confirmed).cloned().collect();
    let rollback_candidate = rollback_policy.select_target(current_seq, &confirmed_candidates);

    // Ask retention policy which sequences to keep
    let mut kept =
        retention_policy.select_kept_sequences(current_seq, rollback_candidate, &available);

    // Safety floor: always preserve current + rollback candidate,
    // even if the policy didn't include them.
    if let Some(seq) = current_seq {
        kept.insert(seq);
    }
    if let Some(seq) = rollback_candidate {
        kept.insert(seq);
    }

    for (seq, entry) in &versions {
        if !kept.contains(seq) {
            log::info!(
                "[hotswap] Cleaning up old version: {}",
                entry.file_name().to_string_lossy()
            );
            if let Err(e) = std::fs::remove_dir_all(entry.path()) {
                log::warn!(
                    "[hotswap] Failed to remove old version {}: {}",
                    entry.file_name().to_string_lossy(),
                    e
                );
            }
        }
    }

    // Also clean up any leftover temp extraction dirs
    if let Ok(entries) = std::fs::read_dir(base_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(".tmp-seq-") {
                log::info!("[hotswap] Cleaning up temp dir: {}", name);
                if let Err(e) = std::fs::remove_dir_all(entry.path()) {
                    log::warn!("[hotswap] Failed to remove temp dir {}: {}", name, e);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_version(dir: &Path, version: &str, sequence: u64, min_bin: &str, confirmed: bool) {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join("index.html"), "<html></html>").unwrap();
        write_meta_file(
            dir,
            &HotswapMeta {
                version: version.to_string(),
                sequence,
                min_binary_version: min_bin.to_string(),
                confirmed,
                unconfirmed_launch_count: 0,
            },
        )
        .unwrap();
    }

    fn set_current(base: &Path, name: &str) {
        fs::write(base.join("current"), name).unwrap();
    }

    #[test]
    fn test_parse_seq_valid() {
        assert_eq!(parse_seq("seq-0"), Some(0));
        assert_eq!(parse_seq("seq-42"), Some(42));
    }

    #[test]
    fn test_parse_seq_invalid() {
        assert_eq!(parse_seq("seq-"), None);
        assert_eq!(parse_seq("seq-abc"), None);
        assert_eq!(parse_seq(""), None);
    }

    #[test]
    fn test_validate_pointer_valid() {
        assert_eq!(validate_pointer("seq-1"), Some("seq-1"));
        assert_eq!(validate_pointer("  seq-42  "), Some("seq-42"));
    }

    #[test]
    fn test_validate_pointer_rejects_traversal() {
        assert!(validate_pointer("../etc").is_none());
        assert!(validate_pointer("seq-1/../../etc").is_none());
    }

    #[test]
    fn test_validate_pointer_rejects_bad_format() {
        assert!(validate_pointer("").is_none());
        assert!(validate_pointer("not-a-seq").is_none());
    }

    #[test]
    fn test_validate_entry_path_ok() {
        let dest = Path::new("/tmp/extract");
        let target = validate_entry_path(Path::new("index.html"), dest).unwrap();
        assert_eq!(target, PathBuf::from("/tmp/extract/index.html"));
    }

    #[test]
    fn test_validate_entry_path_rejects_absolute() {
        assert!(validate_entry_path(Path::new("/etc/passwd"), Path::new("/tmp/extract")).is_err());
    }

    #[test]
    fn test_validate_entry_path_rejects_traversal() {
        let dest = Path::new("/tmp/extract");
        assert!(validate_entry_path(Path::new("../escape.txt"), dest).is_err());
        assert!(validate_entry_path(Path::new("foo/../../escape.txt"), dest).is_err());
    }

    #[test]
    fn test_sorted_version_dirs_numeric_order() {
        let tmp = TempDir::new().unwrap();
        for i in &[2, 10, 1, 3] {
            fs::create_dir_all(tmp.path().join(format!("seq-{}", i))).unwrap();
        }
        fs::create_dir_all(tmp.path().join("other-dir")).unwrap();

        let sorted = sorted_version_dirs(tmp.path());
        let seqs: Vec<u64> = sorted.iter().map(|(s, _)| *s).collect();
        assert_eq!(seqs, vec![10, 3, 2, 1]);
    }

    #[test]
    fn test_read_meta() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("seq-1");
        create_version(&dir, "1.0.0", 1, "0.1.0", true);
        let meta = read_meta(&dir).unwrap();
        assert_eq!(meta.version, "1.0.0");
        assert!(meta.confirmed);
    }

    #[test]
    fn test_write_meta_file_permissions() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("seq-1");
        fs::create_dir_all(&dir).unwrap();
        write_meta_file(
            &dir,
            &HotswapMeta {
                version: "1.0.0".into(),
                sequence: 1,
                min_binary_version: "1.0.0".into(),
                confirmed: false,
                unconfirmed_launch_count: 0,
            },
        )
        .unwrap();

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = fs::metadata(dir.join("hotswap-meta.json"))
                .unwrap()
                .permissions();
            assert_eq!(perms.mode() & 0o777, 0o600);
        }
    }

    #[test]
    fn test_resolve_current_dir() {
        let tmp = TempDir::new().unwrap();
        let seq1 = tmp.path().join("seq-1");
        create_version(&seq1, "1.0.0", 1, "0.1.0", true);
        set_current(tmp.path(), "seq-1");
        assert_eq!(resolve_current_dir(tmp.path()), Some(seq1));
    }

    #[test]
    fn test_resolve_current_dir_rejects_traversal() {
        let tmp = TempDir::new().unwrap();
        fs::write(tmp.path().join("current"), "../escape").unwrap();
        assert!(resolve_current_dir(tmp.path()).is_none());
    }

    #[test]
    fn test_check_compatibility_ok() {
        let tmp = TempDir::new().unwrap();
        let seq1 = tmp.path().join("seq-1");
        create_version(&seq1, "1.0.0-ota.1", 1, "1.0.0", true);
        set_current(tmp.path(), "seq-1");
        assert_eq!(
            check_compatibility(
                tmp.path(),
                "1.0.0",
                &BinaryCachePolicyKind::DiscardOnUpgrade,
                &ConfirmationPolicyKind::SingleLaunch,
                &RollbackPolicyKind::LatestConfirmed,
            ),
            Some(seq1)
        );
    }

    #[test]
    fn test_check_compatibility_unconfirmed_triggers_rollback() {
        let tmp = TempDir::new().unwrap();
        create_version(&tmp.path().join("seq-1"), "v1", 1, "1.0.0", true);
        create_version(&tmp.path().join("seq-2"), "v2", 2, "1.0.0", false);
        set_current(tmp.path(), "seq-2");
        assert_eq!(
            check_compatibility(
                tmp.path(),
                "1.0.0",
                &BinaryCachePolicyKind::DiscardOnUpgrade,
                &ConfirmationPolicyKind::SingleLaunch,
                &RollbackPolicyKind::LatestConfirmed,
            ),
            Some(tmp.path().join("seq-1"))
        );
    }

    #[test]
    fn test_activate_version() {
        let tmp = TempDir::new().unwrap();
        let seq1 = tmp.path().join("seq-1");
        fs::create_dir_all(&seq1).unwrap();
        activate_version(tmp.path(), &seq1).unwrap();
        assert_eq!(
            fs::read_to_string(tmp.path().join("current")).unwrap(),
            "seq-1"
        );
    }

    #[test]
    fn test_rollback_to_previous() {
        let tmp = TempDir::new().unwrap();
        create_version(&tmp.path().join("seq-1"), "v1", 1, "1.0.0", true);
        create_version(&tmp.path().join("seq-2"), "v2", 2, "1.0.0", true);
        set_current(tmp.path(), "seq-2");
        assert_eq!(
            rollback(tmp.path(), &RollbackPolicyKind::LatestConfirmed),
            Some("v1".to_string())
        );
        assert_eq!(
            fs::read_to_string(tmp.path().join("current")).unwrap(),
            "seq-1"
        );
    }

    #[test]
    fn test_cleanup_old_versions() {
        let tmp = TempDir::new().unwrap();
        for i in 1..=4 {
            create_version(
                &tmp.path().join(format!("seq-{}", i)),
                &format!("v{}", i),
                i,
                "1.0.0",
                true,
            );
        }
        set_current(tmp.path(), "seq-4");
        cleanup_old_versions(
            tmp.path(),
            &RetentionConfig::default(),
            &RollbackPolicyKind::LatestConfirmed,
        );
        assert!(tmp.path().join("seq-4").exists());
        assert!(tmp.path().join("seq-3").exists());
        assert!(!tmp.path().join("seq-1").exists());
        assert!(!tmp.path().join("seq-2").exists());
    }

    #[test]
    fn test_extract_tar_gz() {
        let tmp = TempDir::new().unwrap();
        let dest = tmp.path().join("extracted");
        fs::create_dir_all(&dest).unwrap();

        let buf = Vec::new();
        let enc = flate2::write::GzEncoder::new(buf, flate2::Compression::default());
        let mut builder = tar::Builder::new(enc);
        let data = b"<html></html>";
        let mut header = tar::Header::new_gnu();
        header.set_size(data.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, "index.html", &data[..])
            .unwrap();
        let compressed = builder.into_inner().unwrap().finish().unwrap();

        extract_tar_gz(&compressed, &dest).unwrap();
        assert!(dest.join("index.html").exists());
    }

    #[test]
    fn test_verify_signature_invalid() {
        assert!(verify_signature(b"hello", "not-a-sig", "not-a-key").is_err());
    }

    #[test]
    fn test_base64_roundtrip() {
        let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, b"hello");
        assert_eq!(base64_decode(&encoded).unwrap(), b"hello");
    }

    #[test]
    fn test_cleanup_removes_tmp_dirs() {
        let tmp = TempDir::new().unwrap();
        create_version(&tmp.path().join("seq-1"), "v1", 1, "1.0.0", true);
        set_current(tmp.path(), "seq-1");
        // Simulate a leftover temp extraction dir
        fs::create_dir_all(tmp.path().join(".tmp-seq-2")).unwrap();
        fs::write(tmp.path().join(".tmp-seq-2/index.html"), "partial").unwrap();

        cleanup_old_versions(
            tmp.path(),
            &RetentionConfig::default(),
            &RollbackPolicyKind::LatestConfirmed,
        );

        assert!(!tmp.path().join(".tmp-seq-2").exists());
        assert!(tmp.path().join("seq-1").exists());
    }

    // ── Mock resolver for check_update tests ──────────────────────────

    struct MockResolver {
        result: std::sync::Mutex<Result<Option<HotswapManifest>>>,
    }

    impl MockResolver {
        fn returning_none() -> Self {
            Self {
                result: std::sync::Mutex::new(Ok(None)),
            }
        }

        fn returning_manifest(m: HotswapManifest) -> Self {
            Self {
                result: std::sync::Mutex::new(Ok(Some(m))),
            }
        }
    }

    impl crate::resolver::HotswapResolver for MockResolver {
        fn check(
            &self,
            _ctx: &crate::resolver::CheckContext,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<Option<HotswapManifest>>> + Send>,
        > {
            let result = {
                let mut guard = self.result.lock().unwrap();
                std::mem::replace(&mut *guard, Ok(None))
            };
            Box::pin(async move { result })
        }
    }

    fn make_check_ctx(
        binary_version: &str,
        current_sequence: u64,
    ) -> crate::resolver::CheckContext {
        crate::resolver::CheckContext {
            current_sequence,
            binary_version: binary_version.to_string(),
            platform: "macos",
            arch: "aarch64",
            channel: None,
            headers: HashMap::new(),
            endpoint_override: None,
        }
    }

    fn make_manifest(sequence: u64, min_binary_version: &str) -> HotswapManifest {
        HotswapManifest {
            version: format!("1.0.0-ota.{}", sequence),
            sequence,
            url: "https://cdn.example.com/bundle.tar.gz".into(),
            signature: "sig".into(),
            min_binary_version: min_binary_version.into(),
            notes: None,
            pub_date: None,
            mandatory: None,
            bundle_size: None,
        }
    }

    // ── check_update tests ────────────────────────────────────────────

    #[tokio::test]
    async fn test_check_update_resolver_returns_none() {
        let resolver = MockResolver::returning_none();
        let ctx = make_check_ctx("1.0.0", 5);
        let result = check_update(&resolver, &ctx, None::<&tauri::AppHandle<tauri::Wry>>)
            .await
            .unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_check_update_sequence_not_newer() {
        let resolver = MockResolver::returning_manifest(make_manifest(5, "1.0.0"));
        let ctx = make_check_ctx("1.0.0", 5);
        let result = check_update(&resolver, &ctx, None::<&tauri::AppHandle<tauri::Wry>>)
            .await
            .unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_check_update_sequence_older() {
        let resolver = MockResolver::returning_manifest(make_manifest(3, "1.0.0"));
        let ctx = make_check_ctx("1.0.0", 5);
        let result = check_update(&resolver, &ctx, None::<&tauri::AppHandle<tauri::Wry>>)
            .await
            .unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_check_update_binary_incompatible() {
        let resolver = MockResolver::returning_manifest(make_manifest(10, "2.0.0"));
        let ctx = make_check_ctx("1.0.0", 5);
        let result = check_update(&resolver, &ctx, None::<&tauri::AppHandle<tauri::Wry>>)
            .await
            .unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_check_update_valid_newer_manifest() {
        let resolver = MockResolver::returning_manifest(make_manifest(10, "1.0.0"));
        let ctx = make_check_ctx("1.0.0", 5);
        let result = check_update(&resolver, &ctx, None::<&tauri::AppHandle<tauri::Wry>>)
            .await
            .unwrap();
        assert!(result.is_some());
        let manifest = result.unwrap();
        assert_eq!(manifest.sequence, 10);
    }

    #[tokio::test]
    async fn test_check_update_invalid_semver_in_manifest() {
        let resolver = MockResolver::returning_manifest(make_manifest(10, "not-semver"));
        let ctx = make_check_ctx("1.0.0", 5);
        let result = check_update(&resolver, &ctx, None::<&tauri::AppHandle<tauri::Wry>>).await;
        assert!(matches!(result, Err(Error::Version(_))));
    }

    #[tokio::test]
    async fn test_check_update_invalid_binary_version() {
        let resolver = MockResolver::returning_manifest(make_manifest(10, "1.0.0"));
        let ctx = make_check_ctx("bad-version", 5);
        let result = check_update(&resolver, &ctx, None::<&tauri::AppHandle<tauri::Wry>>).await;
        assert!(matches!(result, Err(Error::Version(_))));
    }

    // ── extract edge cases ────────────────────────────────────────────

    #[test]
    fn test_extract_tar_gz_nested_directories() {
        let tmp = TempDir::new().unwrap();
        let dest = tmp.path().join("out");
        fs::create_dir_all(&dest).unwrap();

        let buf = Vec::new();
        let enc = flate2::write::GzEncoder::new(buf, flate2::Compression::default());
        let mut builder = tar::Builder::new(enc);

        let data = b"body { color: red; }";
        let mut header = tar::Header::new_gnu();
        header.set_size(data.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, "assets/css/style.css", &data[..])
            .unwrap();

        let compressed = builder.into_inner().unwrap().finish().unwrap();
        extract_tar_gz(&compressed, &dest).unwrap();

        assert!(dest.join("assets/css/style.css").exists());
        assert_eq!(
            fs::read_to_string(dest.join("assets/css/style.css")).unwrap(),
            "body { color: red; }"
        );
    }

    #[test]
    fn test_extract_tar_gz_corrupt_data() {
        let tmp = TempDir::new().unwrap();
        let dest = tmp.path().join("out");
        fs::create_dir_all(&dest).unwrap();
        let err = extract_tar_gz(b"not valid gzip", &dest).unwrap_err();
        assert!(matches!(err, Error::Extraction(_)));
    }

    // ── check_compatibility edge cases ────────────────────────────────

    #[test]
    fn test_check_compatibility_unconfirmed_no_previous() {
        let tmp = TempDir::new().unwrap();
        create_version(&tmp.path().join("seq-1"), "v1", 1, "1.0.0", false);
        set_current(tmp.path(), "seq-1");
        assert_eq!(
            check_compatibility(
                tmp.path(),
                "1.0.0",
                &BinaryCachePolicyKind::DiscardOnUpgrade,
                &ConfirmationPolicyKind::SingleLaunch,
                &RollbackPolicyKind::LatestConfirmed,
            ),
            None
        );
    }

    #[test]
    fn test_check_compatibility_binary_downgrade() {
        let tmp = TempDir::new().unwrap();
        create_version(&tmp.path().join("seq-1"), "v1", 1, "2.0.0", true);
        set_current(tmp.path(), "seq-1");
        assert_eq!(
            check_compatibility(
                tmp.path(),
                "1.0.0",
                &BinaryCachePolicyKind::DiscardOnUpgrade,
                &ConfirmationPolicyKind::SingleLaunch,
                &RollbackPolicyKind::LatestConfirmed,
            ),
            None
        );
    }

    #[test]
    fn test_check_compatibility_discard_on_upgrade_false() {
        let tmp = TempDir::new().unwrap();
        let seq1 = tmp.path().join("seq-1");
        create_version(&seq1, "v1", 1, "1.0.0", true);
        set_current(tmp.path(), "seq-1");
        assert_eq!(
            check_compatibility(
                tmp.path(),
                "2.0.0",
                &BinaryCachePolicyKind::NeverDiscard,
                &ConfirmationPolicyKind::SingleLaunch,
                &RollbackPolicyKind::LatestConfirmed,
            ),
            Some(seq1)
        );
    }

    #[test]
    fn test_check_compatibility_discard_on_upgrade_true() {
        let tmp = TempDir::new().unwrap();
        create_version(&tmp.path().join("seq-1"), "v1", 1, "1.0.0", true);
        set_current(tmp.path(), "seq-1");
        assert_eq!(
            check_compatibility(
                tmp.path(),
                "2.0.0",
                &BinaryCachePolicyKind::DiscardOnUpgrade,
                &ConfirmationPolicyKind::SingleLaunch,
                &RollbackPolicyKind::LatestConfirmed,
            ),
            None
        );
        assert!(!tmp.path().join("seq-1").exists());
    }

    // ── cleanup edge cases ────────────────────────────────────────────

    #[test]
    fn test_cleanup_only_current_version() {
        let tmp = TempDir::new().unwrap();
        create_version(&tmp.path().join("seq-5"), "v5", 5, "1.0.0", true);
        set_current(tmp.path(), "seq-5");
        cleanup_old_versions(
            tmp.path(),
            &RetentionConfig::default(),
            &RollbackPolicyKind::LatestConfirmed,
        );
        assert!(tmp.path().join("seq-5").exists());
    }

    #[test]
    fn test_cleanup_three_versions_keeps_two() {
        let tmp = TempDir::new().unwrap();
        create_version(&tmp.path().join("seq-1"), "v1", 1, "1.0.0", true);
        create_version(&tmp.path().join("seq-2"), "v2", 2, "1.0.0", true);
        create_version(&tmp.path().join("seq-3"), "v3", 3, "1.0.0", true);
        set_current(tmp.path(), "seq-3");
        cleanup_old_versions(
            tmp.path(),
            &RetentionConfig::default(),
            &RollbackPolicyKind::LatestConfirmed,
        );
        assert!(tmp.path().join("seq-3").exists());
        assert!(tmp.path().join("seq-2").exists());
        assert!(!tmp.path().join("seq-1").exists());
    }

    #[test]
    fn test_cleanup_numeric_sorting_large_sequences() {
        let tmp = TempDir::new().unwrap();
        for i in &[1, 2, 3, 10, 11, 100] {
            create_version(
                &tmp.path().join(format!("seq-{}", i)),
                &format!("v{}", i),
                *i,
                "1.0.0",
                true,
            );
        }
        set_current(tmp.path(), "seq-100");

        cleanup_old_versions(
            tmp.path(),
            &RetentionConfig::default(),
            &RollbackPolicyKind::LatestConfirmed,
        );

        assert!(tmp.path().join("seq-100").exists());
        assert!(tmp.path().join("seq-11").exists());
        assert!(!tmp.path().join("seq-10").exists());
        assert!(!tmp.path().join("seq-3").exists());
        assert!(!tmp.path().join("seq-2").exists());
        assert!(!tmp.path().join("seq-1").exists());
    }
}
