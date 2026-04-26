pub fn init_keyring() {
    use keyring_core::set_default_store;

    #[cfg(target_os = "ios")]
    {
        let cfg = std::collections::HashMap::new();
        let store = apple_native_keyring_store::protected::Store::new_with_configuration(&cfg)
            .expect("failed to init iOS protected keyring store");
        set_default_store(store);
    }

    #[cfg(target_os = "android")]
    {
        let cfg = std::collections::HashMap::new();
        let store = android_native_keyring_store::Store::new_with_configuration(&cfg)
            .expect("failed to init Android keyring store");
        set_default_store(store);
    }

    #[cfg(target_os = "macos")]
    {
        let cfg = std::collections::HashMap::new();
        if let Ok(store) =
            apple_native_keyring_store::protected::Store::new_with_configuration(&cfg)
        {
            set_default_store(store);
        } else {
            let store = apple_native_keyring_store::keychain::Store::new_with_configuration(&cfg)
                .expect("failed to init macOS keyring store");
            set_default_store(store);
        }
    }

    #[cfg(target_os = "windows")]
    {
        let store = windows_native_keyring_store::Store::new()
            .expect("failed to init Windows keyring store");
        set_default_store(store);
    }

    #[cfg(target_os = "linux")]
    {
        let store =
            linux_keyutils_keyring_store::Store::new().expect("failed to init Linux keyring store");
        set_default_store(store);
    }
}
