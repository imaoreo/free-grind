mod api;
mod error;
mod state;
mod storage;

use crate::state::AppState;
use api::client::GrindrClient;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    storage::init_keyring();

    let client = GrindrClient::new().ok();
    let context = tauri::generate_context!();
    let (hotswap, context) =
        tauri_plugin_hotswap::init(context).expect("failed to initialize hotswap plugin");

    tauri::Builder::default()
        .plugin(hotswap)
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_geolocation::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState { client })
        .invoke_handler(tauri::generate_handler![
            api::auth::login,
            api::auth::login_with_jwt,
            api::auth::refresh_token,
            api::auth::logout,
            api::auth::auth_state,
            api::auth::websocket_token,
            api::rest::request,
        ])
        .run(context)
        .expect("error while running tauri application");
}
