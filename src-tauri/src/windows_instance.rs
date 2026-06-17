#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

use std::path::PathBuf;
use std::sync::OnceLock;

static WINDOWS_INSTANCE: OnceLock<WindowsInstance> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowsRuntimeMode {
    Manager,
    Child,
}

#[derive(Debug, Clone)]
pub struct WindowsInstance {
    mode: WindowsRuntimeMode,
    label: String,
    data_root: PathBuf,
}

impl WindowsInstance {
    pub fn init() -> &'static Self {
        WINDOWS_INSTANCE.get_or_init(Self::detect)
    }

    pub fn current() -> &'static Self {
        Self::init()
    }

    pub fn label(&self) -> &str {
        &self.label
    }

    #[allow(dead_code)]
    pub fn mode(&self) -> WindowsRuntimeMode {
        self.mode
    }

    pub fn is_manager(&self) -> bool {
        self.mode == WindowsRuntimeMode::Manager
    }

    #[allow(dead_code)]
    pub fn data_root(&self) -> &PathBuf {
        &self.data_root
    }

    pub fn session_file_path(&self) -> PathBuf {
        self.data_root.join("session.msgpack")
    }

    pub fn lock_file_path(&self) -> PathBuf {
        self.data_root.join("instance.lock")
    }

    fn detect() -> Self {
        let mode = detect_mode();
        let label = if mode == WindowsRuntimeMode::Manager {
            "manager".to_owned()
        } else {
            detect_child_label()
        };
        let data_root = instance_data_root(windows_app_data_root(), &label);

        write_runtime_mode_trace(mode, &label, &data_root);

        Self {
            mode,
            label,
            data_root,
        }
    }
}

pub fn normalize_label(raw: impl AsRef<str>) -> String {
    let mut label = String::new();
    let mut last_was_dash = false;

    for ch in raw.as_ref().chars() {
        let mapped = match ch {
            'a'..='z' | '0'..='9' => Some(ch),
            'A'..='Z' => Some(ch.to_ascii_lowercase()),
            '_' | '-' | ' ' | '.' | '/' | '\\' => Some('-'),
            _ => None,
        };

        match mapped {
            Some('-') => {
                if !last_was_dash && !label.is_empty() {
                    label.push('-');
                }
                last_was_dash = true;
            }
            Some(ch) => {
                label.push(ch);
                last_was_dash = false;
            }
            None => {}
        }
    }

    let trimmed = label.trim_matches('-').to_owned();
    if trimmed.is_empty() {
        "default".to_owned()
    } else {
        trimmed
    }
}

pub fn instance_data_root(base_dir: impl Into<PathBuf>, label: &str) -> PathBuf {
    base_dir
        .into()
        .join("free-grind")
        .join("instances")
        .join(label)
}

#[allow(dead_code)]
pub fn instances_root(base_dir: impl Into<PathBuf>) -> PathBuf {
    base_dir.into().join("free-grind").join("instances")
}

fn detect_mode() -> WindowsRuntimeMode {
    // Explicit command-line arguments are the most authoritative signal and
    // must win over the inherited FREE_GRIND_MANAGER_FORCE env flag. A child
    // launched by the manager inherits the manager's environment, so relying on
    // the force flag first would misclassify children as managers.
    for arg in std::env::args() {
        if arg == "--manager" {
            return WindowsRuntimeMode::Manager;
        }
        if arg == "--child" || arg == "--client" {
            return WindowsRuntimeMode::Child;
        }
    }

    if manager_force_enabled() {
        return WindowsRuntimeMode::Manager;
    }

    if let Some(argv0) = std::env::args().next() {
        let stem = std::path::Path::new(&argv0)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        if stem.contains("manager") {
            return WindowsRuntimeMode::Manager;
        }
        if stem.contains("child") || stem.contains("client") {
            return WindowsRuntimeMode::Child;
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(stem) = exe.file_stem().and_then(|s| s.to_str()) {
            if stem.to_ascii_lowercase().contains("manager") {
                return WindowsRuntimeMode::Manager;
            }
        }
    }

    if let Some(raw) = std::env::var_os("FREE_GRIND_MODE") {
        let mode = raw.to_string_lossy().to_ascii_lowercase();
        if mode == "manager" {
            return WindowsRuntimeMode::Manager;
        }
        if mode == "child" || mode == "client" {
            return WindowsRuntimeMode::Child;
        }
    }

    WindowsRuntimeMode::Child
}

fn manager_force_enabled() -> bool {
    if let Some(force_manager) = std::env::var_os("FREE_GRIND_MANAGER_FORCE") {
        let value = force_manager.to_string_lossy().to_ascii_lowercase();
        return value == "1" || value == "true" || value == "yes" || value == "on";
    }
    false
}

fn write_runtime_mode_trace(mode: WindowsRuntimeMode, label: &str, data_root: &PathBuf) {
    let base = windows_app_data_root();
    let manager_dir = base.join("free-grind").join("manager");
    let trace_path = manager_dir.join("runtime-mode.txt");

    let _ = std::fs::create_dir_all(&manager_dir);

    let mode_str = match mode {
        WindowsRuntimeMode::Manager => "manager",
        WindowsRuntimeMode::Child => "child",
    };

    let current_exe = std::env::current_exe()
        .ok()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "<unknown>".to_owned());
    let argv0 = std::env::args().next().unwrap_or_else(|| "<unknown>".to_owned());
    let args_joined = std::env::args().collect::<Vec<_>>().join(" ");
    let mode_env = std::env::var("FREE_GRIND_MODE").unwrap_or_else(|_| "<unset>".to_owned());
    let force_env =
        std::env::var("FREE_GRIND_MANAGER_FORCE").unwrap_or_else(|_| "<unset>".to_owned());
    let instance_env =
        std::env::var("FREE_GRIND_INSTANCE").unwrap_or_else(|_| "<unset>".to_owned());

    let content = format!(
        "mode={mode_str}\nlabel={label}\ncurrent_exe={current_exe}\nargv0={argv0}\nargs={args_joined}\nFREE_GRIND_MODE={mode_env}\nFREE_GRIND_MANAGER_FORCE={force_env}\nFREE_GRIND_INSTANCE={instance_env}\ndata_root={}\n",
        data_root.display()
    );

    let _ = std::fs::write(trace_path, content);
}

fn detect_child_label() -> String {
    if let Some(raw) = std::env::var_os("FREE_GRIND_INSTANCE") {
        let label = normalize_label(raw.to_string_lossy());
        if label != "default" {
            return label;
        }
    }

    if let Some(label) =
        std::env::args().find_map(|arg| arg.strip_prefix("--instance=").map(|v| v.to_owned()))
    {
        let label = normalize_label(label);
        if label != "default" {
            return label;
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(stem) = exe.file_stem().and_then(|s| s.to_str()) {
            let label = normalize_label(stem);
            if label != "default" {
                return label;
            }
        }
    }

    "default".to_owned()
}

fn windows_app_data_root() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .or_else(|| std::env::var_os("APPDATA"))
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

pub fn windows_app_data_root_dir() -> PathBuf {
    windows_app_data_root()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_labels() {
        assert_eq!(normalize_label("Child"), "child");
        assert_eq!(normalize_label("My Child 01!"), "my-child-01");
        assert_eq!(normalize_label("___"), "default");
    }

    #[test]
    fn builds_instance_paths_from_base_dir() {
        let root = instance_data_root(PathBuf::from("/tmp"), "alpha");
        assert_eq!(root, PathBuf::from("/tmp/free-grind/instances/alpha"));
        assert_eq!(
            root.join("session.msgpack"),
            PathBuf::from("/tmp/free-grind/instances/alpha/session.msgpack")
        );
    }

    #[test]
    fn detects_manager_exe_name() {
        let mode = detect_mode();
        assert!(matches!(mode, WindowsRuntimeMode::Manager | WindowsRuntimeMode::Child));
    }
}
