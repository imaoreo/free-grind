use serde::{Deserialize, Serialize};

/// The update manifest describing an available bundle.
///
/// This is the JSON shape returned by your update endpoint.
/// All fields except `notes`, `pub_date`, `mandatory`, and `bundle_size`
/// are required.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub struct HotswapManifest {
    /// Display version (e.g. "0.0.14-ota.2"). For UI only, never compared.
    pub version: String,
    /// Monotonic sequence counter. Higher = newer. This is what gets compared.
    pub sequence: u64,
    /// HTTPS URL to the asset bundle (`.tar.gz` or `.zip`).
    pub url: String,
    /// Minisign signature (raw `.sig` file contents or base64-encoded).
    pub signature: String,
    /// Minimum binary version required to run this frontend.
    pub min_binary_version: String,
    /// Optional release notes.
    #[serde(default)]
    pub notes: Option<String>,
    /// Optional publication date (RFC 3339).
    #[serde(default)]
    pub pub_date: Option<String>,
    /// Whether this update must be applied (e.g. security patch).
    /// The plugin does not enforce this — it's exposed so the frontend
    /// can decide whether to prompt or auto-apply.
    #[serde(default)]
    pub mandatory: Option<bool>,
    /// Bundle size in bytes. Exposed in check results so the frontend
    /// can warn users on metered connections before downloading.
    #[serde(default)]
    pub bundle_size: Option<u64>,
}

/// Persisted metadata about the currently active version.
/// Stored as `{version_dir}/hotswap-meta.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub struct HotswapMeta {
    /// Display version string.
    pub version: String,
    /// Monotonic sequence counter.
    pub sequence: u64,
    /// The minimum binary version this version requires.
    pub min_binary_version: String,
    /// Whether `notifyReady()` was called for this version.
    pub confirmed: bool,
    /// Number of app launches where this version was active but `notifyReady()`
    /// was not called. Used by [`ConfirmationPolicy`](crate::policy::ConfirmationPolicy)
    /// to decide whether to grant a grace period or trigger rollback.
    #[serde(default)]
    pub unconfirmed_launch_count: u32,
}

/// Result returned to the frontend from `hotswap_check`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub struct HotswapCheckResult {
    /// Whether an update is available.
    pub available: bool,
    /// Version string of the available update.
    pub version: Option<String>,
    /// Sequence number of the available update.
    pub sequence: Option<u64>,
    /// Release notes, if provided.
    pub notes: Option<String>,
    /// Whether this update is mandatory (e.g. security patch).
    pub mandatory: Option<bool>,
    /// Bundle size in bytes, if provided by the server.
    pub bundle_size: Option<u64>,
}

/// Result returned to the frontend from `hotswap_current_version`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub struct HotswapVersionInfo {
    /// The active display version, or null if using embedded assets.
    pub version: Option<String>,
    /// The active sequence, or 0 if using embedded assets.
    pub sequence: u64,
    /// The binary version compiled into the app.
    pub binary_version: String,
    /// Whether hotswap assets are currently being served.
    pub active: bool,
}
