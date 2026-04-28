//! Tauri command handlers for the hotswap plugin.

use std::collections::HashMap;

use crate::error::{Error, Result};
use crate::manifest::{HotswapCheckResult, HotswapVersionInfo};
use crate::resolver::CheckContext;
use crate::updater;
use crate::HotswapState;
use tauri::{command, AppHandle, Manager, Runtime};

fn build_check_context(state: &HotswapState) -> Result<CheckContext> {
    let current_sequence = {
        let guard = state
            .current_sequence
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        *guard
    };
    let channel = {
        let guard = state.channel.lock().map_err(|_| Error::LockPoisoned)?;
        guard.clone()
    };
    let headers = state
        .custom_headers
        .lock()
        .map_err(|_| Error::LockPoisoned)?
        .clone();
    let endpoint_override = state
        .endpoint_override
        .lock()
        .map_err(|_| Error::LockPoisoned)?
        .clone();

    Ok(CheckContext {
        current_sequence,
        binary_version: state.binary_version.clone(),
        platform: current_platform(),
        arch: current_arch(),
        channel,
        headers,
        endpoint_override,
    })
}

fn current_platform() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "linux")]
    {
        "linux"
    }
    #[cfg(target_os = "android")]
    {
        "android"
    }
    #[cfg(target_os = "ios")]
    {
        "ios"
    }
    #[cfg(not(any(
        target_os = "macos",
        target_os = "windows",
        target_os = "linux",
        target_os = "android",
        target_os = "ios"
    )))]
    {
        "unknown"
    }
}

fn current_arch() -> &'static str {
    #[cfg(target_arch = "x86_64")]
    {
        "x86_64"
    }
    #[cfg(target_arch = "aarch64")]
    {
        "aarch64"
    }
    #[cfg(target_arch = "x86")]
    {
        "x86"
    }
    #[cfg(target_arch = "arm")]
    {
        "arm"
    }
    #[cfg(not(any(
        target_arch = "x86_64",
        target_arch = "aarch64",
        target_arch = "x86",
        target_arch = "arm"
    )))]
    {
        "unknown"
    }
}

/// Check for an available update.
#[command]
pub async fn hotswap_check<R: Runtime>(app: AppHandle<R>) -> Result<HotswapCheckResult> {
    let state = app.state::<HotswapState>();
    let ctx = build_check_context(&state)?;

    let manifest = updater::check_update(state.resolver.as_ref(), &ctx, Some(&app)).await?;

    {
        let mut pending = state
            .pending_manifest
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        *pending = manifest.clone();
    }

    Ok(HotswapCheckResult {
        available: manifest.is_some(),
        version: manifest.as_ref().map(|m| m.version.clone()),
        sequence: manifest.as_ref().map(|m| m.sequence),
        notes: manifest.as_ref().and_then(|m| m.notes.clone()),
        mandatory: manifest.as_ref().and_then(|m| m.mandatory),
        bundle_size: manifest.as_ref().and_then(|m| m.bundle_size),
    })
}

/// Download, verify, extract, and activate the pending update in one step.
/// This is a convenience command — for more control, use `hotswap_download`
/// followed by `hotswap_activate`.
#[command]
pub async fn hotswap_apply<R: Runtime>(app: AppHandle<R>) -> Result<String> {
    let state = app.state::<HotswapState>();

    let manifest = {
        let pending = state
            .pending_manifest
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        pending.clone().ok_or(Error::NoPending)?
    };

    let headers = state
        .custom_headers
        .lock()
        .map_err(|_| Error::LockPoisoned)?
        .clone();
    let opts = updater::DownloadOptions {
        pubkey: &state.pubkey,
        base_dir: &state.base_dir,
        max_bundle_size: state.max_bundle_size,
        require_https: state.require_https,
        max_retries: state.max_retries,
        client: &state.http_client,
        headers: &headers,
    };
    let version_dir = updater::download_and_extract(&manifest, &opts, Some(&app)).await?;

    updater::activate_version(&state.base_dir, &version_dir)?;
    updater::cleanup_old_versions(
        &state.base_dir,
        &*state.retention_policy,
        &*state.rollback_policy,
    );

    update_state_after_apply(&state, &manifest)?;

    updater::emit_lifecycle(
        Some(&app),
        "apply",
        Some(&manifest.version),
        Some(manifest.sequence),
        None,
    );

    Ok(manifest.version)
}

/// Download, verify, and extract the pending update WITHOUT activating it.
/// The update will be served on next launch after calling `hotswap_activate`,
/// or automatically if `hotswap_activate` is never called (the version dir
/// will be picked up by `check_compatibility` on next startup — but only if
/// `activate_version` is called to set the pointer).
///
/// Use this for "download now, apply later" workflows.
#[command]
pub async fn hotswap_download<R: Runtime>(app: AppHandle<R>) -> Result<String> {
    let state = app.state::<HotswapState>();

    let manifest = {
        let pending = state
            .pending_manifest
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        pending.clone().ok_or(Error::NoPending)?
    };

    let headers = state
        .custom_headers
        .lock()
        .map_err(|_| Error::LockPoisoned)?
        .clone();
    let opts = updater::DownloadOptions {
        pubkey: &state.pubkey,
        base_dir: &state.base_dir,
        max_bundle_size: state.max_bundle_size,
        require_https: state.require_https,
        max_retries: state.max_retries,
        client: &state.http_client,
        headers: &headers,
    };
    updater::download_and_extract(&manifest, &opts, Some(&app)).await?;

    Ok(manifest.version)
}

/// Activate a previously downloaded update.
/// After activation, the new assets will be served on the next app launch
/// (or after `window.location.reload()`).
#[command]
pub async fn hotswap_activate<R: Runtime>(app: AppHandle<R>) -> Result<String> {
    let state = app.state::<HotswapState>();

    let manifest = {
        let pending = state
            .pending_manifest
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        pending.clone().ok_or(Error::NoPending)?
    };

    let version_dir = state.base_dir.join(format!("seq-{}", manifest.sequence));
    if !version_dir.is_dir() {
        return Err(Error::Config(
            "update not downloaded yet — call download first".into(),
        ));
    }

    updater::activate_version(&state.base_dir, &version_dir)?;
    updater::cleanup_old_versions(
        &state.base_dir,
        &*state.retention_policy,
        &*state.rollback_policy,
    );

    update_state_after_apply(&state, &manifest)?;

    updater::emit_lifecycle(
        Some(&app),
        "apply",
        Some(&manifest.version),
        Some(manifest.sequence),
        None,
    );

    Ok(manifest.version)
}

fn update_state_after_apply(
    state: &HotswapState,
    manifest: &crate::manifest::HotswapManifest,
) -> Result<()> {
    let version_dir = state.base_dir.join(format!("seq-{}", manifest.sequence));

    {
        let mut seq = state
            .current_sequence
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        *seq = manifest.sequence;
    }
    {
        let mut ver = state
            .current_version
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        *ver = Some(manifest.version.clone());
    }
    {
        let mut pending = state
            .pending_manifest
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        *pending = None;
    }

    // Swap the live asset directory so window.location.reload()
    // immediately serves the new assets without an app restart.
    if let Ok(mut dir) = state.live_asset_dir.write() {
        *dir = Some(version_dir);
        log::info!(
            "[hotswap] Live asset directory swapped to seq-{}.",
            manifest.sequence
        );
    }

    log::info!(
        "[hotswap] Applied v{} (seq {}). Reload to serve new assets.",
        manifest.version,
        manifest.sequence
    );

    Ok(())
}

/// Roll back to the previous version or embedded assets.
#[command]
pub async fn hotswap_rollback<R: Runtime>(app: AppHandle<R>) -> Result<HotswapVersionInfo> {
    let state = app.state::<HotswapState>();

    let rolled_back_to = updater::rollback(&state.base_dir, &*state.rollback_policy);
    let new_dir = updater::resolve_current_dir(&state.base_dir);
    let new_meta = new_dir.as_ref().and_then(|d| updater::read_meta(d));

    {
        let mut seq = state
            .current_sequence
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        *seq = new_meta.as_ref().map(|m| m.sequence).unwrap_or(0);
    }
    {
        let mut ver = state
            .current_version
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        *ver = rolled_back_to.clone();
    }

    // Swap the live asset directory so reload serves the rolled-back version
    // (or embedded assets if new_dir is None).
    if let Ok(mut dir) = state.live_asset_dir.write() {
        *dir = new_dir;
    }

    updater::emit_lifecycle(
        Some(&app),
        "rollback",
        rolled_back_to.as_deref(),
        new_meta.as_ref().map(|m| m.sequence),
        None,
    );

    Ok(HotswapVersionInfo {
        active: rolled_back_to.is_some(),
        version: rolled_back_to,
        sequence: new_meta.as_ref().map(|m| m.sequence).unwrap_or(0),
        binary_version: state.binary_version.clone(),
    })
}

/// Get information about the currently active version.
#[command]
pub async fn hotswap_current_version<R: Runtime>(app: AppHandle<R>) -> Result<HotswapVersionInfo> {
    let state = app.state::<HotswapState>();

    let version = {
        let guard = state
            .current_version
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        guard.clone()
    };
    let sequence = {
        let guard = state
            .current_sequence
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        *guard
    };

    Ok(HotswapVersionInfo {
        active: version.is_some(),
        version,
        sequence,
        binary_version: state.binary_version.clone(),
    })
}

/// Confirm the current version is healthy. Call on every startup.
#[command]
pub async fn hotswap_notify_ready<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    let state = app.state::<HotswapState>();
    let current_sequence = {
        let guard = state
            .current_sequence
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        *guard
    };

    if current_sequence > 0 {
        let version_dir = state.base_dir.join(format!("seq-{}", current_sequence));

        if let Some(mut meta) = updater::read_meta(&version_dir) {
            meta.confirmed = true;
            meta.unconfirmed_launch_count = 0;
            let json = serde_json::to_string_pretty(&meta)
                .map_err(|e| Error::Serialization(e.to_string()))?;
            std::fs::write(version_dir.join("hotswap-meta.json"), json)?;
            log::info!("[hotswap] Sequence {} confirmed as ready", current_sequence);

            updater::emit_lifecycle(
                Some(&app),
                "ready-confirmed",
                Some(&meta.version),
                Some(current_sequence),
                None,
            );
        }
    }

    Ok(())
}

/// Runtime configuration update. All fields are optional — only provided
/// fields are applied. Pass `null` to reset a field to init-time defaults.
///
/// `headers` is merged: keys with `null` values are removed, others are
/// set/overwritten. Existing headers not mentioned are kept.
#[command]
pub async fn hotswap_configure<R: Runtime>(
    app: AppHandle<R>,
    channel: Option<Option<String>>,
    endpoint: Option<Option<String>>,
    headers: Option<HashMap<String, Option<String>>>,
) -> Result<()> {
    let state = app.state::<HotswapState>();

    if let Some(ch) = channel {
        let mut guard = state.channel.lock().map_err(|_| Error::LockPoisoned)?;
        *guard = ch;
    }

    if let Some(ep) = endpoint {
        if state.require_https {
            if let Some(ref url) = ep {
                if !url.starts_with("https://") {
                    return Err(Error::InsecureUrl(url.clone()));
                }
            }
        }
        let mut guard = state
            .endpoint_override
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        *guard = ep;
    }

    if let Some(hdrs) = headers {
        let mut guard = state
            .custom_headers
            .lock()
            .map_err(|_| Error::LockPoisoned)?;
        for (key, value) in hdrs {
            match value {
                Some(v) => {
                    guard.insert(key, v);
                }
                None => {
                    guard.remove(&key);
                }
            }
        }
    }

    Ok(())
}

/// Get the current runtime configuration.
#[command]
pub async fn hotswap_get_config<R: Runtime>(app: AppHandle<R>) -> Result<RuntimeConfig> {
    let state = app.state::<HotswapState>();
    let channel = state
        .channel
        .lock()
        .map_err(|_| Error::LockPoisoned)?
        .clone();
    let endpoint = state
        .endpoint_override
        .lock()
        .map_err(|_| Error::LockPoisoned)?
        .clone();
    let headers = state
        .custom_headers
        .lock()
        .map_err(|_| Error::LockPoisoned)?
        .clone();
    Ok(RuntimeConfig {
        channel,
        endpoint,
        headers,
    })
}

/// Runtime configuration snapshot returned by `hotswap_get_config`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct RuntimeConfig {
    /// The active update channel (e.g. `"stable"`, `"beta"`).
    pub channel: Option<String>,
    /// Optional endpoint URL override for the update resolver.
    pub endpoint: Option<String>,
    /// Custom HTTP headers sent with every update request.
    pub headers: HashMap<String, String>,
}
