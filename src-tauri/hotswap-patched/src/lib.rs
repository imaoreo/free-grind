//! # tauri-plugin-hotswap
//!
//! Hot-swap frontend assets at runtime without rebuilding the binary.
//!
//! This Tauri v2 plugin swaps the embedded asset provider at startup via
//! `Context::set_assets()`. The WebView keeps loading from `tauri://localhost` —
//! the swap is transparent. If no cached bundle is available, embedded assets
//! are served as usual.
//!
//! ## Quick start
//!
//! ```json
//! // tauri.conf.json
//! {
//!   "plugins": {
//!     "hotswap": {
//!       "endpoint": "https://example.com/api/ota/{{current_sequence}}",
//!       "pubkey": "<YOUR_MINISIGN_PUBKEY>"
//!     }
//!   }
//! }
//! ```
//!
//! ```rust,ignore
//! let context = tauri::generate_context!();
//! let (plugin, context) = tauri_plugin_hotswap::init(context)
//!     .expect("failed to initialize hotswap plugin");
//!
//! tauri::Builder::default()
//!     .plugin(plugin)
//!     .run(context)
//!     .expect("error running app");
//! ```

#![warn(missing_docs)]

mod assets;
mod commands;
/// Error types returned by the plugin.
pub mod error;
/// Manifest and response types exchanged between client and server.
pub mod manifest;
/// Configurable policy traits for OTA update lifecycle decisions.
pub mod policy;
/// Resolver trait and built-in implementations for update checking.
pub mod resolver;
mod updater;

use std::collections::HashMap;
use std::fmt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use assets::{AssetDirHandle, EmptyAssets};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

// Re-export all public types at the crate root for convenience.
pub use assets::HotswapAssets;
pub use error::Error;
pub use manifest::{HotswapCheckResult, HotswapManifest, HotswapMeta, HotswapVersionInfo};
pub use policy::{
    BinaryCachePolicy, BinaryCachePolicyKind, ConfirmationDecision, ConfirmationPolicy,
    ConfirmationPolicyKind, RetentionConfig, RetentionPolicy, RollbackPolicy, RollbackPolicyKind,
};
pub use resolver::{CheckContext, HotswapResolver, HttpResolver, StaticFileResolver};
pub use updater::{DownloadProgress, LifecycleEvent};

/// Plugin instance type returned by initialization helpers.
///
/// The plugin builder intentionally uses `serde_json::Value` for the plugin
/// API config type so Tauri accepts `plugins.hotswap` as `null`, `{}`, or a
/// full config object across all initialization paths.
pub type HotswapPlugin<R> = TauriPlugin<R, Value>;

/// Configuration that can be specified in `tauri.conf.json` under
/// `plugins.hotswap`, or passed programmatically.
///
/// # Example (tauri.conf.json)
///
/// ```json
/// {
///   "plugins": {
///     "hotswap": {
///       "endpoint": "https://example.com/api/ota/{{current_sequence}}",
///       "pubkey": "<YOUR_MINISIGN_PUBKEY>",
///       "channel": "production",
///       "headers": { "Authorization": "Bearer <token>" }
///     }
///   }
/// }
/// ```
#[derive(Debug, Clone, Deserialize, Serialize)]
#[non_exhaustive]
pub struct HotswapConfig {
    /// The update check endpoint URL.
    /// Use `{{current_sequence}}` as a placeholder.
    pub endpoint: Option<String>,

    /// The minisign public key (RW... base64 line).
    pub pubkey: String,

    /// Maximum allowed bundle size in bytes. Default: 512 MB.
    #[serde(default)]
    pub max_bundle_size: Option<u64>,

    /// Whether to reject non-HTTPS URLs. Default: true.
    #[serde(default)]
    pub require_https: Option<bool>,

    /// Binary cache policy. Controls whether cached OTA bundles are discarded
    /// when the binary version changes.
    /// Options: `keep_compatible`, `discard_on_upgrade`, `never_discard`.
    #[serde(default)]
    pub binary_cache_policy: Option<BinaryCachePolicyKind>,

    /// Confirmation policy. Controls what happens on startup if the current
    /// OTA version hasn't been confirmed via `notifyReady()`.
    /// Options: `single_launch` (default), `{ "grace_period": { "max_unconfirmed_launches": N } }`.
    #[serde(default)]
    pub confirmation_policy: Option<ConfirmationPolicyKind>,

    /// Rollback policy. Controls which version to roll back to.
    /// Options: `latest_confirmed` (default), `immediate_previous_confirmed`, `embedded_only`.
    #[serde(default)]
    pub rollback_policy: Option<RollbackPolicyKind>,

    /// Maximum number of OTA versions to retain on disk. Default: 2, min: 2.
    /// Includes current and rollback candidate.
    #[serde(default)]
    pub max_retained_versions: Option<u32>,

    /// Custom HTTP headers sent on check and download requests.
    /// Use for auth tokens, API keys, etc.
    #[serde(default)]
    pub headers: Option<HashMap<String, String>>,

    /// Update channel (e.g. "production", "staging", "beta").
    /// Sent as a query param on check requests. Can be changed at
    /// runtime via `configure()`.
    #[serde(default)]
    pub channel: Option<String>,

    /// Maximum download retry attempts with exponential backoff. Default: 3.
    #[serde(default)]
    pub max_retries: Option<u32>,
}

impl HotswapConfig {
    /// Create a new config with the given public key and sensible defaults.
    pub fn new(pubkey: impl Into<String>) -> Self {
        Self {
            endpoint: None,
            pubkey: pubkey.into(),
            max_bundle_size: None,
            require_https: None,
            binary_cache_policy: None,
            confirmation_policy: None,
            rollback_policy: None,
            max_retained_versions: None,
            headers: None,
            channel: None,
            max_retries: None,
        }
    }

    /// Set the update check endpoint URL.
    pub fn endpoint(mut self, url: impl Into<String>) -> Self {
        self.endpoint = Some(url.into());
        self
    }

    /// Set the update channel.
    pub fn channel(mut self, channel: impl Into<String>) -> Self {
        self.channel = Some(channel.into());
        self
    }

    /// Add a custom header sent on every request.
    pub fn header(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers
            .get_or_insert_with(HashMap::new)
            .insert(key.into(), value.into());
        self
    }
}

/// Plugin state managed by Tauri, accessible from commands.
pub(crate) struct HotswapState {
    pub(crate) resolver: Box<dyn HotswapResolver>,
    pub(crate) pubkey: String,
    pub(crate) binary_version: String,
    pub(crate) base_dir: PathBuf,
    pub(crate) max_bundle_size: u64,
    pub(crate) require_https: bool,
    pub(crate) max_retries: u32,
    pub(crate) http_client: reqwest::Client,
    pub(crate) custom_headers: Mutex<HashMap<String, String>>,
    pub(crate) channel: Mutex<Option<String>>,
    pub(crate) endpoint_override: Mutex<Option<String>>,
    pub(crate) current_sequence: Mutex<u64>,
    pub(crate) current_version: Mutex<Option<String>>,
    pub(crate) pending_manifest: Mutex<Option<HotswapManifest>>,
    /// Shared handle to the live asset directory used by `HotswapAssets`.
    /// Updated by apply/activate/rollback so `window.location.reload()`
    /// immediately serves the new assets without an app restart.
    pub(crate) live_asset_dir: AssetDirHandle,
    // Policy traits
    pub(crate) rollback_policy: Box<dyn RollbackPolicy>,
    pub(crate) retention_policy: Box<dyn RetentionPolicy>,
}

impl fmt::Debug for HotswapState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("HotswapState")
            .field("binary_version", &self.binary_version)
            .field("base_dir", &self.base_dir)
            .field("max_bundle_size", &self.max_bundle_size)
            .field("require_https", &self.require_https)
            .field("max_retries", &self.max_retries)
            .field("channel", &self.channel)
            .field("current_sequence", &self.current_sequence)
            .field("current_version", &self.current_version)
            .finish_non_exhaustive()
    }
}

/// Initialize the plugin by reading config from `tauri.conf.json`.
///
/// Returns an error if the config is missing, invalid, or the endpoint
/// URL violates `require_https`.
pub fn init<R: Runtime>(
    context: tauri::Context<R>,
) -> Result<(HotswapPlugin<R>, tauri::Context<R>), Error> {
    let config: HotswapConfig = context
        .config()
        .plugins
        .0
        .get("hotswap")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .ok_or_else(|| {
            Error::Config("missing or invalid 'plugins.hotswap' in tauri.conf.json".into())
        })?;

    let endpoint = config
        .endpoint
        .clone()
        .ok_or_else(|| Error::Config("'endpoint' is required in plugins.hotswap config".into()))?;

    let mut resolver = HttpResolver::new(endpoint);
    if let Some(ref headers) = config.headers {
        resolver = resolver.with_headers(headers.clone());
    }

    build_plugin(context, Box::new(resolver), config, None)
}

/// Initialize with explicit config (no tauri.conf.json needed).
///
/// Returns an error if the endpoint URL violates `require_https`.
pub fn init_with_config<R: Runtime>(
    context: tauri::Context<R>,
    config: HotswapConfig,
) -> Result<(HotswapPlugin<R>, tauri::Context<R>), Error> {
    let endpoint = config
        .endpoint
        .clone()
        .ok_or_else(|| Error::Config("'endpoint' is required in HotswapConfig".into()))?;

    let mut resolver = HttpResolver::new(endpoint);
    if let Some(ref headers) = config.headers {
        resolver = resolver.with_headers(headers.clone());
    }

    build_plugin(context, Box::new(resolver), config, None)
}

/// Builder for advanced usage with a custom resolver.
///
/// # Example
///
/// ```rust,ignore
/// let (plugin, context) = tauri_plugin_hotswap::HotswapBuilder::new("<YOUR_MINISIGN_PUBKEY>")
///     .resolver(tauri_plugin_hotswap::StaticFileResolver::new(
///         "https://cdn.example.com/ota/latest.json",
///     ))
///     .channel("production")
///     .header("Authorization", "Bearer <token>")
///     .build(context)
///     .expect("failed to init hotswap");
/// ```
pub struct HotswapBuilder {
    pubkey: String,
    resolver: Option<Box<dyn HotswapResolver>>,
    max_bundle_size: u64,
    require_https: bool,
    binary_cache_policy: Box<dyn BinaryCachePolicy>,
    confirmation_policy: Box<dyn ConfirmationPolicy>,
    rollback_policy: Box<dyn RollbackPolicy>,
    retention_policy: Box<dyn RetentionPolicy>,
    headers: HashMap<String, String>,
    channel: Option<String>,
    max_retries: u32,
}

impl HotswapBuilder {
    /// Create a new builder with the given minisign public key.
    pub fn new(pubkey: impl Into<String>) -> Self {
        Self {
            pubkey: pubkey.into(),
            resolver: None,
            max_bundle_size: updater::DEFAULT_MAX_BUNDLE_SIZE,
            require_https: true,
            binary_cache_policy: Box::new(BinaryCachePolicyKind::DiscardOnUpgrade),
            confirmation_policy: Box::new(ConfirmationPolicyKind::default()),
            rollback_policy: Box::new(RollbackPolicyKind::default()),
            retention_policy: Box::new(RetentionConfig::default()),
            headers: HashMap::new(),
            channel: None,
            max_retries: updater::DEFAULT_MAX_RETRIES,
        }
    }

    /// Set the update resolver.
    pub fn resolver(mut self, resolver: impl HotswapResolver) -> Self {
        self.resolver = Some(Box::new(resolver));
        self
    }

    /// Set the maximum allowed bundle size in bytes. Default: 512 MB.
    pub fn max_bundle_size(mut self, bytes: u64) -> Self {
        self.max_bundle_size = bytes;
        self
    }

    /// Whether to reject non-HTTPS URLs. Default: true.
    pub fn require_https(mut self, require: bool) -> Self {
        self.require_https = require;
        self
    }

    /// Set the binary cache policy. Default: `DiscardOnUpgrade`.
    /// Accepts any type implementing [`BinaryCachePolicy`], including
    /// the built-in [`BinaryCachePolicyKind`] enum or a custom implementation.
    pub fn binary_cache_policy(mut self, policy: impl BinaryCachePolicy) -> Self {
        self.binary_cache_policy = Box::new(policy);
        self
    }

    /// Set the confirmation policy. Default: `SingleLaunch`.
    /// Accepts any type implementing [`ConfirmationPolicy`], including
    /// the built-in [`ConfirmationPolicyKind`] enum or a custom implementation.
    pub fn confirmation_policy(mut self, policy: impl ConfirmationPolicy) -> Self {
        self.confirmation_policy = Box::new(policy);
        self
    }

    /// Set the rollback policy. Default: `LatestConfirmed`.
    /// Accepts any type implementing [`RollbackPolicy`], including
    /// the built-in [`RollbackPolicyKind`] enum or a custom implementation.
    pub fn rollback_policy(mut self, policy: impl RollbackPolicy) -> Self {
        self.rollback_policy = Box::new(policy);
        self
    }

    /// Set the retention policy. Default: `RetentionConfig { max_retained_versions: 2 }`.
    /// Accepts any type implementing [`RetentionPolicy`], including
    /// the built-in [`RetentionConfig`] or a custom implementation.
    pub fn retention_policy(mut self, policy: impl RetentionPolicy) -> Self {
        self.retention_policy = Box::new(policy);
        self
    }

    /// Set the maximum number of retained versions. Default: 2, min: 2.
    /// Shorthand for `retention_policy(RetentionConfig { max_retained_versions: count })`.
    pub fn max_retained_versions(mut self, count: u32) -> Self {
        self.retention_policy = Box::new(RetentionConfig {
            max_retained_versions: count,
        });
        self
    }

    /// Add a custom header sent on download requests.
    pub fn header(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.insert(key.into(), value.into());
        self
    }

    /// Set the update channel.
    pub fn channel(mut self, channel: impl Into<String>) -> Self {
        self.channel = Some(channel.into());
        self
    }

    /// Set the maximum download retry attempts. Default: 3.
    pub fn max_retries(mut self, retries: u32) -> Self {
        self.max_retries = retries;
        self
    }

    /// Build the plugin. Returns an error if configuration is invalid.
    pub fn build<R: Runtime>(
        self,
        context: tauri::Context<R>,
    ) -> Result<(HotswapPlugin<R>, tauri::Context<R>), Error> {
        let resolver = self
            .resolver
            .ok_or_else(|| Error::Config("a resolver must be set via .resolver()".into()))?;

        let config = HotswapConfig {
            endpoint: None,
            pubkey: self.pubkey,
            max_bundle_size: Some(self.max_bundle_size),
            require_https: Some(self.require_https),
            binary_cache_policy: None,
            confirmation_policy: None,
            rollback_policy: None,
            max_retained_versions: None,
            headers: Some(self.headers),
            channel: self.channel,
            max_retries: Some(self.max_retries),
        };

        let policies = ResolvedPolicies {
            binary_cache: self.binary_cache_policy,
            confirmation: self.confirmation_policy,
            rollback: self.rollback_policy,
            retention: self.retention_policy,
        };

        build_plugin(context, resolver, config, Some(policies))
    }
}

/// Pre-resolved boxed policies (from builder path).
struct ResolvedPolicies {
    binary_cache: Box<dyn BinaryCachePolicy>,
    confirmation: Box<dyn ConfirmationPolicy>,
    rollback: Box<dyn RollbackPolicy>,
    retention: Box<dyn RetentionPolicy>,
}

fn build_plugin<R: Runtime>(
    mut context: tauri::Context<R>,
    resolver: Box<dyn HotswapResolver>,
    config: HotswapConfig,
    override_policies: Option<ResolvedPolicies>,
) -> Result<(HotswapPlugin<R>, tauri::Context<R>), Error> {
    let binary_version = context.config().version.clone().unwrap_or_default();
    let app_id = context.config().identifier.clone();
    let base_dir = resolve_base_dir(&app_id);
    let max_bundle_size = config
        .max_bundle_size
        .unwrap_or(updater::DEFAULT_MAX_BUNDLE_SIZE);
    let require_https = config.require_https.unwrap_or(true);
    let custom_headers = config.headers.unwrap_or_default();
    let channel = config.channel.clone();
    let max_retries = config.max_retries.unwrap_or(updater::DEFAULT_MAX_RETRIES);

    // Resolve policies: builder overrides take precedence over config
    let policies = override_policies.unwrap_or_else(|| ResolvedPolicies {
        binary_cache: Box::new(
            config
                .binary_cache_policy
                .unwrap_or(BinaryCachePolicyKind::DiscardOnUpgrade),
        ),
        confirmation: Box::new(config.confirmation_policy.unwrap_or_default()),
        rollback: Box::new(config.rollback_policy.unwrap_or_default()),
        retention: Box::new(RetentionConfig {
            max_retained_versions: config.max_retained_versions.unwrap_or(2),
        }),
    });

    if binary_version.is_empty() {
        log::warn!(
            "[hotswap] No 'version' set in tauri.conf.json. \
             Binary compatibility checks will not work correctly."
        );
    }

    if require_https {
        if let Some(ref endpoint) = config.endpoint {
            if !endpoint.starts_with("https://") {
                return Err(Error::InsecureUrl(endpoint.clone()));
            }
        }
    }

    let _ = std::fs::create_dir_all(&base_dir);

    let ota_dir = updater::check_compatibility(
        &base_dir,
        &binary_version,
        &*policies.binary_cache,
        &*policies.confirmation,
        &*policies.rollback,
    );
    let meta = ota_dir.as_ref().and_then(|d| updater::read_meta(d));
    let current_sequence = meta.as_ref().map(|m| m.sequence).unwrap_or(0);
    let current_version = meta.map(|m| m.version);

    // Shared handle: HotswapAssets reads from this on every request,
    // and commands (apply/activate/rollback) update it at runtime.
    let live_asset_dir: AssetDirHandle = Arc::new(RwLock::new(ota_dir));

    let embedded: Box<dyn tauri::Assets<R>> =
        std::mem::replace(&mut context.assets, Box::new(EmptyAssets));
    context.assets = Box::new(HotswapAssets::new(embedded, Arc::clone(&live_asset_dir)));

    let pubkey = config.pubkey.clone();
    let binary_version_clone = binary_version.clone();
    let base_dir_clone = base_dir.clone();
    let current_sequence_clone = current_sequence;
    let current_version_clone = current_version.clone();
    let http_client = reqwest::Client::new();

    let plugin = Builder::<R, Value>::new("hotswap")
        .invoke_handler(tauri::generate_handler![
            commands::hotswap_check,
            commands::hotswap_apply,
            commands::hotswap_download,
            commands::hotswap_activate,
            commands::hotswap_rollback,
            commands::hotswap_current_version,
            commands::hotswap_notify_ready,
            commands::hotswap_configure,
            commands::hotswap_get_config,
        ])
        .setup(move |app, _api| {
            app.manage(HotswapState {
                resolver,
                pubkey,
                binary_version: binary_version_clone,
                base_dir: base_dir_clone,
                max_bundle_size,
                require_https,
                max_retries,
                http_client,
                custom_headers: Mutex::new(custom_headers),
                channel: Mutex::new(channel),
                endpoint_override: Mutex::new(None),
                current_sequence: Mutex::new(current_sequence_clone),
                current_version: Mutex::new(current_version_clone),
                pending_manifest: Mutex::new(None),
                live_asset_dir,
                rollback_policy: policies.rollback,
                retention_policy: policies.retention,
            });
            Ok(())
        })
        .build();

    Ok((plugin, context))
}

fn resolve_base_dir(app_id: &str) -> PathBuf {
    #[cfg(not(target_os = "android"))]
    {
        let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
        base.join(app_id).join("hotswap")
    }
    #[cfg(target_os = "android")]
    {
        // On Android the data directory uses the Java package name which
        // cannot contain hyphens — Tauri converts them to underscores.
        let android_pkg = app_id.replace('-', "_");
        PathBuf::from("/data/data")
            .join(android_pkg)
            .join("files/hotswap")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression: `HotswapConfig` must deserialize from a full JSON object.
    /// This is the Option A path (config in tauri.conf.json).
    #[test]
    fn config_deserializes_from_json_object() {
        let json = serde_json::json!({
            "endpoint": "https://example.com/ota/{{current_sequence}}",
            "pubkey": "RWtest",
            "channel": "beta",
            "binary_cache_policy": "keep_compatible",
            "confirmation_policy": "single_launch",
            "rollback_policy": "latest_confirmed",
            "max_retained_versions": 3
        });
        let config: HotswapConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.pubkey, "RWtest");
        assert_eq!(
            config.binary_cache_policy,
            Some(BinaryCachePolicyKind::KeepCompatible)
        );
        assert_eq!(config.max_retained_versions, Some(3));
    }

    /// Regression: `serde_json::Value` (the plugin builder config type)
    /// must deserialize from `null`. This is the Option B/C path when
    /// `plugins.hotswap` is absent from tauri.conf.json.
    #[test]
    fn value_deserializes_from_null() {
        let result: serde_json::Value = serde_json::from_str("null").unwrap();
        assert!(result.is_null());
    }

    /// Regression: `serde_json::Value` must deserialize from a JSON object.
    /// This is the Option A path on mobile where Tauri re-deserializes
    /// `plugins.hotswap` during `Builder::run()`.
    #[test]
    fn value_deserializes_from_object() {
        let json = r#"{"endpoint":"https://example.com","pubkey":"RWtest"}"#;
        let result: serde_json::Value = serde_json::from_str(json).unwrap();
        assert!(result.is_object());
    }

    /// Regression: `HotswapConfig` with only required fields.
    #[test]
    fn config_minimal() {
        let json = serde_json::json!({"pubkey": "RWtest"});
        let config: HotswapConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.pubkey, "RWtest");
        assert!(config.endpoint.is_none());
        assert!(config.binary_cache_policy.is_none());
        assert!(config.confirmation_policy.is_none());
        assert!(config.rollback_policy.is_none());
        assert!(config.max_retained_versions.is_none());
    }

    /// Regression: `HotswapConfig` with unknown future fields should not fail.
    #[test]
    fn config_ignores_unknown_fields() {
        let json = serde_json::json!({
            "pubkey": "RWtest",
            "some_future_field": true,
            "another_field": 42
        });
        // Should not error — serde default behavior is to ignore unknown fields
        let config: HotswapConfig = serde_json::from_value(json).unwrap();
        assert_eq!(config.pubkey, "RWtest");
    }
}
