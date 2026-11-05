//! API key storage.
//!
//! The Android app kept the key in the Keystore (AES-256-GCM, per-UID). The
//! desktop equivalent is the OS credential store — Windows Credential Manager
//! through the `keyring` crate — so the key never sits in the SQLite file, in a
//! backup, or in `localStorage`.

const SERVICE: &str = "com.simpleagent.desktop";
const ACCOUNT: &str = "api-key";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("凭据存储不可用：{e}"))
}

pub fn set_api_key(key: &str) -> Result<(), String> {
    if key.trim().is_empty() {
        return delete_api_key();
    }
    entry()?
        .set_password(key.trim())
        .map_err(|e| format!("保存 API Key 失败：{e}"))
}

pub fn get_api_key() -> Result<String, String> {
    match entry()?.get_password() {
        Ok(v) => Ok(v),
        // "no entry" is the normal first-run path, not an error
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(format!("读取 API Key 失败：{e}")),
    }
}

pub fn delete_api_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("删除 API Key 失败：{e}")),
    }
}

#[tauri::command]
pub fn save_api_key(key: String) -> Result<(), String> {
    set_api_key(&key)
}

#[tauri::command]
pub fn load_api_key() -> Result<String, String> {
    get_api_key()
}

#[tauri::command]
pub fn clear_api_key() -> Result<(), String> {
    delete_api_key()
}

/// Whether a key exists + a masked hint for the settings screen. The key itself
/// never travels to the UI unless the user explicitly reveals it.
#[tauri::command]
pub fn api_key_hint() -> Result<(bool, String), String> {
    let key = get_api_key()?;
    if key.is_empty() {
        return Ok((false, String::new()));
    }
    let chars: Vec<char> = key.chars().collect();
    let hint = if chars.len() <= 8 {
        "•".repeat(chars.len())
    } else {
        let head: String = chars[..4].iter().collect();
        let tail: String = chars[chars.len() - 4..].iter().collect();
        format!("{head}…{tail}")
    };
    Ok((true, hint))
}
