mod api;
mod commands;
mod error;
mod instance_lock;
mod state;
mod storage;
mod windows_instance;

use std::sync::Arc;

use crate::state::AppState;
use api::client::GrindrClient;
use api::websocket::WsState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Install the ring crypto provider for rustls (required for
    // tokio-tungstenite when using rustls TLS backend).
    let _ = rustls::crypto::ring::default_provider().install_default();

    #[cfg(target_os = "windows")]
    {
        windows_instance::WindowsInstance::init();
    }

    // Keyring initialization should not block app startup.
    // Some environments (including certain Intel macOS setups) can fail keychain init.
    if let Err(e) = storage::init_keyring() {
        eprintln!(
            "Warning: keyring initialization failed (continuing without persisted sessions): {:?}",
            e
        );
    }

    let client = GrindrClient::new().ok();

    // Platform-specific setup for plugins
    #[cfg(not(mobile))]
    {
        #[cfg(target_os = "windows")]
        let instance_lock_guard = match instance_lock::acquire_for_current_child_instance() {
            Ok(guard) => guard,
            Err(error) => {
                eprintln!("Free Grind failed to acquire child instance lock: {}", error);
                instance_lock::show_lock_error_dialog(&error);
                return;
            }
        };

        #[cfg(target_os = "windows")]
        let is_manager_runtime = windows_instance::WindowsInstance::current().is_manager();
        #[cfg(not(target_os = "windows"))]
        let is_manager_runtime = false;

        let context = tauri::generate_context!();
        let (hotswap, context) = if is_manager_runtime {
            (None, context)
        } else {
            match tauri_plugin_hotswap::init(context) {
                Ok((h, c)) => (Some(h), c),
                Err(e) => {
                    panic!("failed to initialize hotswap plugin: {}", e);
                }
            }
        };

        let mut builder = tauri::Builder::default();
        if let Some(hotswap_plugin) = hotswap {
            builder = builder.plugin(hotswap_plugin);
        }

        let app = builder
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_os::init())
            .plugin(tauri_plugin_geolocation::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_http::init())
            .plugin(tauri_plugin_sql::Builder::default().build())
            .plugin(tauri_plugin_opener::init())
            .manage(AppState { client })
            .manage(Arc::new(WsState::new()))
            .setup(|app| {
                #[cfg(target_os = "linux")]
                {
                    use tauri::Manager;
                    use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.with_webview(|webview| {
                            let view = webview.inner();
                            // WebKitGTK gates RTCPeerConnection/getUserMedia behind this
                            // flag on distros where it's actually compiled in. Harmless
                            // to set unconditionally, but not sufficient on its own —
                            // confirmed on Fedora 44's webkit2gtk4.1 (2.52.3) that
                            // RTCPeerConnection is undefined even with this enabled and
                            // even in GNOME Web (Epiphany, same engine), and even after
                            // forcing a full WebProcess respawn. That build appears to
                            // ship without the WebRTC DOM bindings at all, which no
                            // runtime setting from this app can work around — video
                            // calls are simply unsupported on such Linux builds.
                            if let Some(settings) = view.settings() {
                                settings.set_enable_webrtc(true);
                            }
                            view.connect_permission_request(|_view, request| {
                                request.allow();
                                true
                            });
                        });
                    }
                }

                // WebView2 (Chromium) has its own geolocation/microphone backends wired
                // to the Windows Location service and audio devices, but only
                // prompts/grants them if the host app handles PermissionRequested —
                // without this it silently denies navigator.geolocation and
                // navigator.mediaDevices.getUserMedia calls instead of showing the
                // OS prompt.
                #[cfg(target_os = "windows")]
                {
                    use tauri::Manager;
                    use webview2_com::Microsoft::Web::WebView2::Win32::{
                        COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION,
                        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                    };
                    use webview2_com::PermissionRequestedEventHandler;
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.with_webview(|webview| {
                            let Ok(core) = (unsafe { webview.controller().CoreWebView2() }) else {
                                return;
                            };
                            let mut token = Default::default();
                            unsafe {
                                let _ = core.add_PermissionRequested(
                                    &PermissionRequestedEventHandler::create(Box::new(
                                        |_sender, args| {
                                            let Some(args) = args else { return Ok(()) };
                                            let mut kind = Default::default();
                                            args.PermissionKind(&mut kind)?;
                                            if kind == COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION
                                                || kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                                                || kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
                                            {
                                                args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                                            }
                                            Ok(())
                                        },
                                    )),
                                    &mut token,
                                );
                            }
                        });
                    }
                }
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                api::runtime::runtime_context,
                api::runtime::create_child_instance,
                api::runtime::list_child_instances,
                api::runtime::rename_child_instance,
                api::runtime::remove_child_instance,
                api::runtime::launch_child_instance,
                api::auth::login,
                api::auth::login_with_jwt,
                api::auth::refresh_token,
                api::auth::logout,
                api::auth::auth_state,
                api::auth::websocket_token,
                api::auth::sync_push_token,
                api::auth::list_saved_accounts,
                api::auth::switch_account,
                api::auth::remove_saved_account,
                api::rest::request,
                api::websocket::ws_connect,
                api::websocket::ws_send,
                api::websocket::ws_disconnect,
                api::websocket::ws_status,
                api::websocket::ws_log_event,
                commands::fingerprint::check_fingerprint,
                commands::backup::export_backup_to_file,
                commands::backup::import_backup_from_file,
                commands::backup::inspect_backup_file,
            ])
            .build(context)
            .expect("error while running tauri application");

        // On Windows, the desktop event loop terminates the process with
        // std::process::exit once the window closes and never returns control
        // to this function, so instance_lock_guard's Drop would otherwise
        // never run, leaving a stale instance.lock behind that blocks every
        // future launch of this child instance. RunEvent::Exit fires just
        // before that exit, so release the lock there instead.
        #[cfg(target_os = "windows")]
        {
            let mut instance_lock_guard = instance_lock_guard;
            app.run(move |_app_handle, event| {
                if let tauri::RunEvent::Exit = event {
                    instance_lock_guard.take();
                }
            });
        }
        #[cfg(not(target_os = "windows"))]
        {
            app.run(|_app_handle, _event| {});
        }
    }

    #[cfg(mobile)]
    {
        let context = tauri::generate_context!();
        let (hotswap, context) = match tauri_plugin_hotswap::init(context) {
            Ok((h, c)) => (h, c),
            Err(e) => {
                panic!("failed to initialize hotswap plugin: {}", e);
            }
        };

        let builder = tauri::Builder::default()
            .plugin(hotswap)
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_os::init())
            .plugin(tauri_plugin_geolocation::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_http::init())
            .plugin(tauri_plugin_sql::Builder::default().build())
            .plugin(tauri_plugin_opener::init());

        #[cfg(target_os = "ios")]
        let builder = builder
            .plugin(tauri_plugin_ios_photos::init())
            .plugin(tauri_plugin_ios_keyboard_fix::init())
            .plugin(tauri_plugin_ios_app_disguise::init());

        #[cfg(target_os = "android")]
        let builder = builder.plugin(tauri_plugin_android_fs::init());

        builder
            .manage(AppState { client })
            .manage(Arc::new(WsState::new()))
            .invoke_handler(tauri::generate_handler![
                api::runtime::runtime_context,
                api::runtime::create_child_instance,
                api::runtime::list_child_instances,
                api::runtime::rename_child_instance,
                api::runtime::remove_child_instance,
                api::runtime::launch_child_instance,
                api::auth::login,
                api::auth::login_with_jwt,
                api::auth::refresh_token,
                api::auth::logout,
                api::auth::auth_state,
                api::auth::websocket_token,
                api::auth::sync_push_token,
                api::auth::list_saved_accounts,
                api::auth::switch_account,
                api::auth::remove_saved_account,
                api::rest::request,
                api::websocket::ws_connect,
                api::websocket::ws_send,
                api::websocket::ws_disconnect,
                api::websocket::ws_status,
                api::websocket::ws_log_event,
                commands::fingerprint::check_fingerprint,
                commands::backup::export_backup_to_file,
                commands::backup::import_backup_from_file,
                commands::backup::inspect_backup_file,
            ])
            .run(context)
            .expect("error while running tauri application");
    }
}
