use crate::error::AppError;
use serde::Serialize;
#[cfg(target_os = "windows")]
use serde::Deserialize;

#[cfg(target_os = "windows")]
use std::collections::BTreeSet;
#[cfg(target_os = "windows")]
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::{ffi::OsStr, fs};

#[cfg(target_os = "windows")]
fn current_exe_looks_like_manager() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.file_stem().and_then(|s| s.to_str()).map(|s| s.to_ascii_lowercase()))
        .map(|stem| stem.contains("manager"))
        .unwrap_or(false)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeContext {
    pub mode: String,
    pub instance_label: String,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedInstancesFile {
    labels: Vec<String>,
}

#[tauri::command]
pub fn runtime_context() -> RuntimeContext {
    #[cfg(target_os = "windows")]
    {
        let instance = crate::windows_instance::WindowsInstance::current();
        let is_manager =
            instance.is_manager() || instance.label() == "manager" || current_exe_looks_like_manager();
        return RuntimeContext {
            mode: if is_manager {
                "manager".to_owned()
            } else {
                "child".to_owned()
            },
            instance_label: instance.label().to_owned(),
        };
    }

    #[cfg(not(target_os = "windows"))]
    {
        RuntimeContext {
            mode: "child".to_owned(),
            instance_label: "default".to_owned(),
        }
    }
}

#[tauri::command]
pub fn create_child_instance(label: String) -> Result<String, AppError> {
    #[cfg(target_os = "windows")]
    {
        let normalized = crate::windows_instance::normalize_label(label);
        if normalized == "manager" {
            return Err(AppError::Auth(
                "'manager' is reserved and cannot be used as child label".to_owned(),
            ));
        }

        let path = crate::windows_instance::instance_data_root(
            crate::windows_instance::windows_app_data_root_dir(),
            &normalized,
        );

        fs::create_dir_all(&path).map_err(|error| {
            AppError::Auth(format!(
                "Failed to create instance directory {}: {}",
                path.display(),
                error
            ))
        })?;

        let mut labels = load_managed_labels()?;
        labels.insert(normalized.clone());
        save_managed_labels(&labels)?;

        return Ok(normalized);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = label;
        Err(AppError::Auth(
            "create_child_instance is only available on Windows".to_owned(),
        ))
    }
}

#[tauri::command]
pub fn list_child_instances() -> Result<Vec<String>, AppError> {
    #[cfg(target_os = "windows")]
    {
        let labels = load_managed_labels()?;
        return Ok(labels.into_iter().collect());
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn rename_child_instance(old_label: String, new_label: String) -> Result<String, AppError> {
    #[cfg(target_os = "windows")]
    {
        let old_norm = crate::windows_instance::normalize_label(old_label);
        let new_norm = crate::windows_instance::normalize_label(new_label);

        if old_norm == "manager" || new_norm == "manager" {
            return Err(AppError::Auth(
                "'manager' is reserved and cannot be used as child label".to_owned(),
            ));
        }

        if old_norm == new_norm {
            return Ok(new_norm);
        }

        let mut labels = load_managed_labels()?;
        if !labels.contains(&old_norm) {
            return Err(AppError::Auth(format!(
                "Cannot rename missing instance '{}'",
                old_norm
            )));
        }
        if labels.contains(&new_norm) {
            return Err(AppError::Auth(format!(
                "Instance label '{}' already exists",
                new_norm
            )));
        }

        let base = crate::windows_instance::windows_app_data_root_dir();
        let old_path = crate::windows_instance::instance_data_root(base.clone(), &old_norm);
        let new_path = crate::windows_instance::instance_data_root(base, &new_norm);

        if old_path.exists() {
            fs::rename(&old_path, &new_path).map_err(|error| {
                AppError::Auth(format!(
                    "Failed to rename instance directory {} -> {}: {}",
                    old_path.display(),
                    new_path.display(),
                    error
                ))
            })?;
        } else {
            fs::create_dir_all(&new_path).map_err(|error| {
                AppError::Auth(format!(
                    "Failed to create renamed instance directory {}: {}",
                    new_path.display(),
                    error
                ))
            })?;
        }

        labels.remove(&old_norm);
        labels.insert(new_norm.clone());
        save_managed_labels(&labels)?;

        return Ok(new_norm);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (old_label, new_label);
        Err(AppError::Auth(
            "rename_child_instance is only available on Windows".to_owned(),
        ))
    }
}

#[tauri::command]
pub fn remove_child_instance(label: String) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        let normalized = crate::windows_instance::normalize_label(label);
        let mut labels = load_managed_labels()?;
        labels.remove(&normalized);
        save_managed_labels(&labels)?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = label;
        Ok(())
    }
}

#[tauri::command]
pub fn launch_child_instance(label: String) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        let normalized = crate::windows_instance::normalize_label(label);
        let child_exe = resolve_child_exe_path()?;

        std::process::Command::new(&child_exe)
            .arg("--child")
            .arg(format!("--instance={normalized}"))
            .env("FREE_GRIND_MODE", "child")
            .env("FREE_GRIND_INSTANCE", &normalized)
            // The manager process runs with FREE_GRIND_MANAGER_FORCE=1. Child
            // processes inherit the parent environment, so we must explicitly
            // override the force flag and strip manager-only vars; otherwise the
            // child detects itself as a manager and shows the manager UI.
            .env("FREE_GRIND_MANAGER_FORCE", "0")
            .env_remove("FREE_GRIND_CHILD_EXE")
            .spawn()
            .map_err(|error| {
                AppError::Auth(format!(
                    "Failed to launch child instance '{}' via {}: {}",
                    normalized,
                    child_exe.display(),
                    error
                ))
            })?;

        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = label;
        Err(AppError::Auth(
            "launch_child_instance is only available on Windows".to_owned(),
        ))
    }
}

#[cfg(target_os = "windows")]
fn resolve_child_exe_path() -> Result<PathBuf, AppError> {
    if let Some(path) = std::env::var_os("FREE_GRIND_CHILD_EXE") {
        let child = PathBuf::from(path);
        if child.is_file() {
            return Ok(child);
        }
    }

    let manager_exe = std::env::current_exe().map_err(|error| {
        AppError::Auth(format!("Failed to resolve current executable path: {}", error))
    })?;

    let manager_dir = manager_exe.parent().ok_or_else(|| {
        AppError::Auth("Current executable has no parent directory".to_owned())
    })?;

    let candidates = [
        manager_dir.join("child.exe"),
        manager_dir.join("free-grind-child.exe"),
        manager_dir.join("Free Grind Child.exe"),
        manager_dir.join("free-grind.exe"),
    ];

    for path in candidates {
        if path.is_file() {
            return Ok(path);
        }
    }

    if let Ok(entries) = fs::read_dir(manager_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let is_exe = path
                .extension()
                .map(|ext| ext == OsStr::new("exe"))
                .unwrap_or(false);
            if !is_exe {
                continue;
            }

            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if stem.contains("child") && !stem.contains("manager") {
                return Ok(path);
            }
        }
    }

    Err(AppError::Auth(
        "Could not find child executable. Place child.exe next to manager.exe or set FREE_GRIND_CHILD_EXE."
            .to_owned(),
    ))
}

#[cfg(target_os = "windows")]
fn manager_instances_file_path() -> PathBuf {
    crate::windows_instance::windows_app_data_root_dir()
        .join("free-grind")
        .join("manager")
        .join("instances.json")
}

#[cfg(target_os = "windows")]
fn load_managed_labels() -> Result<BTreeSet<String>, AppError> {
    let path = manager_instances_file_path();
    let raw = match fs::read_to_string(&path) {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(BTreeSet::new()),
        Err(error) => {
            return Err(AppError::Auth(format!(
                "Failed reading manager instances file {}: {}",
                path.display(),
                error
            )))
        }
    };

    let parsed: ManagedInstancesFile = serde_json::from_str(&raw).map_err(|error| {
        AppError::Auth(format!(
            "Failed parsing manager instances file {}: {}",
            path.display(),
            error
        ))
    })?;

    Ok(parsed
        .labels
        .into_iter()
        .map(crate::windows_instance::normalize_label)
        .filter(|label| label != "manager")
        .collect())
}

#[cfg(target_os = "windows")]
fn save_managed_labels(labels: &BTreeSet<String>) -> Result<(), AppError> {
    let path = manager_instances_file_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            AppError::Auth(format!(
                "Failed creating manager registry directory {}: {}",
                parent.display(),
                error
            ))
        })?;
    }

    let payload = ManagedInstancesFile {
        labels: labels.iter().cloned().collect(),
    };
    let json = serde_json::to_string_pretty(&payload)
        .map_err(|error| AppError::Auth(format!("Failed serializing manager instances: {}", error)))?;

    fs::write(&path, json).map_err(|error| {
        AppError::Auth(format!(
            "Failed writing manager instances file {}: {}",
            path.display(),
            error
        ))
    })
}
