//! Wire types shared with the React front end.
//!
//! Everything serialises as camelCase so the TypeScript side can use the
//! objects as-is. Optional columns mirror the SQLite schema 1:1.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: String,
    /// CREATIVE | ROLEPLAY | AGENT
    pub mode: String,
    pub provider: String,
    pub model: String,
    pub system_prompt: Option<String>,
    /// Agent sandbox root. `None` = agent tools disabled for this conversation.
    pub workspace: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub pinned: bool,
    pub pinned_at: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewConversation {
    pub mode: String,
    pub provider: String,
    pub model: String,
    pub system_prompt: Option<String>,
    pub workspace: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationPatch {
    pub title: Option<String>,
    pub mode: Option<String>,
    pub system_prompt: Option<String>,
    pub workspace: Option<String>,
    pub pinned: Option<bool>,
    pub model: Option<String>,
    pub provider: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub parent_id: String,
    pub variant_index: i64,
    pub active: bool,
    /// user | assistant | tool
    pub role: String,
    pub content: String,
    pub attachments: Option<String>,
    pub reasoning: Option<String>,
    /// Agent transcript (JSON array). Opaque to Rust: the shape belongs to the
    /// front end, exactly like `attachments`.
    pub steps: Option<String>,
    /// DONE | STREAMING | STOPPED | ERROR
    pub status: String,
    pub error_message: Option<String>,
    pub model: Option<String>,
    pub thinking_ms: Option<i64>,
    pub ttft_ms: Option<i64>,
    pub tps: Option<f64>,
    pub tokens_in: Option<i64>,
    pub tokens_out: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewMessage {
    pub id: Option<String>,
    pub conversation_id: String,
    pub parent_id: String,
    pub role: String,
    pub content: String,
    pub attachments: Option<String>,
    pub reasoning: Option<String>,
    pub steps: Option<String>,
    pub status: Option<String>,
    pub model: Option<String>,
    pub created_at: Option<i64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePatch {
    pub content: Option<String>,
    pub reasoning: Option<String>,
    pub steps: Option<String>,
    pub attachments: Option<String>,
    pub status: Option<String>,
    pub error_message: Option<String>,
    pub model: Option<String>,
    pub thinking_ms: Option<i64>,
    pub ttft_ms: Option<i64>,
    pub tps: Option<f64>,
    pub tokens_in: Option<i64>,
    pub tokens_out: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub conversation_id: String,
    pub text: String,
    pub updated_at: i64,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub content: String,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Compaction {
    pub id: String,
    pub conversation_id: String,
    pub through_message_id: String,
    pub summary: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub conversation_id: String,
    pub title: String,
    pub updated_at: i64,
    pub matched_title: bool,
    /// ±N characters around the first body match; empty when only the title hit.
    pub snippet: String,
    /// Byte offset of the query inside `snippet` (UTF-16 index, JS side safe).
    pub match_start: i64,
    pub match_len: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub conversations: i64,
    pub messages: i64,
    pub presets: i64,
    pub skipped: i64,
}

// ── agent tools ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolRequest {
    /// Tool name, e.g. `read_file`.
    pub name: String,
    /// Raw JSON arguments as produced by the model.
    pub args: serde_json::Value,
    /// Sandbox root. Every path resolves inside this directory.
    pub workspace: String,
    /// 用户在宿主里显式打开「Shell」高级授权后才为 true。
    /// 缺省（旧前端 / 直接构造）一律 false —— 默认拒绝。
    #[serde(default)]
    pub allow_shell: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResponse {
    /// Model-facing text. Truncated by the tool itself when huge.
    pub content: String,
    /// Set when the tool failed; `content` then carries the error text.
    pub is_error: bool,
    /// Optional structured payload for the UI (diffs, file lists, …).
    pub data: Option<serde_json::Value>,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResult {
    pub status: u16,
    pub body: String,
}
