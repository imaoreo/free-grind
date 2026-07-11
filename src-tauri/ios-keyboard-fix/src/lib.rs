use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_ios_keyboard_fix);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    let builder = Builder::new("ios-keyboard-fix");

    #[cfg(target_os = "ios")]
    let builder = builder.setup(|_app, api| {
        api.register_ios_plugin(init_plugin_ios_keyboard_fix)?;
        Ok(())
    });

    builder.build()
}
