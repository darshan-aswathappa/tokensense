/// Thin wrapper around the `keyring` crate for secure credential storage.
///
/// All values are stored under the service name "tokensense".

const SERVICE: &str = "tokensense";

/// Persists `value` in the system keychain under `key`.
pub fn save_value(key: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, key)
        .map_err(|e| format!("keychain entry creation failed for key '{key}': {e}"))?;
    entry
        .set_password(value)
        .map_err(|e| format!("keychain write failed for key '{key}': {e}"))
}

/// Retrieves the value stored under `key`. Returns `None` if the key does not exist.
pub fn load_value(key: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE, key)
        .map_err(|e| format!("keychain entry creation failed for key '{key}': {e}"))?;
    match entry.get_password() {
        Ok(val) => Ok(Some(val)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keychain read failed for key '{key}': {e}")),
    }
}

/// Removes the value stored under `key`. A no-op if the key does not exist.
pub fn delete_value(key: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, key)
        .map_err(|e| format!("keychain entry creation failed for key '{key}': {e}"))?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain delete failed for key '{key}': {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Use a unique prefix so tests don't interfere with real credentials.
    fn test_key(suffix: &str) -> String {
        format!("tokensense_test_{suffix}")
    }

    /// Full round-trip test — save, load, delete, confirm gone.
    ///
    /// Marked `#[ignore]` because unsigned macOS test binaries cannot read back
    /// credentials they wrote (the keychain ACL check fails for un-entitled
    /// processes).  Run this test in the context of a signed app bundle:
    ///   cargo test keychain::tests::save_load_delete_cycle -- --ignored
    #[test]
    #[ignore = "requires a signed/entitled macOS binary to pass keychain ACL checks"]
    fn save_load_delete_cycle() {
        let key = test_key("save_load_delete");
        // Ensure clean slate.
        let _ = delete_value(&key);

        // Nothing stored yet.
        let loaded = load_value(&key).expect("load should not error on missing key");
        assert!(loaded.is_none(), "expected None before save");

        // Save a value.
        save_value(&key, "test_secret_value").expect("save should succeed");

        // Load it back.
        let loaded = load_value(&key).expect("load should succeed after save");
        assert_eq!(loaded, Some("test_secret_value".to_string()));

        // Delete it.
        delete_value(&key).expect("delete should succeed");

        // Confirm it's gone.
        let loaded = load_value(&key).expect("load should not error after delete");
        assert!(loaded.is_none(), "expected None after delete");
    }

    #[test]
    fn load_nonexistent_key_returns_none() {
        let key = test_key("nonexistent_key_xyz_12345");
        // Clean up first just in case.
        let _ = delete_value(&key);
        let result = load_value(&key).expect("should not error for missing key");
        assert!(result.is_none());
    }

    #[test]
    fn delete_nonexistent_is_noop() {
        let key = test_key("noop_delete_xyz_12345");
        // Should not return an error even if key does not exist.
        delete_value(&key).expect("delete of nonexistent key should not error");
    }

    /// Overwrite test — second save should supersede the first.
    ///
    /// Marked `#[ignore]` for the same reason as `save_load_delete_cycle`:
    /// unsigned test binaries cannot round-trip through the macOS Keychain.
    #[test]
    #[ignore = "requires a signed/entitled macOS binary to pass keychain ACL checks"]
    fn overwrite_existing_value() {
        let key = test_key("overwrite");
        let _ = delete_value(&key);

        save_value(&key, "first").expect("save first");
        save_value(&key, "second").expect("save second (overwrite)");

        let loaded = load_value(&key).expect("load after overwrite");
        assert_eq!(loaded, Some("second".to_string()));

        let _ = delete_value(&key);
    }
}
