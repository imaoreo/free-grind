// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PermissionState, PluginApi},
    AppHandle, Runtime,
};

use crate::NotificationBuilder;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<Notification<R>> {
    // Must happen before any UI is displayed (Microsoft's guidance for
    // non-packaged Win32 apps raising toast notifications) — plugin setup
    // runs before window creation, so this is the earliest hook we have,
    // well before the lazy call that used to happen on first notification.
    #[cfg(windows)]
    imp::ensure_process_app_user_model_id(&imp::effective_app_id(app)?);

    Ok(Notification(app.clone()))
}

/// Access to the notification APIs.
///
/// You can get an instance of this type via [`NotificationExt`](crate::NotificationExt)
pub struct Notification<R: Runtime>(AppHandle<R>);

#[cfg(windows)]
impl<R: Runtime> crate::NotificationBuilder<R> {
    /// Routed through the raw WinRT toast APIs directly (bypassing
    /// notify-rust, whose cross-platform Notification type can't set a
    /// tag/group or expose a click callback) — see `imp::show_windows`.
    pub fn show(self) -> crate::Result<()> {
        imp::show_windows(&self.app, self.data)
    }
}

#[cfg(not(windows))]
impl<R: Runtime> crate::NotificationBuilder<R> {
    pub fn show(self) -> crate::Result<()> {
        let mut notification = imp::Notification::new(self.app.config().identifier.clone());

        if let Some(title) = self
            .data
            .title
            .or_else(|| self.app.config().product_name.clone())
        {
            notification = notification.title(title);
        }
        if let Some(body) = self.data.body {
            notification = notification.body(body);
        }
        if let Some(icon) = self.data.icon {
            notification = notification.icon(icon);
        }
        if let Some(sound) = self.data.sound {
            notification = notification.sound(sound);
        }
        notification.show()?;

        Ok(())
    }
}

impl<R: Runtime> Notification<R> {
    pub fn builder(&self) -> NotificationBuilder<R> {
        NotificationBuilder::new(self.0.clone())
    }

    pub fn request_permission(&self) -> crate::Result<PermissionState> {
        Ok(PermissionState::Granted)
    }

    pub fn permission_state(&self) -> crate::Result<PermissionState> {
        Ok(PermissionState::Granted)
    }
}

#[cfg(windows)]
impl<R: Runtime> Notification<R> {
    /// Notifications shown "active" via `ToastNotificationManager`'s history,
    /// enriched with the title/body/group we recorded at post time (the
    /// history API only round-trips tag/group, not arbitrary content).
    pub fn active(&self) -> crate::Result<Vec<crate::ActiveNotification>> {
        imp::windows_active(&self.0)
    }

    /// `None` clears every active notification (JS's `removeAllActive`);
    /// `Some(list)` clears only the given `(id, tag)` pairs.
    pub fn remove_active(
        &self,
        notifications: Option<Vec<(i32, Option<String>)>>,
    ) -> crate::Result<()> {
        imp::windows_remove_active(&self.0, notifications)
    }
}

#[cfg(not(windows))]
impl<R: Runtime> Notification<R> {
    pub fn active(&self) -> crate::Result<Vec<crate::ActiveNotification>> {
        Ok(Vec::new())
    }

    pub fn remove_active(
        &self,
        _notifications: Option<Vec<(i32, Option<String>)>>,
    ) -> crate::Result<()> {
        Ok(())
    }
}

mod imp {
    //! Types and functions related to desktop notifications.

    #[cfg(windows)]
    use std::path::MAIN_SEPARATOR as SEP;

    /// Windows toasts don't round-trip a title/body/etc. through the
    /// notification history API — only tag and group. Recording what we
    /// posted lets `windows_active` report something meaningful and lets
    /// `windows_remove_active` recover the group a bare `tag` belongs to.
    #[cfg(windows)]
    #[derive(Clone, Default)]
    struct WindowsActiveEntry {
        id: i32,
        group: Option<String>,
        title: Option<String>,
        body: Option<String>,
    }

    #[cfg(windows)]
    static WINDOWS_ACTIVE: std::sync::OnceLock<
        std::sync::Mutex<std::collections::HashMap<String, WindowsActiveEntry>>,
    > = std::sync::OnceLock::new();

    #[cfg(windows)]
    fn windows_active_registry(
    ) -> &'static std::sync::Mutex<std::collections::HashMap<String, WindowsActiveEntry>> {
        WINDOWS_ACTIVE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
    }

    /// `ToastNotification` is just a local variable in `show_windows` once
    /// `notifier.Show()` returns — Rust drops it (releasing the in-process
    /// COM object) as soon as the function exits. The Action Center still
    /// displays the toast from the system's own copy, but our `Activated`
    /// handler was registered on *this* COM object, so once it's released
    /// Windows has nothing left to fire the click event on: clicking the
    /// toast silently does nothing. Keeping a live reference here for as
    /// long as the toast could still be clicked/dismissed fixes that; the
    /// `Activated`/`Dismissed` handlers below remove their own entry once
    /// they fire.
    #[cfg(windows)]
    static WINDOWS_LIVE_TOASTS: std::sync::OnceLock<
        std::sync::Mutex<std::collections::HashMap<String, windows::UI::Notifications::ToastNotification>>,
    > = std::sync::OnceLock::new();

    #[cfg(windows)]
    fn windows_live_toasts(
    ) -> &'static std::sync::Mutex<std::collections::HashMap<String, windows::UI::Notifications::ToastNotification>>
    {
        WINDOWS_LIVE_TOASTS.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
    }

    /// Well-known AUMID `notify-rust`/most Windows toast libraries fall back
    /// to when the app has no registered shortcut of its own (dev builds) —
    /// notifications show up as if sent by PowerShell, but at least display.
    #[cfg(windows)]
    const POWERSHELL_APP_ID: &str =
        "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe";

    #[cfg(windows)]
    pub(super) fn effective_app_id<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> crate::Result<String> {
        let exe = tauri::utils::platform::current_exe()?;
        let exe_dir = exe.parent().expect("failed to get exe directory");
        let curr_dir = exe_dir.display().to_string();
        // Only the installed app has a shortcut registering its real
        // AppUserModelID with Windows; a dev/target build falls back to the
        // PowerShell placeholder.
        let is_installed = !(curr_dir.ends_with(format!("{SEP}target{SEP}debug").as_str())
            || curr_dir.ends_with(format!("{SEP}target{SEP}release").as_str()));
        Ok(if is_installed {
            app.config().identifier.clone()
        } else {
            POWERSHELL_APP_ID.to_owned()
        })
    }

    #[cfg(windows)]
    fn win_err(error: windows::core::Error) -> crate::Error {
        crate::Error::Show(format!("{error:?}"))
    }

    /// Temporary diagnostic for the click-does-nothing investigation — appends
    /// a timestamped line to `%TEMP%\free-grind-notification-debug.log` so we
    /// can tell whether Windows ever calls back into `Activated` at all, as
    /// opposed to the click being swallowed before reaching this process.
    /// Remove once resolved.
    #[cfg(windows)]
    fn debug_log(line: &str) {
        use std::io::Write;
        let path = std::env::temp_dir().join("free-grind-notification-debug.log");
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(file, "[{:?}] {}", std::time::SystemTime::now(), line);
        }
    }

    /// Non-packaged (Win32) apps must explicitly claim their AppUserModelID
    /// for the current process before raising toast notifications — without
    /// this, Windows still *displays* a toast created via
    /// `CreateToastNotifierWithId`, but since the process's own identity
    /// doesn't match the AUMID the notifier was created with, it has no way
    /// to route the `Activated` event back to this (still-running) process
    /// when the user clicks it, so the click silently does nothing. Only
    /// needs to happen once per process, before the first toast is shown.
    #[cfg(windows)]
    static PROCESS_APP_USER_MODEL_ID_SET: std::sync::OnceLock<()> = std::sync::OnceLock::new();

    #[cfg(windows)]
    pub(super) fn ensure_process_app_user_model_id(app_id: &str) {
        PROCESS_APP_USER_MODEL_ID_SET.get_or_init(|| {
            use windows::core::HSTRING;
            use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
            unsafe {
                let _ = SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(app_id));
            }
        });
    }

    #[cfg(windows)]
    fn xml_escape(input: &str) -> String {
        input
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }

    /// Builds and shows a Windows toast directly via the raw WinRT
    /// notification APIs (bypassing notify-rust, whose cross-platform
    /// Notification type can't set a tag/group or expose a click callback).
    /// Wires up a click handler that re-emits the notification's `group`
    /// (conversationId, or "taps") to the frontend as `fg:notification-clicked`,
    /// and records enough state for `windows_active`/`windows_remove_active`
    /// to later report/clear this notification from Windows' own history.
    #[cfg(windows)]
    pub fn show_windows<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        data: crate::NotificationData,
    ) -> crate::Result<()> {
        use tauri::Emitter;
        use windows::core::{HSTRING, IInspectable};
        use windows::Data::Xml::Dom::XmlDocument;
        use windows::Foundation::TypedEventHandler;
        use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};

        let app_id = effective_app_id(app)?;
        ensure_process_app_user_model_id(&app_id);
        debug_log(&format!("show_windows: app_id={app_id}"));
        let title = data
            .title
            .clone()
            .or_else(|| app.config().product_name.clone())
            .unwrap_or_default();
        let body = data.body.clone().unwrap_or_default();
        let group = data.group.clone();
        let tag = data.id.to_string();

        let xml = format!(
            "<toast><visual><binding template=\"ToastGeneric\"><text>{}</text><text>{}</text></binding></visual></toast>",
            xml_escape(&title),
            xml_escape(&body),
        );

        let doc = XmlDocument::new().map_err(win_err)?;
        doc.LoadXml(&HSTRING::from(xml.as_str())).map_err(win_err)?;

        let toast = ToastNotification::CreateToastNotification(&doc).map_err(win_err)?;
        toast.SetTag(&HSTRING::from(tag.as_str())).map_err(win_err)?;
        if let Some(group_value) = &group {
            toast
                .SetGroup(&HSTRING::from(group_value.as_str()))
                .map_err(win_err)?;
        }

        windows_active_registry().lock().unwrap().insert(
            tag.clone(),
            WindowsActiveEntry {
                id: data.id,
                group: group.clone(),
                title: Some(title),
                body: Some(body),
            },
        );

        let app_handle = app.clone();
        let click_group = group.clone();
        let click_tag = tag.clone();
        let handler = TypedEventHandler::<ToastNotification, IInspectable>::new(
            move |_sender, _args| {
                debug_log(&format!("Activated fired, group={click_group:?}"));
                if let Some(group) = &click_group {
                    let emit_result = app_handle.emit("fg:notification-clicked", group.clone());
                    debug_log(&format!("emit result={emit_result:?}"));
                }
                windows_live_toasts().lock().unwrap().remove(&click_tag);
                Ok(())
            },
        );
        toast.Activated(&handler).map_err(win_err)?;

        let dismissed_tag = tag.clone();
        let dismissed_handler = TypedEventHandler::<
            ToastNotification,
            windows::UI::Notifications::ToastDismissedEventArgs,
        >::new(move |_sender, args| {
            let reason = args
                .as_ref()
                .and_then(|a| a.Reason().ok())
                .map(|r| format!("{r:?}"));
            debug_log(&format!("Dismissed fired, reason={reason:?}"));
            windows_live_toasts().lock().unwrap().remove(&dismissed_tag);
            Ok(())
        });
        toast.Dismissed(&dismissed_handler).map_err(win_err)?;

        // Keep the COM object alive past this function returning — see the
        // doc comment on `WINDOWS_LIVE_TOASTS` for why that's required for
        // `Activated` to ever fire.
        windows_live_toasts()
            .lock()
            .unwrap()
            .insert(tag.clone(), toast.clone());

        let notifier = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(
            app_id.as_str(),
        ))
        .map_err(win_err)?;
        notifier.Show(&toast).map_err(win_err)
    }

    /// Reports the notifications Windows still has recorded in its
    /// notification history for this app, cross-referenced with the
    /// title/body/group we recorded when posting them.
    #[cfg(windows)]
    pub fn windows_active<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
    ) -> crate::Result<Vec<crate::ActiveNotification>> {
        use windows::core::HSTRING;
        use windows::UI::Notifications::ToastNotificationManager;

        let app_id = effective_app_id(app)?;
        let app_id_hstring = HSTRING::from(app_id.as_str());

        let history = ToastNotificationManager::History()
            .and_then(|h| h.GetHistoryWithId(&app_id_hstring))
            .map_err(win_err)?;

        let registry = windows_active_registry().lock().unwrap();
        let mut result = Vec::new();
        for toast in &history {
            let tag = toast.Tag().ok().map(|t| t.to_string_lossy());
            let group = toast
                .Group()
                .ok()
                .map(|g| g.to_string_lossy())
                .filter(|g| !g.is_empty());
            let entry = tag.as_deref().and_then(|t| registry.get(t));
            let id = entry.map(|e| e.id).unwrap_or_default();
            let title = entry.and_then(|e| e.title.clone());
            let body = entry.and_then(|e| e.body.clone());
            result.push(crate::ActiveNotification::new(id, tag, title, body, group));
        }
        Ok(result)
    }

    /// `None` clears everything Windows has recorded for this app;
    /// `Some(list)` removes just the given `(id, tag)` pairs, recovering
    /// each one's group from the entry recorded at post time.
    #[cfg(windows)]
    pub fn windows_remove_active<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        notifications: Option<Vec<(i32, Option<String>)>>,
    ) -> crate::Result<()> {
        use windows::core::HSTRING;
        use windows::UI::Notifications::ToastNotificationManager;

        let app_id = effective_app_id(app)?;
        let app_id_hstring = HSTRING::from(app_id.as_str());
        let history = ToastNotificationManager::History().map_err(win_err)?;
        let mut registry = windows_active_registry().lock().unwrap();

        match notifications {
            None => {
                history.ClearWithId(&app_id_hstring).map_err(win_err)?;
                registry.clear();
            }
            Some(items) => {
                for (id, requested_tag) in items {
                    let tag = requested_tag.unwrap_or_else(|| id.to_string());
                    let group = registry
                        .get(&tag)
                        .and_then(|entry| entry.group.clone())
                        .unwrap_or_default();
                    history
                        .RemoveGroupedTagWithId(
                            &HSTRING::from(tag.as_str()),
                            &HSTRING::from(group.as_str()),
                            &app_id_hstring,
                        )
                        .map_err(win_err)?;
                    registry.remove(&tag);
                }
            }
        }

        Ok(())
    }

    /// The desktop notification definition.
    ///
    /// Allows you to construct a Notification data and send it.
    ///
    /// # Examples
    /// ```rust,no_run
    /// use tauri_plugin_notification::NotificationExt;
    /// // first we build the application to access the Tauri configuration
    /// let app = tauri::Builder::default()
    ///   // on an actual app, remove the string argument
    ///   .build(tauri::generate_context!("test/tauri.conf.json"))
    ///   .expect("error while building tauri application");
    ///
    /// // shows a notification with the given title and body
    /// app.notification()
    ///   .builder()
    ///   .title("New message")
    ///   .body("You've got a new message.")
    ///   .show();
    ///
    /// // run the app
    /// app.run(|_app_handle, _event| {});
    /// ```
    #[allow(dead_code)]
    #[derive(Debug, Default)]
    pub struct Notification {
        /// The notification body.
        body: Option<String>,
        /// The notification title.
        title: Option<String>,
        /// The notification icon.
        icon: Option<String>,
        /// The notification sound.
        sound: Option<String>,
        /// The notification identifier
        identifier: String,
    }

    impl Notification {
        /// Initializes a instance of a Notification.
        pub fn new(identifier: impl Into<String>) -> Self {
            Self {
                identifier: identifier.into(),
                ..Default::default()
            }
        }

        /// Sets the notification body.
        #[must_use]
        pub fn body(mut self, body: impl Into<String>) -> Self {
            self.body = Some(body.into());
            self
        }

        /// Sets the notification title.
        #[must_use]
        pub fn title(mut self, title: impl Into<String>) -> Self {
            self.title = Some(title.into());
            self
        }

        /// Sets the notification icon.
        #[must_use]
        pub fn icon(mut self, icon: impl Into<String>) -> Self {
            self.icon = Some(icon.into());
            self
        }

        /// Sets the notification sound file.
        #[must_use]
        pub fn sound(mut self, sound: impl Into<String>) -> Self {
            self.sound = Some(sound.into());
            self
        }

        /// Shows the notification.
        ///
        /// # Examples
        ///
        /// ```no_run
        /// use tauri_plugin_notification::NotificationExt;
        ///
        /// tauri::Builder::default()
        ///   .setup(|app| {
        ///     app.notification()
        ///       .builder()
        ///       .title("Tauri")
        ///       .body("Tauri is awesome!")
        ///       .show()
        ///       .unwrap();
        ///     Ok(())
        ///   })
        ///   .run(tauri::generate_context!("test/tauri.conf.json"))
        ///   .expect("error while running tauri application");
        /// ```
        ///
        /// ## Platform-specific
        ///
        /// - **Windows**: Not supported on Windows 7. If your app targets it, enable the `windows7-compat` feature and use [`Self::notify`].
        #[cfg_attr(
            all(not(docsrs), feature = "windows7-compat"),
            deprecated = "This function does not work on Windows 7. Use `Self::notify` instead."
        )]
        pub fn show(self) -> crate::Result<()> {
            let mut notification = notify_rust::Notification::new();
            if let Some(body) = self.body {
                notification.body(&body);
            }
            if let Some(title) = self.title {
                notification.summary(&title);
            }
            if let Some(icon) = self.icon {
                notification.icon(&icon);
            } else {
                notification.auto_icon();
            }
            if let Some(sound) = self.sound {
                notification.sound_name(&sound);
            }
            #[cfg(windows)]
            {
                let exe = tauri::utils::platform::current_exe()?;
                let exe_dir = exe.parent().expect("failed to get exe directory");
                let curr_dir = exe_dir.display().to_string();
                // set the notification's System.AppUserModel.ID only when running the installed app
                if !(curr_dir.ends_with(format!("{SEP}target{SEP}debug").as_str())
                    || curr_dir.ends_with(format!("{SEP}target{SEP}release").as_str()))
                {
                    notification.app_id(&self.identifier);
                }
            }
            #[cfg(target_os = "macos")]
            {
                let _ = notify_rust::set_application(if tauri::is_dev() {
                    "com.apple.Terminal"
                } else {
                    &self.identifier
                });
            }

            // Dropping the handle immediately closes the underlying D-Bus
            // connection on Linux; some notification daemons rely on
            // that connection staying open to keep the notification
            // displayed (notify-rust's own docs: "keeps a connection
            // alive to ensure actions work on certain desktops"). Leak
            // it intentionally so the notification persists normally.
            // Windows' `show()` returns `Result<()>` (no handle to keep
            // alive), so forgetting it there is a no-op the compiler
            // warns about — only do it where it actually matters.
            //
            // Called inline (not fire-and-forget) so a real display failure
            // (e.g. an invalid/unregistered AppUserModelID on Windows)
            // propagates back to the JS caller instead of vanishing silently.
            match notification.show() {
                Ok(handle) => {
                    #[cfg(not(windows))]
                    std::mem::forget(handle);
                    #[cfg(windows)]
                    let _ = handle;
                    Ok(())
                }
                Err(err) => Err(crate::Error::Show(err.to_string())),
            }
        }

        /// Shows the notification. This API is similar to [`Self::show`], but it also works on Windows 7.
        ///
        /// # Examples
        ///
        /// ```no_run
        /// use tauri_plugin_notification::NotificationExt;
        ///
        /// tauri::Builder::default()
        ///   .setup(move |app| {
        ///     app.notification().builder()
        ///       .title("Tauri")
        ///       .body("Tauri is awesome!")
        ///       .show()
        ///       .unwrap();
        ///     Ok(())
        ///   })
        ///   .run(tauri::generate_context!("test/tauri.conf.json"))
        ///   .expect("error while running tauri application");
        /// ```
        #[cfg(feature = "windows7-compat")]
        #[cfg_attr(docsrs, doc(cfg(feature = "windows7-compat")))]
        #[allow(unused_variables)]
        pub fn notify<R: tauri::Runtime>(self, app: &tauri::AppHandle<R>) -> crate::Result<()> {
            #[cfg(windows)]
            {
                fn is_windows_7() -> bool {
                    let v = windows_version::OsVersion::current();
                    // windows 7 is 6.1
                    v.major == 6 && v.minor == 1
                }

                if is_windows_7() {
                    self.notify_win7(app)
                } else {
                    #[allow(deprecated)]
                    self.show()
                }
            }
            #[cfg(not(windows))]
            {
                #[allow(deprecated)]
                self.show()
            }
        }

        /// Shows the notification on Windows 7.
        #[cfg(all(windows, feature = "windows7-compat"))]
        fn notify_win7<R: tauri::Runtime>(self, app: &tauri::AppHandle<R>) -> crate::Result<()> {
            let app_ = app.clone();
            let _ = app.clone().run_on_main_thread(move || {
                let mut notification = win7_notifications::Notification::new();
                if let Some(body) = self.body {
                    notification.body(&body);
                }
                if let Some(title) = self.title {
                    notification.summary(&title);
                }
                if let Some(icon) = app_.default_window_icon() {
                    notification.icon(icon.rgba().to_vec(), icon.width(), icon.height());
                }
                let _ = notification.show();
            });

            Ok(())
        }
    }
}
