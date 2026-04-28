/// Errors returned by the hotswap plugin.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum Error {
    /// Network request failed (check, download).
    #[error("network error: {0}")]
    Network(String),

    /// HTTP response indicated failure.
    #[error("HTTP {status}: {message}")]
    Http {
        /// HTTP status code.
        status: u16,
        /// Human-readable error message.
        message: String,
    },

    /// Downloaded bundle exceeds the configured maximum size.
    #[error("bundle too large: {size} bytes exceeds limit of {limit} bytes")]
    BundleTooLarge {
        /// Actual size (or Content-Length) in bytes.
        size: u64,
        /// Configured maximum in bytes.
        limit: u64,
    },

    /// Minisign signature verification failed.
    #[error("signature verification failed: {0}")]
    Signature(String),

    /// Archive extraction failed (corrupt archive, path traversal, etc).
    #[error("extraction failed: {0}")]
    Extraction(String),

    /// Manifest JSON could not be parsed.
    #[error("invalid manifest: {0}")]
    InvalidManifest(String),

    /// Semver parsing or comparison failed.
    #[error("version error: {0}")]
    Version(String),

    /// Plugin configuration is missing or invalid.
    #[error("configuration error: {0}")]
    Config(String),

    /// No pending update — `check` must be called before `apply`.
    #[error("no pending update — call check first")]
    NoPending,

    /// URL scheme is not HTTPS.
    #[error("insecure URL rejected: {0} (set require_https = false to allow)")]
    InsecureUrl(String),

    /// Filesystem I/O error.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// Serialization error.
    #[error("serialization error: {0}")]
    Serialization(String),

    /// Mutex was poisoned.
    #[error("internal state error: lock poisoned")]
    LockPoisoned,
}

// Tauri commands require serializable errors.
impl serde::Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Convenience alias for `Result<T, Error>`.
pub type Result<T> = std::result::Result<T, Error>;
