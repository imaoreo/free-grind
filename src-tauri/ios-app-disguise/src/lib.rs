// Only ever compiled for iOS builds — see `[target.'cfg(target_os = "ios")'.dependencies]`
// in the root Cargo.toml. Mirrors the Android side (AppDisguise.kt /
// FreeGrindBridge.setAppDisguise), but iOS has no way to change the
// app's *name* at runtime (CFBundleDisplayName is fixed), only its icon —
// see AppDisguisePlugin.swift for the actual UIApplication call.
use serde::Serialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

mod error;
pub use error::{Error, Result};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_ios_app_disguise);

// Serialized here (Rust -> Swift, via run_mobile_plugin's payload) — the
// mirror-image `SetAlternateIconArgs: Decodable` in AppDisguisePlugin.swift
// is what the Swift side actually decodes.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SetAlternateIconArgs {
    /// Icon set name declared under CFBundleIcons.CFBundleAlternateIcons in
    /// project.yml ("Calculator" | "Notes" | "Weather") — `None`/`null`
    /// restores the primary "Free Grind" icon.
    name: Option<String>,
}

#[cfg(target_os = "ios")]
struct AppDisguise<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(target_os = "ios")]
impl<R: Runtime> AppDisguise<R> {
    fn set_alternate_icon(&self, name: Option<String>) -> Result<()> {
        self.0
            .run_mobile_plugin("setAlternateIcon", SetAlternateIconArgs { name })
            .map_err(Into::into)
    }
}

/// JS calls this via `invoke("plugin:ios-app-disguise|set_alternate_icon", { name })`.
/// `name` must match one of the CFBundleAlternateIcons keys above, or be
/// omitted/null to switch back to the primary icon.
#[tauri::command]
fn set_alternate_icon<R: Runtime>(app: tauri::AppHandle<R>, name: Option<String>) -> Result<()> {
    #[cfg(target_os = "ios")]
    {
        app.state::<AppDisguise<R>>().set_alternate_icon(name)
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (app, name);
        Ok(())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("ios-app-disguise")
        .invoke_handler(tauri::generate_handler![set_alternate_icon])
        .setup(|_app, _api| {
            #[cfg(target_os = "ios")]
            {
                let handle = _api.register_ios_plugin(init_plugin_ios_app_disguise)?;
                _app.manage(AppDisguise::<R>(handle));
            }
            Ok(())
        })
        .build()
}
