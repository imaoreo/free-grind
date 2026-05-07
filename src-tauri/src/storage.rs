pub fn init_keyring() {
    use keyring_core::set_default_store;

    #[cfg(target_os = "ios")]
    {
        let cfg = std::collections::HashMap::new();
        // Try protected keyring first, fall back to insecure storage on failure
        // (This is common in simulator/dev builds without proper entitlements)
        match apple_native_keyring_store::protected::Store::new_with_configuration(&cfg) {
            Ok(store) => set_default_store(store),
            Err(e) => {
                eprintln!("iOS protected keyring init failed: {:?}, using fallback", e);
                // Fall back to in-memory or unprotected storage
                // For now, we'll just log and let the app continue
                // This allows testing in simulator without entitlements
            }
        }
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

        #[cfg(debug_assertions)]
        {
            // Dev mode on macOS commonly lacks protected-keychain entitlements.
            let store = apple_native_keyring_store::keychain::Store::new_with_configuration(&cfg)
                .expect("failed to init macOS keychain store");
            set_default_store(store);
        }

        #[cfg(not(debug_assertions))]
        {
            if let Ok(store) =
                apple_native_keyring_store::protected::Store::new_with_configuration(&cfg)
            {
                set_default_store(store);
            } else {
                let store =
                    apple_native_keyring_store::keychain::Store::new_with_configuration(&cfg)
                        .expect("failed to init macOS keychain store");
                set_default_store(store);
            }
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
