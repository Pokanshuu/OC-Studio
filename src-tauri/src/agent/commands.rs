//! Tauri command surface. Thin wrappers: all logic lives in `db` / `tools`.

use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::agent::db;
use crate::agent::models::*;
use crate::agent::AppState;

type R<T> = Result<T, String>;

fn e<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

// ── conversations ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_conversations(state: State<'_, AppState>) -> R<Vec<Conversation>> {
    db::list_conversations(&state.db).map_err(e)
}

#[tauri::command]
pub async fn find_conversation(state: State<'_, AppState>, id: String) -> R<Option<Conversation>> {
    db::find_conversation(&state.db, &id).map_err(e)
}

#[tauri::command]
pub async fn create_conversation(
    state: State<'_, AppState>,
    input: NewConversation,
) -> R<Conversation> {
    db::create_conversation(&state.db, &input).map_err(e)
}

#[tauri::command]
pub async fn update_conversation(
    state: State<'_, AppState>,
    id: String,
    patch: ConversationPatch,
) -> R<Option<Conversation>> {
    db::update_conversation(&state.db, &id, &patch).map_err(e)
}

#[tauri::command]
pub async fn delete_conversation(state: State<'_, AppState>, id: String) -> R<()> {
    db::delete_conversation(&state.db, &id).map_err(e)
}

#[tauri::command]
pub async fn touch_conversation(state: State<'_, AppState>, id: String) -> R<()> {
    db::touch_conversation(&state.db, &id).map_err(e)
}

#[tauri::command]
pub async fn fork_conversation(
    state: State<'_, AppState>,
    conversation_id: String,
    message_id: String,
    title: Option<String>,
) -> R<Option<Conversation>> {
    db::fork_conversation(&state.db, &conversation_id, &message_id, title).map_err(e)
}

// ── messages ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn load_messages(state: State<'_, AppState>, conversation_id: String) -> R<Vec<Message>> {
    db::load_messages(&state.db, &conversation_id).map_err(e)
}

#[tauri::command]
pub async fn append_message(state: State<'_, AppState>, input: NewMessage) -> R<Message> {
    db::append_message(&state.db, &input).map_err(e)
}

#[tauri::command]
pub async fn update_message(state: State<'_, AppState>, id: String, patch: MessagePatch) -> R<()> {
    db::update_message(&state.db, &id, &patch).map_err(e)
}

#[tauri::command]
pub async fn set_active_variant(
    state: State<'_, AppState>,
    conversation_id: String,
    parent_id: String,
    message_id: String,
) -> R<()> {
    db::set_active_variant(&state.db, &conversation_id, &parent_id, &message_id).map_err(e)
}

#[tauri::command]
pub async fn delete_subtree(state: State<'_, AppState>, message_id: String) -> R<()> {
    db::delete_subtree(&state.db, &message_id).map_err(e)
}

// ── drafts ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_draft(state: State<'_, AppState>, conversation_id: String) -> R<Option<Draft>> {
    db::get_draft(&state.db, &conversation_id).map_err(e)
}

#[tauri::command]
pub async fn save_draft(
    state: State<'_, AppState>,
    conversation_id: String,
    text: String,
    title: Option<String>,
) -> R<()> {
    db::save_draft(&state.db, &conversation_id, &text, title.as_deref()).map_err(e)
}

#[tauri::command]
pub async fn clear_draft_title(state: State<'_, AppState>, conversation_id: String) -> R<()> {
    db::clear_draft_title(&state.db, &conversation_id).map_err(e)
}

#[tauri::command]
pub async fn list_drafts(state: State<'_, AppState>) -> R<Vec<Draft>> {
    db::list_drafts(&state.db).map_err(e)
}

// ── presets ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_presets(state: State<'_, AppState>) -> R<Vec<Preset>> {
    db::list_presets(&state.db).map_err(e)
}

#[tauri::command]
pub async fn save_preset(
    state: State<'_, AppState>,
    id: Option<String>,
    name: String,
    content: String,
    sort_order: Option<i64>,
) -> R<Preset> {
    db::upsert_preset(
        &state.db,
        id.as_deref(),
        &name,
        &content,
        sort_order.unwrap_or(0),
    )
    .map_err(e)
}

#[tauri::command]
pub async fn delete_preset(state: State<'_, AppState>, id: String) -> R<()> {
    db::delete_preset(&state.db, &id).map_err(e)
}

#[tauri::command]
pub async fn get_conversation_presets(
    state: State<'_, AppState>,
    conversation_id: String,
) -> R<Vec<(String, i64, bool)>> {
    db::conversation_presets(&state.db, &conversation_id).map_err(e)
}

#[tauri::command]
pub async fn set_conversation_presets(
    state: State<'_, AppState>,
    conversation_id: String,
    entries: Vec<(String, i64, bool)>,
) -> R<()> {
    db::set_conversation_presets(&state.db, &conversation_id, &entries).map_err(e)
}

// ── compactions ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_compaction(
    state: State<'_, AppState>,
    conversation_id: String,
) -> R<Option<Compaction>> {
    db::get_compaction(&state.db, &conversation_id).map_err(e)
}

#[tauri::command]
pub async fn save_compaction(
    state: State<'_, AppState>,
    conversation_id: String,
    through_message_id: String,
    summary: String,
) -> R<Compaction> {
    db::save_compaction(&state.db, &conversation_id, &through_message_id, &summary).map_err(e)
}

#[tauri::command]
pub async fn delete_compaction(state: State<'_, AppState>, conversation_id: String) -> R<()> {
    db::delete_compaction(&state.db, &conversation_id).map_err(e)
}

// ── settings / search / backup ──────────────────────────────────────────────

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> R<Option<String>> {
    db::get_setting(&state.db, "app").map_err(e)
}

#[tauri::command]
pub async fn save_settings(state: State<'_, AppState>, value: String) -> R<()> {
    db::set_setting(&state.db, "app", &value).map_err(e)
}

#[tauri::command]
pub async fn search_conversations(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> R<Vec<SearchHit>> {
    db::search(&state.db, &query, limit.unwrap_or(40)).map_err(e)
}

#[tauri::command]
pub async fn export_backup_to(state: State<'_, AppState>, path: String) -> R<i64> {
    let value = db::export_backup(&state.db).map_err(e)?;
    let text = serde_json::to_string_pretty(&value).map_err(e)?;
    std::fs::write(&path, text.as_bytes()).map_err(|err| format!("写入失败：{err}"))?;
    Ok(text.len() as i64)
}

#[tauri::command]
pub async fn import_backup_from(state: State<'_, AppState>, path: String) -> R<ImportSummary> {
    let text = std::fs::read_to_string(&path).map_err(|err| format!("读取失败：{err}"))?;
    let value: Value =
        serde_json::from_str(&text).map_err(|err| format!("不是合法的 JSON：{err}"))?;
    db::import_backup(&state.db, &value).map_err(e)
}

#[tauri::command]
pub async fn import_chatbox_from(
    state: State<'_, AppState>,
    path: String,
    provider: String,
    model: String,
) -> R<ImportSummary> {
    let text = std::fs::read_to_string(&path).map_err(|err| format!("读取失败：{err}"))?;
    let value: Value =
        serde_json::from_str(&text).map_err(|err| format!("不是合法的 JSON：{err}"))?;
    db::import_chatbox(&state.db, &value, &provider, &model).map_err(e)
}

// ── agent tools ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn run_tool(
    state: State<'_, AppState>,
    name: String,
    args: Value,
    workspace: String,
) -> R<ToolResponse> {
    let req = ToolRequest {
        name,
        args,
        workspace,
    };
    let response = crate::agent::tools::execute(&req, &state.client).await;
    Ok(response)
}

#[tauri::command]
pub async fn audit_tool_call(
    state: State<'_, AppState>,
    conversation_id: String,
    tool: String,
    args: String,
    ok: bool,
    duration_ms: i64,
) -> R<()> {
    db::audit_tool(&state.db, &conversation_id, &tool, &args, ok, duration_ms).map_err(e)
}

// ── files (attachments, export) ─────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFile {
    pub name: String,
    pub path: String,
    pub text: String,
    pub bytes: u64,
    /// true when the text was produced by extracting a container (docx/pdf).
    pub extracted: bool,
}

#[tauri::command]
pub async fn read_text_file(path: String) -> R<TextFile> {
    let file = std::path::Path::new(&path);
    let name = file
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    let lower = name.to_lowercase();

    if lower.ends_with(".docx") {
        let text = crate::agent::docx::extract(file)?;
        let bytes = std::fs::metadata(file).map(|m| m.len()).unwrap_or(0);
        return Ok(TextFile {
            name,
            path,
            text,
            bytes,
            extracted: true,
        });
    }

    let meta = std::fs::metadata(file).map_err(|err| format!("无法读取：{err}"))?;
    if meta.len() > 8 * 1024 * 1024 {
        return Err(format!("文件过大（{meta:?} 字节），请先裁剪"));
    }
    let bytes = std::fs::read(file).map_err(|err| format!("无法读取：{err}"))?;
    if bytes.iter().take(8000).any(|b| *b == 0) {
        return Err("这是二进制文件，无法作为文本附件".into());
    }
    let text = String::from_utf8_lossy(&bytes)
        .trim_start_matches('\u{feff}')
        .to_string();
    Ok(TextFile {
        name,
        path,
        text,
        bytes: meta.len(),
        extracted: false,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageFile {
    pub name: String,
    pub path: String,
    pub data_url: String,
    pub bytes: u64,
}

#[tauri::command]
pub async fn read_image_file(path: String) -> R<ImageFile> {
    use base64::Engine;
    let file = std::path::Path::new(&path);
    let name = file
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    let meta = std::fs::metadata(file).map_err(|err| format!("无法读取：{err}"))?;
    if meta.len() > 12 * 1024 * 1024 {
        return Err("图片超过 12 MB，请先压缩".into());
    }
    let mime = match file
        .extension()
        .map(|x| x.to_string_lossy().to_lowercase())
        .unwrap_or_default()
        .as_str()
    {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "image/jpeg",
    };
    let bytes = std::fs::read(file).map_err(|err| format!("无法读取：{err}"))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(ImageFile {
        name,
        path,
        data_url: format!("data:{mime};base64,{encoded}"),
        bytes: meta.len(),
    })
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> R<()> {
    std::fs::write(&path, content.as_bytes()).map_err(|err| format!("写入失败：{err}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub db_path: String,
}

#[tauri::command]
pub async fn app_info(state: State<'_, AppState>) -> R<AppInfo> {
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        data_dir: state.data_dir.to_string_lossy().to_string(),
        db_path: db::db_path(&state.data_dir).to_string_lossy().to_string(),
    })
}
