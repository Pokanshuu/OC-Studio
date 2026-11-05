//! Network edge: the *only* place that talks HTTP.
//!
//! The webview cannot POST to `api.deepseek.com` directly (no CORS headers, and
//! we do not want to weaken the CSP), so all traffic goes through Rust:
//!
//! * [`chat_stream`] proxies one SSE response and forwards **whole lines** to the
//!   front end. Splitting in Rust keeps multi-byte UTF-8 characters intact even
//!   when the transport splits them across chunks; the *protocol* parsing
//!   (`data:` framing, `[DONE]`, JSON) stays in TypeScript where it is a pure,
//!   unit-tested function.
//! * Cancellation is cooperative: the task `select!`s on a oneshot channel and
//!   drops the response the moment the user presses stop, which closes the
//!   socket immediately — the same guarantee the Android app got from
//!   `call.cancel()`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;

use crate::agent::secrets;
use crate::agent::AppState;

pub const EVENT: &str = "chat://stream";
pub const USER_AGENT: &str = "SimpleAgent/0.1.0 (Windows; Tauri)";

/// One message on the `chat://stream` channel.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamPayload {
    pub stream_id: String,
    /// `line` | `done` | `error`
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    /// Raw response body for non-2xx answers; parsed (and localised) in TS.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

fn emit(app: &AppHandle, payload: StreamPayload) {
    let _ = app.emit(EVENT, payload);
}

fn line_payload(stream_id: &str, line: String) -> StreamPayload {
    StreamPayload {
        stream_id: stream_id.to_string(),
        kind: "line".into(),
        line: Some(line),
        status: None,
        body: None,
        message: None,
    }
}

fn done_payload(stream_id: &str) -> StreamPayload {
    StreamPayload {
        stream_id: stream_id.to_string(),
        kind: "done".into(),
        line: None,
        status: None,
        body: None,
        message: None,
    }
}

fn error_payload(
    stream_id: &str,
    status: Option<u16>,
    body: Option<String>,
    message: Option<String>,
) -> StreamPayload {
    StreamPayload {
        stream_id: stream_id.to_string(),
        kind: "error".into(),
        line: None,
        status,
        body,
        message,
    }
}

/// Start a streaming completion. Returns as soon as the task is spawned; the
/// caller listens on [`EVENT`] for the payloads.
#[tauri::command]
pub async fn chat_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    stream_id: String,
    url: String,
    headers: HashMap<String, String>,
    body: serde_json::Value,
) -> Result<(), String> {
    let client = state.client.clone();
    let registry = state.streams.clone();
    let api_key = secrets::get_api_key().unwrap_or_default();

    // Regenerate reuses ids: cancel whatever is still running under this one.
    if let Some(old) = registry.lock().unwrap().remove(&stream_id) {
        let _ = old.send(());
    }

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    registry
        .lock()
        .unwrap()
        .insert(stream_id.clone(), cancel_tx);

    let sid = stream_id.clone();
    tauri::async_runtime::spawn(async move {
        match run_stream(&app, &client, &sid, url, headers, api_key, body, cancel_rx).await {
            Ok(()) => {}
            Err(failure) => emit(&app, error_payload(&sid, None, None, Some(failure))),
        }
        emit(&app, done_payload(&sid));
        registry.lock().unwrap().remove(&sid);
    });

    Ok(())
}

async fn run_stream(
    app: &AppHandle,
    client: &reqwest::Client,
    stream_id: &str,
    url: String,
    headers: HashMap<String, String>,
    api_key: String,
    body: serde_json::Value,
    mut cancel: oneshot::Receiver<()>,
) -> Result<(), String> {
    let mut request = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .header("User-Agent", USER_AGENT);

    if !api_key.trim().is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key.trim()));
    }
    for (name, value) in &headers {
        if name.eq_ignore_ascii_case("authorization") {
            continue; // the keyring is the single source of truth
        }
        request = request.header(name.as_str(), value.as_str());
    }

    let payload = serde_json::to_vec(&body).map_err(|e| e.to_string())?;
    let response = tokio::select! {
        _ = &mut cancel => return Ok(()),
        result = request.body(payload).send() => result.map_err(|e| format!("连接失败：{e}"))?,
    };

    let status = response.status();
    if !status.is_success() {
        let code = status.as_u16();
        let text = response.text().await.unwrap_or_default();
        emit(app, error_payload(stream_id, Some(code), Some(text), None));
        return Ok(());
    }

    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::with_capacity(8192);
    let mut cancelled = false;

    loop {
        let chunk = tokio::select! {
            biased;
            _ = &mut cancel, if !cancelled => {
                cancelled = true;
                break;
            }
            next = stream.next() => next,
        };

        let Some(chunk) = chunk else { break };
        let chunk = chunk.map_err(|e| format!("读取中断：{e}"))?;
        buffer.extend_from_slice(&chunk);

        // Emit every complete line; the remainder stays buffered.
        let mut start = 0usize;
        while let Some(pos) = buffer[start..].iter().position(|b| *b == b'\n') {
            let end = start + pos;
            // A line boundary is always a char boundary, so lossy decoding is safe.
            let mut line = String::from_utf8_lossy(&buffer[start..end]).into_owned();
            if line.ends_with('\r') {
                line.pop();
            }
            emit(app, line_payload(stream_id, line));
            start = end + 1;
        }
        if start > 0 {
            buffer.drain(..start);
        }
    }

    if !cancelled && !buffer.is_empty() {
        emit(
            app,
            line_payload(
                stream_id,
                String::from_utf8_lossy(&buffer)
                    .trim_end_matches('\r')
                    .to_string(),
            ),
        );
    }
    Ok(())
}

#[tauri::command]
pub fn cancel_stream(state: State<'_, AppState>, stream_id: String) -> Result<(), String> {
    if let Some(tx) = state.streams.lock().unwrap().remove(&stream_id) {
        let _ = tx.send(());
    }
    Ok(())
}

/// Plain GET used by `/models`, the connection probe and the agent's
/// `fetch_url` tool.
#[tauri::command]
pub async fn http_get(
    state: State<'_, AppState>,
    url: String,
    headers: HashMap<String, String>,
) -> Result<crate::agent::models::HttpResult, String> {
    let api_key = secrets::get_api_key().unwrap_or_default();
    let mut request = state
        .client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .timeout(std::time::Duration::from_secs(45));

    if !api_key.trim().is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key.trim()));
    }
    for (name, value) in &headers {
        if name.eq_ignore_ascii_case("authorization") {
            continue;
        }
        request = request.header(name.as_str(), value.as_str());
    }

    let response = request.send().await.map_err(|e| format!("连接失败：{e}"))?;
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    Ok(crate::agent::models::HttpResult { status, body })
}

pub fn build_client() -> reqwest::Client {
    // No overall timeout: a thinking model can stay silent for tens of seconds
    // while still being perfectly healthy. Only the connect phase is bounded.
    reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .build()
        .expect("failed to build http client")
}

pub type StreamRegistry = Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>;
