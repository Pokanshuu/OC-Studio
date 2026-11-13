//! 「检查更新」的 GitHub 请求。
//!
//! 放在 Rust 侧而不是 WebView 的 `fetch`：GitHub API 对 **User-Agent**
//! 有要求，而浏览器不允许脚本设置这个头；Rust 还能把 GitHub 的 403 正文
//! 带回来，界面不用只显示一个状态码。

use reqwest::header::ACCEPT;

const LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/Pokanshuu/OC-Studio/releases/latest";

#[tauri::command]
pub async fn github_latest_release() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent(format!("OC-Studio/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|err| format!("创建网络客户端失败：{err}"))?;

    let response = client
        .get(LATEST_RELEASE_URL)
        .header(ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|err| format!("连不上 GitHub：{err}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("读取 GitHub 响应失败：{err}"))?;

    if !status.is_success() {
        // GitHub 的 403 正文里通常有 "API rate limit exceeded"；带回去比只报 403 有用。
        let message = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|value| value.get("message").and_then(|message| message.as_str()).map(str::to_owned))
            .unwrap_or_else(|| body.chars().take(200).collect());
        return Err(format!("GitHub 返回 {status}：{message}"));
    }

    Ok(body)
}
