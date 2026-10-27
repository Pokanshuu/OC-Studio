//! 用系统默认程序打开外部链接（GitHub、依赖主页…）。
//!
//! 为什么自建命令而不是加 opener 插件：这里只需要做一件事 —— 打开 http/https。
//! 插件要额外引入 JS 包 + 权限 scope，而我们已经有自建命令的先例（`vault.rs`）。
//!
//! 安全边界：
//! - 只放行 `http://` / `https://`，`file:`、`javascript:`、`cmd` 参数一律拒绝
//! - **不经过 shell**：Windows 走 `rundll32 url.dll,FileProtocolHandler`，
//!   macOS 走 `open`，Linux 走 `xdg-open`，因此没有命令注入面

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !is_allowed(&url) {
        return Err("只允许打开 http/https 链接".into());
    }
    spawn(&url)
}

/// URL 白名单：协议 + 字符集（拒绝控制字符、空白与 shell 元字符）
fn is_allowed(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return false;
    }
    !url
        .chars()
        .any(|c| c.is_control() || c.is_whitespace() || matches!(c, '"' | '\'' | '&' | '|' | '<' | '>' | '^' | '`' | '\\'))
}

#[cfg(target_os = "windows")]
fn spawn(url: &str) -> Result<(), String> {
    use std::process::Command;
    Command::new("rundll32")
        .arg("url.dll,FileProtocolHandler")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("打开链接失败：{e}"))
}

#[cfg(target_os = "macos")]
fn spawn(url: &str) -> Result<(), String> {
    use std::process::Command;
    Command::new("open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("打开链接失败：{e}"))
}

#[cfg(all(
    unix,
    not(target_os = "macos"),
    not(any(target_os = "android", target_os = "ios"))
))]
fn spawn(url: &str) -> Result<(), String> {
    use std::process::Command;
    Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("打开链接失败：{e}"))
}

#[cfg(any(target_os = "android", target_os = "ios", not(any(unix, windows))))]
fn spawn(_url: &str) -> Result<(), String> {
    Err("当前平台不支持打开外部链接".into())
}

#[cfg(test)]
mod tests {
    use super::is_allowed;

    #[test]
    fn accepts_only_http_schemes() {
        assert!(is_allowed("https://github.com/Pokanshuu/OC-Studio"));
        assert!(is_allowed("http://example.com/a?b=1#c"));
        assert!(!is_allowed("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_allowed("javascript:alert(1)"));
        assert!(!is_allowed("ms-settings:"));
    }

    #[test]
    fn rejects_shell_metacharacters() {
        assert!(!is_allowed("https://example.com/\" & calc"));
        assert!(!is_allowed("https://example.com/a b"));
        assert!(!is_allowed("https://example.com/|whoami"));
        assert!(!is_allowed("https://example.com/\ncalc"));
    }
}
