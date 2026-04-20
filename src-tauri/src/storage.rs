pub fn init_keyring() {
    #[cfg(target_os = "ios")]
    keyring::use_apple_protected_store(&std::collections::HashMap::new())
        .expect("failed to init iOS keyring");

    #[cfg(target_os = "android")]
    keyring::use_android_native_store(&std::collections::HashMap::new())
        .expect("failed to init Android keyring");

    #[cfg(target_os = "macos")]
    {
        let cfg = std::collections::HashMap::new();
        #[cfg(debug_assertions)]
        keyring::use_sqlite_store(&cfg).expect("failed to init macOS sqlite keyring");
        #[cfg(not(debug_assertions))]
        {
            if keyring::use_apple_protected_store(&cfg).is_err() {
                keyring::use_apple_keychain_store(&cfg).expect("failed to init macOS keyring");
            }
        }
    }

    #[cfg(target_os = "windows")]
    keyring::use_windows_native_store(&std::collections::HashMap::new())
        .expect("failed to init Windows keyring");

    #[cfg(target_os = "linux")]
    keyring::use_native_store(true).expect("failed to init Linux keyring");
}
