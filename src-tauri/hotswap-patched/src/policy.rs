//! Configurable policy traits for OTA update lifecycle decisions.
//!
//! Four traits govern how the plugin handles cached bundles at startup,
//! on rollback, and during cleanup. Each has built-in enum implementations
//! configurable via `tauri.conf.json`. Custom implementations can be
//! injected via [`HotswapBuilder`](crate::HotswapBuilder) using the
//! `binary_cache_policy()`, `confirmation_policy()`, `rollback_policy()`,
//! and `retention_policy()` setters, which accept any `impl Policy` type.
//!
//! # Safety invariants (not trait-pluggable)
//!
//! - Signature verification is always mandatory
//! - Archive path validation remains strict
//! - Atomic extraction/activation behavior is fixed
//! - The "binary too old" safety check (`binary < min_binary_version`) is
//!   hardcoded outside `BinaryCachePolicy` — no policy can override it

use crate::manifest::HotswapMeta;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

// ─── 1) BinaryCachePolicy ─────────────────────────────────────────────

/// Decides whether a cached OTA bundle should be discarded at startup
/// based on binary version changes.
///
/// The safety check (`current_binary < min_binary_version` → always discard)
/// is enforced **outside** this trait. This trait only governs the policy
/// decision for compatible binaries.
pub trait BinaryCachePolicy: Send + Sync + 'static {
    /// Return `true` to discard the cached bundle and fall back to embedded assets.
    ///
    /// `previous_binary` is `None` until a future release adds persistence
    /// of the previous binary version.
    fn should_discard(
        &self,
        current_binary: &Version,
        cached_meta: &HotswapMeta,
        previous_binary: Option<&Version>,
    ) -> bool;
}

/// Built-in binary cache policy variants, selectable via config.
///
/// # Config examples
///
/// ```json
/// { "binary_cache_policy": "keep_compatible" }
/// { "binary_cache_policy": "discard_on_upgrade" }
/// { "binary_cache_policy": "never_discard" }
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum BinaryCachePolicyKind {
    /// Keep the cache as long as the current binary satisfies `min_binary_version`.
    /// Recommended for most apps — opt in via `"binary_cache_policy": "keep_compatible"`.
    KeepCompatible,
    /// Discard when `current_binary > min_binary_version`.
    /// This is the default, preserving pre-0.0.2 semantics.
    ///
    /// Note: this detects "binary newer than min", not actual binary *changes*
    /// (e.g., rebuild at same version, downgrade). True change detection
    /// would require persisting the previous binary version (deferred).
    #[default]
    DiscardOnUpgrade,
    /// Never discard based on binary version. Only the safety check
    /// (`binary < min`) still applies.
    NeverDiscard,
}

impl BinaryCachePolicy for BinaryCachePolicyKind {
    fn should_discard(
        &self,
        current_binary: &Version,
        cached_meta: &HotswapMeta,
        _previous_binary: Option<&Version>,
    ) -> bool {
        match self {
            BinaryCachePolicyKind::KeepCompatible => false,
            BinaryCachePolicyKind::DiscardOnUpgrade => {
                if let Ok(required) = Version::parse(&cached_meta.min_binary_version) {
                    current_binary > &required
                } else {
                    false
                }
            }
            BinaryCachePolicyKind::NeverDiscard => false,
        }
    }
}

// ─── 2) ConfirmationPolicy ────────────────────────────────────────────

/// Decides what to do on startup if the current OTA version has not
/// been confirmed via `notifyReady()`.
///
/// The trait takes immutable `&HotswapMeta`. The caller handles counter
/// mutation (incrementing `unconfirmed_launch_count`, writing to disk).
pub trait ConfirmationPolicy: Send + Sync + 'static {
    /// Decide what to do with an unconfirmed OTA version at startup.
    fn on_startup_unconfirmed(&self, meta: &HotswapMeta) -> ConfirmationDecision;
}

/// Decision returned by [`ConfirmationPolicy::on_startup_unconfirmed`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub enum ConfirmationDecision {
    /// Keep the version for now. Caller increments `unconfirmed_launch_count`.
    KeepForNow,
    /// Trigger rollback immediately.
    RollbackNow,
}

/// Built-in confirmation policy variants.
///
/// # Config examples
///
/// ```json
/// { "confirmation_policy": "single_launch" }
/// { "confirmation_policy": { "grace_period": { "max_unconfirmed_launches": 3 } } }
/// ```
///
/// # Threshold semantics
///
/// Rollback when `unconfirmed_launch_count >= max_unconfirmed_launches`.
/// With `max=1` (default `SingleLaunch`), the first unconfirmed startup
/// triggers rollback — matching the pre-0.0.2 behavior.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ConfirmationPolicyKind {
    /// Rollback on first unconfirmed launch (pre-0.0.2 behavior).
    #[default]
    SingleLaunch,
    /// Allow up to N unconfirmed launches before rollback.
    GracePeriod {
        /// Number of unconfirmed launches allowed before rollback.
        /// `0` is treated the same as `SingleLaunch` (immediate rollback).
        max_unconfirmed_launches: u32,
    },
}

impl ConfirmationPolicy for ConfirmationPolicyKind {
    fn on_startup_unconfirmed(&self, meta: &HotswapMeta) -> ConfirmationDecision {
        match self {
            ConfirmationPolicyKind::SingleLaunch => ConfirmationDecision::RollbackNow,
            ConfirmationPolicyKind::GracePeriod {
                max_unconfirmed_launches,
            } => {
                if *max_unconfirmed_launches == 0
                    || meta.unconfirmed_launch_count >= *max_unconfirmed_launches
                {
                    ConfirmationDecision::RollbackNow
                } else {
                    ConfirmationDecision::KeepForNow
                }
            }
        }
    }
}

// ─── 3) RollbackPolicy ───────────────────────────────────────────────

/// Selects a rollback target from available confirmed versions.
pub trait RollbackPolicy: Send + Sync + 'static {
    /// Select a rollback target from confirmed candidates sorted descending by sequence.
    /// Returns `None` to fall back to embedded assets.
    fn select_target(
        &self,
        current_sequence: Option<u64>,
        candidates_desc: &[HotswapMeta],
    ) -> Option<u64>;
}

/// Built-in rollback policy variants.
///
/// # Config examples
///
/// ```json
/// { "rollback_policy": "latest_confirmed" }
/// { "rollback_policy": "embedded_only" }
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RollbackPolicyKind {
    /// Roll back to the highest-sequence confirmed version (pre-0.0.2 behavior).
    #[default]
    LatestConfirmed,
    /// Roll back to the confirmed version immediately before current.
    ImmediatePreviousConfirmed,
    /// Always fall back to embedded assets.
    EmbeddedOnly,
}

impl RollbackPolicy for RollbackPolicyKind {
    fn select_target(
        &self,
        current_sequence: Option<u64>,
        candidates_desc: &[HotswapMeta],
    ) -> Option<u64> {
        match self {
            RollbackPolicyKind::LatestConfirmed => candidates_desc.first().map(|m| m.sequence),
            RollbackPolicyKind::ImmediatePreviousConfirmed => {
                let current = current_sequence?;
                candidates_desc
                    .iter()
                    .find(|m| m.sequence < current)
                    .map(|m| m.sequence)
            }
            RollbackPolicyKind::EmbeddedOnly => None,
        }
    }
}

// ─── 4) RetentionPolicy ──────────────────────────────────────────────

/// Determines which cached versions to keep during cleanup.
///
/// The orchestrator enforces a safety floor: current and rollback candidate
/// are always preserved, even if the trait returns fewer sequences.
pub trait RetentionPolicy: Send + Sync + 'static {
    /// Return the set of sequence numbers to keep.
    /// The orchestrator will additionally preserve current + rollback candidate.
    fn select_kept_sequences(
        &self,
        current_sequence: Option<u64>,
        rollback_candidate: Option<u64>,
        available_desc: &[HotswapMeta],
    ) -> HashSet<u64>;
}

/// Retention configuration.
///
/// `max_retained_versions` is the **total** number of versions kept on disk,
/// including current and rollback candidate.
///
/// | `max_retained_versions` | Versions on disk |
/// |--------------------------|------------------|
/// | 2 (default) | current + rollback candidate |
/// | 3 | current + rollback + 1 older |
/// | 5 | current + rollback + 3 older |
///
/// Values below 2 are clamped to 2.
///
/// # Config example
///
/// ```json
/// { "max_retained_versions": 3 }
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RetentionConfig {
    /// Total number of versions to keep. Default 2, min 2.
    #[serde(default = "default_max_retained")]
    pub max_retained_versions: u32,
}

fn default_max_retained() -> u32 {
    2
}

impl Default for RetentionConfig {
    fn default() -> Self {
        Self {
            max_retained_versions: default_max_retained(),
        }
    }
}

impl RetentionConfig {
    /// Effective max, clamped to floor of 2.
    pub fn effective_max(&self) -> u32 {
        self.max_retained_versions.max(2)
    }
}

impl RetentionPolicy for RetentionConfig {
    fn select_kept_sequences(
        &self,
        current_sequence: Option<u64>,
        rollback_candidate: Option<u64>,
        available_desc: &[HotswapMeta],
    ) -> HashSet<u64> {
        let max = self.effective_max() as usize;
        let mut kept = HashSet::new();

        // Safety floor: always preserve current + rollback candidate
        if let Some(seq) = current_sequence {
            kept.insert(seq);
        }
        if let Some(seq) = rollback_candidate {
            kept.insert(seq);
        }

        // Fill up to max from highest-sequence versions
        for meta in available_desc {
            if kept.len() >= max {
                break;
            }
            kept.insert(meta.sequence);
        }

        kept
    }
}

// ─── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::manifest::HotswapMeta;

    fn meta(min_bin: &str, seq: u64, confirmed: bool) -> HotswapMeta {
        HotswapMeta {
            version: format!("1.0.0-ota.{}", seq),
            sequence: seq,
            min_binary_version: min_bin.into(),
            confirmed,
            unconfirmed_launch_count: 0,
        }
    }

    fn v(s: &str) -> Version {
        Version::parse(s).unwrap()
    }

    // ── BinaryCachePolicy ─────────────────────────────────────────

    #[test]
    fn keep_compatible_keeps_when_binary_matches() {
        let p = BinaryCachePolicyKind::KeepCompatible;
        assert!(!p.should_discard(&v("1.0.0"), &meta("1.0.0", 1, true), None));
    }

    #[test]
    fn keep_compatible_keeps_when_binary_newer() {
        let p = BinaryCachePolicyKind::KeepCompatible;
        assert!(!p.should_discard(&v("2.0.0"), &meta("1.0.0", 1, true), None));
    }

    #[test]
    fn discard_on_upgrade_discards_when_binary_newer() {
        let p = BinaryCachePolicyKind::DiscardOnUpgrade;
        assert!(p.should_discard(&v("2.0.0"), &meta("1.0.0", 1, true), None));
    }

    #[test]
    fn discard_on_upgrade_keeps_when_binary_matches() {
        let p = BinaryCachePolicyKind::DiscardOnUpgrade;
        assert!(!p.should_discard(&v("1.0.0"), &meta("1.0.0", 1, true), None));
    }

    #[test]
    fn discard_on_upgrade_keeps_on_invalid_semver() {
        let p = BinaryCachePolicyKind::DiscardOnUpgrade;
        assert!(!p.should_discard(&v("2.0.0"), &meta("not-semver", 1, true), None));
    }

    #[test]
    fn never_discard_keeps_always() {
        let p = BinaryCachePolicyKind::NeverDiscard;
        assert!(!p.should_discard(&v("99.0.0"), &meta("1.0.0", 1, true), None));
    }

    #[test]
    fn binary_cache_policy_default_is_discard_on_upgrade() {
        assert_eq!(
            BinaryCachePolicyKind::default(),
            BinaryCachePolicyKind::DiscardOnUpgrade
        );
    }

    #[test]
    fn binary_cache_policy_serde_roundtrip() {
        for (json, expected) in [
            ("\"keep_compatible\"", BinaryCachePolicyKind::KeepCompatible),
            (
                "\"discard_on_upgrade\"",
                BinaryCachePolicyKind::DiscardOnUpgrade,
            ),
            ("\"never_discard\"", BinaryCachePolicyKind::NeverDiscard),
        ] {
            let parsed: BinaryCachePolicyKind = serde_json::from_str(json).unwrap();
            assert_eq!(parsed, expected);
            let serialized = serde_json::to_string(&expected).unwrap();
            let reparsed: BinaryCachePolicyKind = serde_json::from_str(&serialized).unwrap();
            assert_eq!(reparsed, expected);
        }
    }

    // ── ConfirmationPolicy ────────────────────────────────────────

    #[test]
    fn single_launch_always_rollbacks() {
        let p = ConfirmationPolicyKind::SingleLaunch;
        let m = meta("1.0.0", 1, false);
        assert_eq!(
            p.on_startup_unconfirmed(&m),
            ConfirmationDecision::RollbackNow
        );
    }

    #[test]
    fn grace_period_keeps_when_under_threshold() {
        let p = ConfirmationPolicyKind::GracePeriod {
            max_unconfirmed_launches: 3,
        };
        let mut m = meta("1.0.0", 1, false);
        m.unconfirmed_launch_count = 0;
        assert_eq!(
            p.on_startup_unconfirmed(&m),
            ConfirmationDecision::KeepForNow
        );

        m.unconfirmed_launch_count = 2;
        assert_eq!(
            p.on_startup_unconfirmed(&m),
            ConfirmationDecision::KeepForNow
        );
    }

    #[test]
    fn grace_period_rollbacks_at_threshold() {
        let p = ConfirmationPolicyKind::GracePeriod {
            max_unconfirmed_launches: 3,
        };
        let mut m = meta("1.0.0", 1, false);
        m.unconfirmed_launch_count = 3;
        assert_eq!(
            p.on_startup_unconfirmed(&m),
            ConfirmationDecision::RollbackNow
        );
    }

    #[test]
    fn grace_period_rollbacks_above_threshold() {
        let p = ConfirmationPolicyKind::GracePeriod {
            max_unconfirmed_launches: 3,
        };
        let mut m = meta("1.0.0", 1, false);
        m.unconfirmed_launch_count = 10;
        assert_eq!(
            p.on_startup_unconfirmed(&m),
            ConfirmationDecision::RollbackNow
        );
    }

    #[test]
    fn grace_period_zero_is_immediate_rollback() {
        let p = ConfirmationPolicyKind::GracePeriod {
            max_unconfirmed_launches: 0,
        };
        let m = meta("1.0.0", 1, false);
        assert_eq!(
            p.on_startup_unconfirmed(&m),
            ConfirmationDecision::RollbackNow
        );
    }

    #[test]
    fn confirmation_policy_default_is_single_launch() {
        assert_eq!(
            ConfirmationPolicyKind::default(),
            ConfirmationPolicyKind::SingleLaunch
        );
    }

    #[test]
    fn confirmation_policy_serde_roundtrip() {
        let single: ConfirmationPolicyKind = serde_json::from_str("\"single_launch\"").unwrap();
        assert_eq!(single, ConfirmationPolicyKind::SingleLaunch);

        let grace: ConfirmationPolicyKind =
            serde_json::from_str(r#"{"grace_period":{"max_unconfirmed_launches":5}}"#).unwrap();
        assert_eq!(
            grace,
            ConfirmationPolicyKind::GracePeriod {
                max_unconfirmed_launches: 5
            }
        );
    }

    // ── RollbackPolicy ────────────────────────────────────────────

    fn confirmed_candidates() -> Vec<HotswapMeta> {
        vec![
            meta("1.0.0", 10, true),
            meta("1.0.0", 7, true),
            meta("1.0.0", 3, true),
        ]
    }

    #[test]
    fn latest_confirmed_picks_highest() {
        let p = RollbackPolicyKind::LatestConfirmed;
        assert_eq!(p.select_target(Some(15), &confirmed_candidates()), Some(10));
    }

    #[test]
    fn latest_confirmed_with_empty_candidates() {
        let p = RollbackPolicyKind::LatestConfirmed;
        assert_eq!(p.select_target(Some(15), &[]), None);
    }

    #[test]
    fn immediate_previous_picks_just_below_current() {
        let p = RollbackPolicyKind::ImmediatePreviousConfirmed;
        assert_eq!(p.select_target(Some(10), &confirmed_candidates()), Some(7));
    }

    #[test]
    fn immediate_previous_skips_equal_sequence() {
        let p = RollbackPolicyKind::ImmediatePreviousConfirmed;
        // Current is 10, candidates include 10 — should skip to 7
        assert_eq!(p.select_target(Some(10), &confirmed_candidates()), Some(7));
    }

    #[test]
    fn immediate_previous_none_when_no_lower() {
        let p = RollbackPolicyKind::ImmediatePreviousConfirmed;
        let candidates = vec![meta("1.0.0", 10, true)];
        assert_eq!(p.select_target(Some(10), &candidates), None);
    }

    #[test]
    fn immediate_previous_none_when_no_current() {
        let p = RollbackPolicyKind::ImmediatePreviousConfirmed;
        assert_eq!(p.select_target(None, &confirmed_candidates()), None);
    }

    #[test]
    fn embedded_only_always_none() {
        let p = RollbackPolicyKind::EmbeddedOnly;
        assert_eq!(p.select_target(Some(10), &confirmed_candidates()), None);
    }

    #[test]
    fn rollback_policy_default_is_latest_confirmed() {
        assert_eq!(
            RollbackPolicyKind::default(),
            RollbackPolicyKind::LatestConfirmed
        );
    }

    #[test]
    fn rollback_policy_serde_roundtrip() {
        for (json, expected) in [
            ("\"latest_confirmed\"", RollbackPolicyKind::LatestConfirmed),
            (
                "\"immediate_previous_confirmed\"",
                RollbackPolicyKind::ImmediatePreviousConfirmed,
            ),
            ("\"embedded_only\"", RollbackPolicyKind::EmbeddedOnly),
        ] {
            let parsed: RollbackPolicyKind = serde_json::from_str(json).unwrap();
            assert_eq!(parsed, expected);
        }
    }

    // ── RetentionPolicy ───────────────────────────────────────────

    fn available_versions() -> Vec<HotswapMeta> {
        vec![
            meta("1.0.0", 10, true),
            meta("1.0.0", 7, true),
            meta("1.0.0", 5, true),
            meta("1.0.0", 3, true),
            meta("1.0.0", 1, true),
        ]
    }

    #[test]
    fn retention_default_keeps_two() {
        let r = RetentionConfig::default();
        let kept = r.select_kept_sequences(Some(10), Some(7), &available_versions());
        assert_eq!(kept.len(), 2);
        assert!(kept.contains(&10));
        assert!(kept.contains(&7));
    }

    #[test]
    fn retention_three_keeps_three() {
        let r = RetentionConfig {
            max_retained_versions: 3,
        };
        let kept = r.select_kept_sequences(Some(10), Some(7), &available_versions());
        assert_eq!(kept.len(), 3);
        assert!(kept.contains(&10));
        assert!(kept.contains(&7));
        // Third slot goes to next highest available
        assert!(kept.contains(&5));
    }

    #[test]
    fn retention_five_keeps_five() {
        let r = RetentionConfig {
            max_retained_versions: 5,
        };
        let kept = r.select_kept_sequences(Some(10), Some(7), &available_versions());
        assert_eq!(kept.len(), 5);
    }

    #[test]
    fn retention_preserves_current_and_rollback_even_if_not_in_available() {
        let r = RetentionConfig::default();
        // current=10, rollback=7, but available only has [5, 3, 1]
        let available = vec![
            meta("1.0.0", 5, true),
            meta("1.0.0", 3, true),
            meta("1.0.0", 1, true),
        ];
        let kept = r.select_kept_sequences(Some(10), Some(7), &available);
        assert!(kept.contains(&10));
        assert!(kept.contains(&7));
    }

    #[test]
    fn retention_clamps_below_two() {
        let r = RetentionConfig {
            max_retained_versions: 0,
        };
        assert_eq!(r.effective_max(), 2);

        let r = RetentionConfig {
            max_retained_versions: 1,
        };
        assert_eq!(r.effective_max(), 2);
    }

    #[test]
    fn retention_no_current_no_rollback() {
        let r = RetentionConfig::default();
        let kept = r.select_kept_sequences(None, None, &available_versions());
        // Should still keep up to max from available
        assert_eq!(kept.len(), 2);
        assert!(kept.contains(&10));
        assert!(kept.contains(&7));
    }

    #[test]
    fn retention_config_serde_roundtrip() {
        let json = r#"{"max_retained_versions":4}"#;
        let parsed: RetentionConfig = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.max_retained_versions, 4);

        // Default when field omitted
        let empty: RetentionConfig = serde_json::from_str("{}").unwrap();
        assert_eq!(empty.max_retained_versions, 2);
    }

    #[test]
    fn retention_config_default() {
        let r = RetentionConfig::default();
        assert_eq!(r.max_retained_versions, 2);
    }
}
