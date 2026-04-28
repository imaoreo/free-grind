use crate::error::{Error, Result};
use crate::manifest::HotswapManifest;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use url::Url;

/// Context passed to resolvers on each check.
/// Contains runtime information about the current app state.
#[derive(Debug, Clone)]
pub struct CheckContext {
    /// Current monotonic sequence (0 if no version cached).
    pub current_sequence: u64,
    /// Binary version from tauri.conf.json.
    pub binary_version: String,
    /// Current platform (e.g. "macos", "windows", "linux", "android").
    pub platform: &'static str,
    /// Current architecture (e.g. "x86_64", "aarch64").
    pub arch: &'static str,
    /// Active channel, if configured.
    pub channel: Option<String>,
    /// Runtime HTTP headers (set via `configure()`).
    /// Merged with any headers baked into the resolver at init time,
    /// with runtime headers taking precedence.
    pub headers: HashMap<String, String>,
    /// Runtime endpoint override (set via `configure()`).
    /// When set, replaces the endpoint baked into `HttpResolver` at init time.
    pub endpoint_override: Option<String>,
}

/// Trait for resolving update availability.
///
/// Implement this to use a custom update source (e.g. a static file,
/// a custom API, or a database). The plugin ships two built-in
/// implementations: [`HttpResolver`] and [`StaticFileResolver`].
pub trait HotswapResolver: Send + Sync + 'static {
    /// Check whether an update is available.
    ///
    /// Return `Ok(Some(manifest))` if an update is available,
    /// `Ok(None)` if not, or `Err(...)` on failure.
    fn check(
        &self,
        ctx: &CheckContext,
    ) -> Pin<Box<dyn Future<Output = Result<Option<HotswapManifest>>> + Send>>;
}

/// HTTP-based resolver that calls an endpoint URL.
///
/// The URL may contain `{{current_sequence}}` which is replaced at runtime.
/// Query params `binary_version`, `platform`, `arch`, and `channel` are
/// appended automatically.
///
/// Custom headers (e.g. `Authorization`) are sent on every request.
///
/// Expected responses:
/// - **204 No Content** → no update available
/// - **200** with JSON body → [`HotswapManifest`]
pub struct HttpResolver {
    endpoint: String,
    client: reqwest::Client,
    headers: HashMap<String, String>,
}

impl HttpResolver {
    /// Create a new resolver with the given endpoint URL template.
    pub fn new(endpoint: impl Into<String>) -> Self {
        Self {
            endpoint: endpoint.into(),
            client: reqwest::Client::new(),
            headers: HashMap::new(),
        }
    }

    /// Create with a shared `reqwest::Client` for connection pooling.
    pub fn with_client(endpoint: impl Into<String>, client: reqwest::Client) -> Self {
        Self {
            endpoint: endpoint.into(),
            client,
            headers: HashMap::new(),
        }
    }

    /// Add custom headers sent on every check request.
    pub fn with_headers(mut self, headers: HashMap<String, String>) -> Self {
        self.headers = headers;
        self
    }

    /// Returns the configured endpoint URL template.
    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }
}

impl HotswapResolver for HttpResolver {
    fn check(
        &self,
        ctx: &CheckContext,
    ) -> Pin<Box<dyn Future<Output = Result<Option<HotswapManifest>>> + Send>> {
        let base = ctx.endpoint_override.as_deref().unwrap_or(&self.endpoint);
        let raw = base.replace("{{current_sequence}}", &ctx.current_sequence.to_string());
        let mut parsed =
            Url::parse(&raw).map_err(|e| Error::Config(format!("invalid endpoint URL: {}", e)));
        if let Ok(ref mut u) = parsed {
            u.query_pairs_mut()
                .append_pair("binary_version", &ctx.binary_version)
                .append_pair("platform", ctx.platform)
                .append_pair("arch", ctx.arch);
            if let Some(ref channel) = ctx.channel {
                u.query_pairs_mut().append_pair("channel", channel);
            }
        }
        let url = parsed;
        let client = self.client.clone();
        // Merge: init-time headers as base, runtime headers override.
        let mut headers = self.headers.clone();
        headers.extend(ctx.headers.clone());

        Box::pin(async move {
            let url = url?;
            log::info!("[hotswap] Checking for update at: {}", url);

            let mut req = client
                .get(url.as_str())
                .timeout(std::time::Duration::from_secs(15));

            for (key, value) in &headers {
                req = req.header(key.as_str(), value.as_str());
            }

            let response = req
                .send()
                .await
                .map_err(|e| Error::Network(e.to_string()))?;

            if response.status().as_u16() == 204 {
                log::info!("[hotswap] No update available (204)");
                return Ok(None);
            }

            if !response.status().is_success() {
                return Err(Error::Http {
                    status: response.status().as_u16(),
                    message: "update check failed".into(),
                });
            }

            let manifest: HotswapManifest = response
                .json()
                .await
                .map_err(|e| Error::InvalidManifest(e.to_string()))?;

            Ok(Some(manifest))
        })
    }
}

/// Static file resolver that reads a manifest from a local path or URL.
///
/// Useful for simple setups without a dynamic server. The manifest is
/// fetched from the URL (or read from a local file) and compared against
/// the current sequence.
pub struct StaticFileResolver {
    source: String,
    client: reqwest::Client,
}

impl StaticFileResolver {
    /// Create a new resolver with the given source path or URL.
    pub fn new(source: impl Into<String>) -> Self {
        Self {
            source: source.into(),
            client: reqwest::Client::new(),
        }
    }

    /// Create with a shared `reqwest::Client`.
    pub fn with_client(source: impl Into<String>, client: reqwest::Client) -> Self {
        Self {
            source: source.into(),
            client,
        }
    }

    /// Returns the configured source path/URL.
    pub fn source(&self) -> &str {
        &self.source
    }
}

impl HotswapResolver for StaticFileResolver {
    fn check(
        &self,
        ctx: &CheckContext,
    ) -> Pin<Box<dyn Future<Output = Result<Option<HotswapManifest>>> + Send>> {
        let source = self.source.clone();
        let client = self.client.clone();
        let current_sequence = ctx.current_sequence;

        Box::pin(async move {
            let content = if source.starts_with("http://") || source.starts_with("https://") {
                client
                    .get(&source)
                    .timeout(std::time::Duration::from_secs(15))
                    .send()
                    .await
                    .map_err(|e| Error::Network(e.to_string()))?
                    .text()
                    .await
                    .map_err(|e| Error::Network(e.to_string()))?
            } else {
                tokio::fs::read_to_string(&source)
                    .await
                    .map_err(Error::Io)?
            };

            let manifest: HotswapManifest = serde_json::from_str(&content)
                .map_err(|e| Error::InvalidManifest(e.to_string()))?;

            if manifest.sequence <= current_sequence {
                return Ok(None);
            }

            Ok(Some(manifest))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn test_ctx(seq: u64) -> CheckContext {
        CheckContext {
            current_sequence: seq,
            binary_version: "1.0.0".into(),
            platform: "macos",
            arch: "aarch64",
            channel: None,
            headers: HashMap::new(),
            endpoint_override: None,
        }
    }

    fn sample_manifest_json(sequence: u64) -> String {
        serde_json::json!({
            "version": format!("1.0.0-ota.{}", sequence),
            "sequence": sequence,
            "url": "https://cdn.example.com/ota/bundle.tar.gz",
            "signature": "untrusted comment: test\nRUTl2E==",
            "min_binary_version": "1.0.0",
            "notes": "Test release",
            "pub_date": "2026-04-05T00:00:00Z"
        })
        .to_string()
    }

    #[tokio::test]
    async fn test_static_file_resolver_update_available() {
        let tmp = TempDir::new().unwrap();
        let manifest_path = tmp.path().join("latest.json");
        fs::write(&manifest_path, sample_manifest_json(5)).unwrap();

        let resolver = StaticFileResolver::new(manifest_path.to_string_lossy().to_string());
        let result = resolver.check(&test_ctx(3)).await.unwrap();

        assert!(result.is_some());
        let manifest = result.unwrap();
        assert_eq!(manifest.sequence, 5);
        assert_eq!(manifest.version, "1.0.0-ota.5");
    }

    #[tokio::test]
    async fn test_static_file_resolver_no_update_same_sequence() {
        let tmp = TempDir::new().unwrap();
        let manifest_path = tmp.path().join("latest.json");
        fs::write(&manifest_path, sample_manifest_json(5)).unwrap();

        let resolver = StaticFileResolver::new(manifest_path.to_string_lossy().to_string());
        assert!(resolver.check(&test_ctx(5)).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_static_file_resolver_no_update_higher_sequence() {
        let tmp = TempDir::new().unwrap();
        let manifest_path = tmp.path().join("latest.json");
        fs::write(&manifest_path, sample_manifest_json(3)).unwrap();

        let resolver = StaticFileResolver::new(manifest_path.to_string_lossy().to_string());
        assert!(resolver.check(&test_ctx(10)).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_static_file_resolver_missing_file() {
        let resolver = StaticFileResolver::new("/nonexistent/path/manifest.json");
        assert!(resolver.check(&test_ctx(0)).await.is_err());
    }

    #[tokio::test]
    async fn test_static_file_resolver_invalid_json() {
        let tmp = TempDir::new().unwrap();
        let manifest_path = tmp.path().join("latest.json");
        fs::write(&manifest_path, "not json at all").unwrap();

        let resolver = StaticFileResolver::new(manifest_path.to_string_lossy().to_string());
        assert!(resolver.check(&test_ctx(0)).await.is_err());
    }

    #[tokio::test]
    async fn test_static_file_resolver_minimal_manifest() {
        let tmp = TempDir::new().unwrap();
        let manifest_path = tmp.path().join("latest.json");
        let json = serde_json::json!({
            "version": "2.0.0",
            "sequence": 1,
            "url": "https://cdn.example.com/bundle.tar.gz",
            "signature": "sig",
            "min_binary_version": "1.0.0"
        })
        .to_string();
        fs::write(&manifest_path, json).unwrap();

        let resolver = StaticFileResolver::new(manifest_path.to_string_lossy().to_string());
        let manifest = resolver.check(&test_ctx(0)).await.unwrap().unwrap();
        assert_eq!(manifest.version, "2.0.0");
        assert!(manifest.notes.is_none());
        assert!(manifest.mandatory.is_none());
        assert!(manifest.bundle_size.is_none());
    }

    #[test]
    fn test_http_resolver_url_substitution() {
        let resolver = HttpResolver::new("https://example.com/ota/{{current_sequence}}");
        let url = resolver
            .endpoint()
            .replace("{{current_sequence}}", &42.to_string());
        assert_eq!(url, "https://example.com/ota/42");
    }

    #[tokio::test]
    async fn test_manifest_with_mandatory_and_size() {
        let tmp = TempDir::new().unwrap();
        let manifest_path = tmp.path().join("latest.json");
        let json = serde_json::json!({
            "version": "1.0.1",
            "sequence": 5,
            "url": "https://cdn.example.com/bundle.tar.gz",
            "signature": "sig",
            "min_binary_version": "1.0.0",
            "mandatory": true,
            "bundle_size": 5242880
        })
        .to_string();
        fs::write(&manifest_path, json).unwrap();

        let resolver = StaticFileResolver::new(manifest_path.to_string_lossy().to_string());
        let manifest = resolver.check(&test_ctx(0)).await.unwrap().unwrap();
        assert_eq!(manifest.mandatory, Some(true));
        assert_eq!(manifest.bundle_size, Some(5242880));
    }

    #[tokio::test]
    async fn test_manifest_without_optional_fields_defaults_to_none() {
        let tmp = TempDir::new().unwrap();
        let manifest_path = tmp.path().join("latest.json");
        let json = serde_json::json!({
            "version": "1.0.1",
            "sequence": 1,
            "url": "https://cdn.example.com/bundle.tar.gz",
            "signature": "sig",
            "min_binary_version": "1.0.0"
        })
        .to_string();
        fs::write(&manifest_path, json).unwrap();

        let resolver = StaticFileResolver::new(manifest_path.to_string_lossy().to_string());
        let manifest = resolver.check(&test_ctx(0)).await.unwrap().unwrap();
        assert!(manifest.mandatory.is_none());
        assert!(manifest.bundle_size.is_none());
        assert!(manifest.notes.is_none());
        assert!(manifest.pub_date.is_none());
    }

    #[test]
    fn test_check_context_with_channel() {
        let ctx = CheckContext {
            current_sequence: 5,
            binary_version: "1.0.0".into(),
            platform: "linux",
            arch: "x86_64",
            channel: Some("beta".into()),
            headers: HashMap::new(),
            endpoint_override: None,
        };
        assert_eq!(ctx.channel, Some("beta".to_string()));
        assert_eq!(ctx.platform, "linux");
        assert_eq!(ctx.arch, "x86_64");
    }

    #[test]
    fn test_http_resolver_with_headers() {
        let mut headers = HashMap::new();
        headers.insert("Authorization".into(), "Bearer token123".into());
        let resolver = HttpResolver::new("https://example.com/ota").with_headers(headers);
        assert_eq!(resolver.endpoint(), "https://example.com/ota");
    }

    // ── HttpResolver URL building ──────────────────────────────────────

    #[test]
    fn test_http_resolver_url_sequence_zero() {
        let endpoint = "https://example.com/ota/{{current_sequence}}/check";
        let replaced = endpoint.replace("{{current_sequence}}", &0u64.to_string());
        assert_eq!(replaced, "https://example.com/ota/0/check");
    }

    #[test]
    fn test_http_resolver_url_sequence_large() {
        let endpoint = "https://example.com/ota/{{current_sequence}}";
        let replaced = endpoint.replace("{{current_sequence}}", &999999u64.to_string());
        assert_eq!(replaced, "https://example.com/ota/999999");
    }

    #[test]
    fn test_http_resolver_endpoint_override_used() {
        let resolver = HttpResolver::new("https://original.example.com/ota");
        let ctx = CheckContext {
            current_sequence: 10,
            binary_version: "2.0.0".into(),
            platform: "windows",
            arch: "x86_64",
            channel: None,
            headers: HashMap::new(),
            endpoint_override: Some("https://override.example.com/v2/{{current_sequence}}".into()),
        };
        let base = ctx
            .endpoint_override
            .as_deref()
            .unwrap_or(resolver.endpoint());
        let raw = base.replace("{{current_sequence}}", &ctx.current_sequence.to_string());
        assert!(raw.contains("override.example.com"));
        assert!(raw.contains("10"));
        assert!(!raw.contains("original.example.com"));
    }

    // ── HttpResolver header merging ────────────────────────────────────

    #[test]
    fn test_http_resolver_runtime_headers_override_init() {
        let mut init_headers = HashMap::new();
        init_headers.insert("Authorization".into(), "Bearer old".into());
        init_headers.insert("X-Keep".into(), "kept".into());
        let resolver = HttpResolver::new("https://example.com/ota").with_headers(init_headers);

        let mut runtime_headers = HashMap::new();
        runtime_headers.insert("Authorization".into(), "Bearer new".into());

        let mut merged = resolver.headers.clone();
        merged.extend(runtime_headers);

        assert_eq!(merged.get("Authorization").unwrap(), "Bearer new");
        assert_eq!(merged.get("X-Keep").unwrap(), "kept");
    }

    // ── StaticFileResolver edge cases ──────────────────────────────────

    #[tokio::test]
    async fn test_static_file_resolver_empty_json_object_errors() {
        let tmp = TempDir::new().unwrap();
        let manifest_path = tmp.path().join("latest.json");
        fs::write(&manifest_path, "{}").unwrap();

        let resolver = StaticFileResolver::new(manifest_path.to_string_lossy().to_string());
        let result = resolver.check(&test_ctx(0)).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_static_file_resolver_extra_unknown_fields_ok() {
        let tmp = TempDir::new().unwrap();
        let manifest_path = tmp.path().join("latest.json");
        let json = serde_json::json!({
            "version": "3.0.0",
            "sequence": 99,
            "url": "https://cdn.example.com/bundle.tar.gz",
            "signature": "sig",
            "min_binary_version": "1.0.0",
            "some_future_field": "hello",
            "another_unknown": 42
        })
        .to_string();
        fs::write(&manifest_path, json).unwrap();

        let resolver = StaticFileResolver::new(manifest_path.to_string_lossy().to_string());
        let result = resolver.check(&test_ctx(0)).await.unwrap();
        assert!(result.is_some());
        assert_eq!(result.unwrap().sequence, 99);
    }
}
