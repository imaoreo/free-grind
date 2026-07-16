#[cfg(target_os = "windows")]
use std::fs::OpenOptions;
#[cfg(target_os = "windows")]
use std::io::Write;
#[cfg(target_os = "windows")]
use std::path::PathBuf;

#[cfg(target_os = "windows")]
pub struct InstanceLockGuard {
    path: PathBuf,
}

#[cfg(target_os = "windows")]
impl Drop for InstanceLockGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

/// Reads back the `pid=<n>` line a lock file was written with.
#[cfg(target_os = "windows")]
fn read_lock_pid(lock_path: &PathBuf) -> Option<u32> {
    std::fs::read_to_string(lock_path)
        .ok()?
        .lines()
        .find_map(|line| line.strip_prefix("pid="))
        .and_then(|pid| pid.trim().parse().ok())
}

/// Whether a process with this pid is still alive. Used to tell a genuine
/// second instance apart from a stale lock left behind by a prior instance
/// that never got to run its clean-shutdown path (crash, forced kill,
/// power loss) — Drop/RunEvent::Exit only cover the graceful-exit case.
#[cfg(target_os = "windows")]
fn process_is_alive(pid: u32) -> bool {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

    unsafe {
        match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(handle) => {
                let _ = CloseHandle(handle);
                true
            }
            Err(_) => false,
        }
    }
}

#[cfg(target_os = "windows")]
pub fn acquire_for_current_child_instance() -> Result<Option<InstanceLockGuard>, String> {
    let instance = crate::windows_instance::WindowsInstance::current();
    if instance.is_manager() {
        return Ok(None);
    }

    let lock_path = instance.lock_file_path();
    if let Some(parent) = lock_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create instance lock directory {}: {}",
                parent.display(),
                error
            )
        })?;
    }

    let mut open_attempt = OpenOptions::new().create_new(true).write(true).open(&lock_path);

    if let Err(error) = &open_attempt {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            let stale = match read_lock_pid(&lock_path) {
                Some(pid) => !process_is_alive(pid),
                // Lock file exists but has no readable pid (e.g. truncated by a
                // crash mid-write) — treat as stale rather than blocking forever.
                None => true,
            };
            if stale {
                let _ = std::fs::remove_file(&lock_path);
                open_attempt = OpenOptions::new().create_new(true).write(true).open(&lock_path);
            }
        }
    }

    let mut file = open_attempt.map_err(|error| {
        format!(
            "instance '{}' is already running (lock: {}, {})",
            instance.label(),
            lock_path.display(),
            error
        )
    })?;

    let _ = writeln!(file, "pid={}", std::process::id());

    Ok(Some(InstanceLockGuard { path: lock_path }))
}

/// Surfaces the lock error via a native message box in addition to the
/// `eprintln!` at the call site — launched from a double-clicked .exe there's
/// no console attached, so without this the process just silently exits with
/// no window and no visible feedback at all.
#[cfg(target_os = "windows")]
pub fn show_lock_error_dialog(message: &str) {
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    let text = to_wide(&format!(
        "Free Grind is already running for this account.\n\n{}",
        message
    ));
    let caption = to_wide("Free Grind");

    unsafe {
        MessageBoxW(
            None,
            PCWSTR(text.as_ptr()),
            PCWSTR(caption.as_ptr()),
            MB_OK | MB_ICONERROR,
        );
    }
}