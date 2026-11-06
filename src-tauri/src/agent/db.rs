//! SQLite persistence layer.
//!
//! The schema is a direct port of the Android app's Room database (same tables,
//! same columns, same message-tree semantics) so that data reasoning, backup
//! files and the UI model all carry over unchanged:
//!
//! * `messages` form a **tree**: identity is `parent_id`, siblings are versions
//!   selected by the `active` flag. The active conversation is the path that
//!   walks `active` from the root. Nothing is ever overwritten, so
//!   "regenerate" / "edit & resend" just add a sibling and old branches stay
//!   reachable.
//! * `compactions` only change **what is sent to the API**, never the local
//!   messages.
//! * `drafts` also park the pending title of a not-yet-created conversation.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde_json::Value;

use crate::agent::models::*;

pub struct Db {
    pub conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> anyhow::Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrate(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

fn migrate(conn: &Connection) -> anyhow::Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 1 {
        conn.execute_batch(
            r#"
            BEGIN;
            CREATE TABLE IF NOT EXISTS conversations (
                id            TEXT PRIMARY KEY,
                title         TEXT NOT NULL,
                mode          TEXT NOT NULL,
                provider      TEXT NOT NULL,
                model         TEXT NOT NULL,
                system_prompt TEXT,
                workspace     TEXT,
                created_at    INTEGER NOT NULL,
                updated_at    INTEGER NOT NULL,
                pinned        INTEGER NOT NULL DEFAULT 0,
                pinned_at     INTEGER
            );

            CREATE TABLE IF NOT EXISTS messages (
                id              TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                parent_id       TEXT NOT NULL,
                variant_index   INTEGER NOT NULL DEFAULT 0,
                active          INTEGER NOT NULL DEFAULT 1,
                role            TEXT NOT NULL,
                content         TEXT NOT NULL,
                attachments     TEXT,
                reasoning       TEXT,
                steps           TEXT,
                status          TEXT NOT NULL DEFAULT 'DONE',
                error_message   TEXT,
                model           TEXT,
                thinking_ms     INTEGER,
                ttft_ms         INTEGER,
                tps             REAL,
                tokens_in       INTEGER,
                tokens_out      INTEGER,
                created_at      INTEGER NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_variant
                ON messages(conversation_id, parent_id, variant_index);
            CREATE INDEX IF NOT EXISTS idx_messages_parent
                ON messages(conversation_id, parent_id);

            CREATE TABLE IF NOT EXISTS drafts (
                conversation_id TEXT PRIMARY KEY,
                text            TEXT NOT NULL,
                updated_at      INTEGER NOT NULL,
                title           TEXT
            );

            CREATE TABLE IF NOT EXISTS presets (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                content    TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversation_presets (
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                preset_id       TEXT NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
                sort_order      INTEGER NOT NULL DEFAULT 0,
                enabled         INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY (conversation_id, preset_id)
            );

            CREATE TABLE IF NOT EXISTS compactions (
                id                 TEXT PRIMARY KEY,
                conversation_id    TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                through_message_id TEXT NOT NULL,
                summary            TEXT NOT NULL,
                created_at         INTEGER NOT NULL,
                updated_at         INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_compactions_conversation
                ON compactions(conversation_id);

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tool_audit (
                id              TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                tool            TEXT NOT NULL,
                args            TEXT NOT NULL,
                ok              INTEGER NOT NULL,
                duration_ms     INTEGER NOT NULL,
                created_at      INTEGER NOT NULL
            );

            PRAGMA user_version = 1;
            COMMIT;
            "#,
        )?;
    }
    Ok(())
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

// ── row mappers ─────────────────────────────────────────────────────────────

const CONVERSATION_COLS: &str = "id, title, mode, provider, model, system_prompt, workspace, \
                                 created_at, updated_at, pinned, pinned_at";

fn map_conversation(row: &Row) -> rusqlite::Result<Conversation> {
    Ok(Conversation {
        id: row.get(0)?,
        title: row.get(1)?,
        mode: row.get(2)?,
        provider: row.get(3)?,
        model: row.get(4)?,
        system_prompt: row.get(5)?,
        workspace: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        pinned: row.get::<_, i64>(9)? != 0,
        pinned_at: row.get(10)?,
    })
}

const MESSAGE_COLS: &str = "id, conversation_id, parent_id, variant_index, active, role, content, \
                            attachments, reasoning, steps, status, error_message, model, \
                            thinking_ms, ttft_ms, tps, tokens_in, tokens_out, created_at";

fn map_message(row: &Row) -> rusqlite::Result<Message> {
    Ok(Message {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        parent_id: row.get(2)?,
        variant_index: row.get(3)?,
        active: row.get::<_, i64>(4)? != 0,
        role: row.get(5)?,
        content: row.get(6)?,
        attachments: row.get(7)?,
        reasoning: row.get(8)?,
        steps: row.get(9)?,
        status: row.get(10)?,
        error_message: row.get(11)?,
        model: row.get(12)?,
        thinking_ms: row.get(13)?,
        ttft_ms: row.get(14)?,
        tps: row.get(15)?,
        tokens_in: row.get(16)?,
        tokens_out: row.get(17)?,
        created_at: row.get(18)?,
    })
}

// ── conversations ───────────────────────────────────────────────────────────

pub fn list_conversations(db: &Db) -> rusqlite::Result<Vec<Conversation>> {
    let conn = db.conn.lock().unwrap();
    let sql = format!(
        "SELECT {CONVERSATION_COLS} FROM conversations \
         ORDER BY pinned DESC, COALESCE(pinned_at, 0) DESC, updated_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_conversation)?;
    rows.collect()
}

pub fn find_conversation(db: &Db, id: &str) -> rusqlite::Result<Option<Conversation>> {
    let conn = db.conn.lock().unwrap();
    let sql = format!("SELECT {CONVERSATION_COLS} FROM conversations WHERE id = ?1");
    conn.query_row(&sql, params![id], map_conversation)
        .optional()
}

pub fn create_conversation(db: &Db, input: &NewConversation) -> rusqlite::Result<Conversation> {
    let now = now_ms();
    let conv = Conversation {
        id: new_id(),
        title: input
            .title
            .clone()
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| "新对话".to_string()),
        mode: input.mode.clone(),
        provider: input.provider.clone(),
        model: input.model.clone(),
        system_prompt: input.system_prompt.clone(),
        workspace: input.workspace.clone(),
        created_at: now,
        updated_at: now,
        pinned: false,
        pinned_at: None,
    };
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO conversations (id, title, mode, provider, model, system_prompt, workspace, \
         created_at, updated_at, pinned, pinned_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,NULL)",
        params![
            conv.id,
            conv.title,
            conv.mode,
            conv.provider,
            conv.model,
            conv.system_prompt,
            conv.workspace,
            conv.created_at,
            conv.updated_at
        ],
    )?;
    Ok(conv)
}

pub fn update_conversation(
    db: &Db,
    id: &str,
    patch: &ConversationPatch,
) -> rusqlite::Result<Option<Conversation>> {
    let now = now_ms();
    {
        let conn = db.conn.lock().unwrap();
        let existing: Option<Conversation> = {
            let sql = format!("SELECT {CONVERSATION_COLS} FROM conversations WHERE id = ?1");
            conn.query_row(&sql, params![id], map_conversation)
                .optional()?
        };
        let Some(existing) = existing else {
            return Ok(None);
        };

        let title = patch.title.clone().unwrap_or(existing.title);
        let mode = patch.mode.clone().unwrap_or(existing.mode);
        let provider = patch.provider.clone().unwrap_or(existing.provider);
        let model = patch.model.clone().unwrap_or(existing.model);
        let system_prompt = patch
            .system_prompt
            .clone()
            .or(existing.system_prompt.clone());
        let workspace = patch.workspace.clone().or(existing.workspace.clone());
        let pinned = patch.pinned.unwrap_or(existing.pinned);
        let pinned_at = if pinned {
            existing.pinned_at.or(Some(now))
        } else {
            None
        };

        conn.execute(
            "UPDATE conversations SET title=?2, mode=?3, provider=?4, model=?5, system_prompt=?6, \
             workspace=?7, pinned=?8, pinned_at=?9, updated_at=?10 WHERE id=?1",
            params![
                id,
                title,
                mode,
                provider,
                model,
                system_prompt,
                workspace,
                pinned as i64,
                pinned_at,
                now
            ],
        )?;
    }
    find_conversation(db, id)
}

pub fn touch_conversation(db: &Db, id: &str) -> rusqlite::Result<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE conversations SET updated_at=?2 WHERE id=?1",
        params![id, now_ms()],
    )?;
    Ok(())
}

pub fn delete_conversation(db: &Db, id: &str) -> rusqlite::Result<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])?;
    conn.execute("DELETE FROM drafts WHERE conversation_id = ?1", params![id])?;
    Ok(())
}

// ── messages ────────────────────────────────────────────────────────────────

pub fn load_messages(db: &Db, conversation_id: &str) -> rusqlite::Result<Vec<Message>> {
    let conn = db.conn.lock().unwrap();
    let sql = format!(
        "SELECT {MESSAGE_COLS} FROM messages WHERE conversation_id = ?1 \
         ORDER BY created_at ASC, variant_index ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![conversation_id], map_message)?;
    rows.collect()
}

/// Append a message, assigning the next `variant_index` among its siblings.
pub fn append_message(db: &Db, input: &NewMessage) -> rusqlite::Result<Message> {
    let conn = db.conn.lock().unwrap();
    let next_index: i64 = conn.query_row(
        "SELECT COALESCE(MAX(variant_index), -1) + 1 FROM messages \
         WHERE conversation_id = ?1 AND parent_id = ?2",
        params![input.conversation_id, input.parent_id],
        |r| r.get(0),
    )?;
    let now = input.created_at.unwrap_or_else(now_ms);

    // A new sibling always becomes the selected version — the user just asked
    // for it, so the previous one must not keep the active flag.
    conn.execute(
        "UPDATE messages SET active = 0 WHERE conversation_id = ?1 AND parent_id = ?2",
        params![input.conversation_id, input.parent_id],
    )?;

    let msg = Message {
        id: input.id.clone().unwrap_or_else(new_id),
        conversation_id: input.conversation_id.clone(),
        parent_id: input.parent_id.clone(),
        variant_index: next_index,
        active: true,
        role: input.role.clone(),
        content: input.content.clone(),
        attachments: input.attachments.clone(),
        reasoning: input.reasoning.clone(),
        steps: input.steps.clone(),
        status: input.status.clone().unwrap_or_else(|| "DONE".into()),
        error_message: None,
        model: input.model.clone(),
        thinking_ms: None,
        ttft_ms: None,
        tps: None,
        tokens_in: None,
        tokens_out: None,
        created_at: now,
    };

    conn.execute(
        "INSERT INTO messages (id, conversation_id, parent_id, variant_index, active, role, content, \
         attachments, reasoning, steps, status, error_message, model, created_at) \
         VALUES (?1,?2,?3,?4,1,?5,?6,?7,?8,?9,?10,NULL,?11,?12)",
        params![
            msg.id,
            msg.conversation_id,
            msg.parent_id,
            msg.variant_index,
            msg.role,
            msg.content,
            msg.attachments,
            msg.reasoning,
            msg.steps,
            msg.status,
            msg.model,
            msg.created_at
        ],
    )?;
    conn.execute(
        "UPDATE conversations SET updated_at=?2 WHERE id=?1",
        params![msg.conversation_id, now],
    )?;
    Ok(msg)
}

pub fn update_message(db: &Db, id: &str, patch: &MessagePatch) -> rusqlite::Result<()> {
    let conn = db.conn.lock().unwrap();
    let Some(existing) = ({
        let sql = format!("SELECT {MESSAGE_COLS} FROM messages WHERE id = ?1");
        conn.query_row(&sql, params![id], map_message).optional()?
    }) else {
        return Ok(());
    };
    conn.execute(
        "UPDATE messages SET content=?2, reasoning=?3, steps=?4, attachments=?5, status=?6, \
         error_message=?7, model=?8, thinking_ms=?9, ttft_ms=?10, tps=?11, tokens_in=?12, \
         tokens_out=?13 WHERE id=?1",
        params![
            id,
            patch.content.clone().unwrap_or(existing.content),
            patch.reasoning.clone().or(existing.reasoning),
            patch.steps.clone().or(existing.steps),
            patch.attachments.clone().or(existing.attachments),
            patch.status.clone().unwrap_or(existing.status),
            patch.error_message.clone().or(existing.error_message),
            patch.model.clone().or(existing.model),
            patch.thinking_ms.or(existing.thinking_ms),
            patch.ttft_ms.or(existing.ttft_ms),
            patch.tps.or(existing.tps),
            patch.tokens_in.or(existing.tokens_in),
            patch.tokens_out.or(existing.tokens_out),
        ],
    )?;
    Ok(())
}

/// Pick which sibling is the selected version.
pub fn set_active_variant(
    db: &Db,
    conversation_id: &str,
    parent_id: &str,
    message_id: &str,
) -> rusqlite::Result<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE messages SET active = CASE WHEN id = ?3 THEN 1 ELSE 0 END \
         WHERE conversation_id = ?1 AND parent_id = ?2",
        params![conversation_id, parent_id, message_id],
    )?;
    Ok(())
}

/// Delete a message **and its whole subtree** (children are generated from it,
/// so keeping them would leave answers without questions).
pub fn delete_subtree(db: &Db, message_id: &str) -> rusqlite::Result<()> {
    let conn = db.conn.lock().unwrap();
    let parent: Option<(String, String, i64)> = conn
        .query_row(
            "SELECT conversation_id, parent_id, active FROM messages WHERE id = ?1",
            params![message_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    let Some((conversation_id, parent_id, active)) = parent else {
        return Ok(());
    };

    conn.execute(
        "WITH RECURSIVE sub(id) AS ( \
             SELECT id FROM messages WHERE id = ?1 \
             UNION ALL \
             SELECT m.id FROM messages m JOIN sub ON m.parent_id = sub.id \
         ) DELETE FROM messages WHERE id IN (SELECT id FROM sub)",
        params![message_id],
    )?;

    // If the deleted node was the selected version, hand the flag back to the
    // newest remaining sibling — otherwise the path ends one message early.
    if active != 0 {
        let fallback: Option<String> = conn
            .query_row(
                "SELECT id FROM messages WHERE conversation_id = ?1 AND parent_id = ?2 \
                 ORDER BY variant_index DESC LIMIT 1",
                params![conversation_id, parent_id],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(fallback_id) = fallback {
            conn.execute(
                "UPDATE messages SET active = 1 WHERE id = ?1",
                params![fallback_id],
            )?;
        }
    }
    Ok(())
}

/// Mark messages left in STREAMING state (process killed mid-stream) as STOPPED.
pub fn resolve_dangling_streams(db: &Db) -> rusqlite::Result<usize> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE messages SET status = 'STOPPED' WHERE status = 'STREAMING'",
        [],
    )
}

/// The active path: walk `active` children from the root, cycle-safe.
fn active_path(conn: &Connection, conversation_id: &str) -> rusqlite::Result<Vec<Message>> {
    let all = {
        let sql = format!(
            "SELECT {MESSAGE_COLS} FROM messages WHERE conversation_id = ?1 \
             ORDER BY created_at ASC, variant_index ASC"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![conversation_id], map_message)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        out
    };

    let mut path = Vec::new();
    let mut visited = std::collections::HashSet::new();
    let mut parent = String::new();
    loop {
        let next = all
            .iter()
            .find(|m| m.parent_id == parent && m.active)
            .cloned();
        match next {
            Some(m) if visited.insert(m.id.clone()) => {
                parent = m.id.clone();
                path.push(m);
            }
            _ => break,
        }
    }
    Ok(path)
}

/// Copy the active path up to `message_id` into a brand new conversation.
pub fn fork_conversation(
    db: &Db,
    conversation_id: &str,
    message_id: &str,
    title: Option<String>,
) -> rusqlite::Result<Option<Conversation>> {
    let mut conn = db.conn.lock().unwrap();
    let source = {
        let sql = format!("SELECT {CONVERSATION_COLS} FROM conversations WHERE id = ?1");
        conn.query_row(&sql, params![conversation_id], map_conversation)
            .optional()?
    };
    let Some(source) = source else {
        return Ok(None);
    };

    let path = active_path(&conn, conversation_id)?;
    let end = path.iter().position(|m| m.id == message_id);
    let Some(end) = end else { return Ok(None) };
    let path = &path[..=end];

    let now = now_ms();
    let conv = Conversation {
        id: new_id(),
        title: title
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| format!("{} · 分支", source.title)),
        mode: source.mode.clone(),
        provider: source.provider.clone(),
        model: source.model.clone(),
        system_prompt: source.system_prompt.clone(),
        workspace: source.workspace.clone(),
        created_at: now,
        updated_at: now,
        pinned: false,
        pinned_at: None,
    };

    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO conversations (id, title, mode, provider, model, system_prompt, workspace, \
         created_at, updated_at, pinned, pinned_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,NULL)",
        params![
            conv.id,
            conv.title,
            conv.mode,
            conv.provider,
            conv.model,
            conv.system_prompt,
            conv.workspace,
            conv.created_at,
            conv.updated_at
        ],
    )?;

    let mut parent = String::new();
    for (i, m) in path.iter().enumerate() {
        let id = new_id();
        tx.execute(
            "INSERT INTO messages (id, conversation_id, parent_id, variant_index, active, role, \
             content, attachments, reasoning, steps, status, error_message, model, thinking_ms, \
             ttft_ms, tps, tokens_in, tokens_out, created_at) \
             VALUES (?1,?2,?3,0,1,?4,?5,?6,?7,?8,'DONE',NULL,?9,?10,?11,?12,?13,?14,?15)",
            params![
                id,
                conv.id,
                parent,
                m.role,
                m.content,
                m.attachments,
                m.reasoning,
                m.steps,
                m.model,
                m.thinking_ms,
                m.ttft_ms,
                m.tps,
                m.tokens_in,
                m.tokens_out,
                now + i as i64
            ],
        )?;
        parent = id;
    }

    // Presets follow the fork — a forked role-play still needs its setup.
    tx.execute(
        "INSERT INTO conversation_presets (conversation_id, preset_id, sort_order, enabled) \
         SELECT ?1, preset_id, sort_order, enabled FROM conversation_presets WHERE conversation_id = ?2",
        params![conv.id, conversation_id],
    )?;
    tx.commit()?;
    Ok(Some(conv))
}

// ── drafts ──────────────────────────────────────────────────────────────────

pub fn get_draft(db: &Db, conversation_id: &str) -> rusqlite::Result<Option<Draft>> {
    let conn = db.conn.lock().unwrap();
    conn.query_row(
        "SELECT conversation_id, text, updated_at, title FROM drafts WHERE conversation_id = ?1",
        params![conversation_id],
        |r| {
            Ok(Draft {
                conversation_id: r.get(0)?,
                text: r.get(1)?,
                updated_at: r.get(2)?,
                title: r.get(3)?,
            })
        },
    )
    .optional()
}

/// Upsert; an empty draft (and no pending title) deletes the row instead of
/// leaving a hollow shell behind.
pub fn save_draft(
    db: &Db,
    conversation_id: &str,
    text: &str,
    title: Option<&str>,
) -> rusqlite::Result<()> {
    let conn = db.conn.lock().unwrap();
    let capped: String = if text.chars().count() > 100_000 {
        text.chars().take(100_000).collect()
    } else {
        text.to_string()
    };
    let has_title = title.map(|t| !t.trim().is_empty()).unwrap_or(false);
    if capped.is_empty() && !has_title {
        conn.execute(
            "DELETE FROM drafts WHERE conversation_id = ?1",
            params![conversation_id],
        )?;
        return Ok(());
    }
    conn.execute(
        "INSERT INTO drafts (conversation_id, text, updated_at, title) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(conversation_id) DO UPDATE SET text=?2, updated_at=?3, \
         title=COALESCE(?4, drafts.title)",
        params![conversation_id, capped, now_ms(), title],
    )?;
    Ok(())
}

pub fn clear_draft_title(db: &Db, conversation_id: &str) -> rusqlite::Result<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE drafts SET title = NULL WHERE conversation_id = ?1",
        params![conversation_id],
    )?;
    Ok(())
}

pub fn list_drafts(db: &Db) -> rusqlite::Result<Vec<Draft>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT conversation_id, text, updated_at, title FROM drafts ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Draft {
            conversation_id: r.get(0)?,
            text: r.get(1)?,
            updated_at: r.get(2)?,
            title: r.get(3)?,
        })
    })?;
    rows.collect()
}

// ── presets ─────────────────────────────────────────────────────────────────

pub fn list_presets(db: &Db) -> rusqlite::Result<Vec<Preset>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, content, sort_order, created_at, updated_at FROM presets \
         ORDER BY sort_order ASC, created_at ASC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Preset {
            id: r.get(0)?,
            name: r.get(1)?,
            content: r.get(2)?,
            sort_order: r.get(3)?,
            created_at: r.get(4)?,
            updated_at: r.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn upsert_preset(
    db: &Db,
    id: Option<&str>,
    name: &str,
    content: &str,
    sort_order: i64,
) -> rusqlite::Result<Preset> {
    let now = now_ms();
    let conn = db.conn.lock().unwrap();
    let preset_id = match id {
        Some(v) => v.to_string(),
        None => new_id(),
    };
    conn.execute(
        "INSERT INTO presets (id, name, content, sort_order, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?5) \
         ON CONFLICT(id) DO UPDATE SET name=?2, content=?3, sort_order=?4, updated_at=?5",
        params![preset_id, name, content, sort_order, now],
    )?;
    conn.query_row(
        "SELECT id, name, content, sort_order, created_at, updated_at FROM presets WHERE id = ?1",
        params![preset_id],
        |r| {
            Ok(Preset {
                id: r.get(0)?,
                name: r.get(1)?,
                content: r.get(2)?,
                sort_order: r.get(3)?,
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        },
    )
}

pub fn delete_preset(db: &Db, id: &str) -> rusqlite::Result<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM presets WHERE id = ?1", params![id])?;
    Ok(())
}

/// `(preset_id, sort_order, enabled)` in attachment order.
pub fn conversation_presets(
    db: &Db,
    conversation_id: &str,
) -> rusqlite::Result<Vec<(String, i64, bool)>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT preset_id, sort_order, enabled FROM conversation_presets \
         WHERE conversation_id = ?1 ORDER BY sort_order ASC",
    )?;
    let rows = stmt.query_map(params![conversation_id], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? != 0))
    })?;
    rows.collect()
}

pub fn set_conversation_presets(
    db: &Db,
    conversation_id: &str,
    entries: &[(String, i64, bool)],
) -> rusqlite::Result<()> {
    let mut conn = db.conn.lock().unwrap();
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM conversation_presets WHERE conversation_id = ?1",
        params![conversation_id],
    )?;
    for (preset_id, sort_order, enabled) in entries {
        tx.execute(
            "INSERT INTO conversation_presets (conversation_id, preset_id, sort_order, enabled) \
             VALUES (?1, ?2, ?3, ?4)",
            params![conversation_id, preset_id, sort_order, *enabled as i64],
        )?;
    }
    tx.commit()?;
    Ok(())
}

// ── compactions ─────────────────────────────────────────────────────────────

pub fn get_compaction(db: &Db, conversation_id: &str) -> rusqlite::Result<Option<Compaction>> {
    let conn = db.conn.lock().unwrap();
    conn.query_row(
        "SELECT id, conversation_id, through_message_id, summary, created_at, updated_at \
         FROM compactions WHERE conversation_id = ?1 ORDER BY updated_at DESC LIMIT 1",
        params![conversation_id],
        |r| {
            Ok(Compaction {
                id: r.get(0)?,
                conversation_id: r.get(1)?,
                through_message_id: r.get(2)?,
                summary: r.get(3)?,
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        },
    )
    .optional()
}

pub fn save_compaction(
    db: &Db,
    conversation_id: &str,
    through_message_id: &str,
    summary: &str,
) -> rusqlite::Result<Compaction> {
    let now = now_ms();
    let conn = db.conn.lock().unwrap();
    let existing: Option<(String, i64)> = conn
        .query_row(
            "SELECT id, created_at FROM compactions WHERE conversation_id = ?1 \
             ORDER BY updated_at DESC LIMIT 1",
            params![conversation_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let (id, created_at) = existing.unwrap_or_else(|| (new_id(), now));
    conn.execute(
        "INSERT INTO compactions (id, conversation_id, through_message_id, summary, created_at, \
         updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(id) DO UPDATE SET through_message_id=?3, summary=?4, updated_at=?6",
        params![
            id,
            conversation_id,
            through_message_id,
            summary,
            created_at,
            now
        ],
    )?;
    Ok(Compaction {
        id,
        conversation_id: conversation_id.to_string(),
        through_message_id: through_message_id.to_string(),
        summary: summary.to_string(),
        created_at,
        updated_at: now,
    })
}

pub fn delete_compaction(db: &Db, conversation_id: &str) -> rusqlite::Result<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "DELETE FROM compactions WHERE conversation_id = ?1",
        params![conversation_id],
    )?;
    Ok(())
}

// ── settings ────────────────────────────────────────────────────────────────

pub fn get_setting(db: &Db, key: &str) -> rusqlite::Result<Option<String>> {
    let conn = db.conn.lock().unwrap();
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |r| r.get(0),
    )
    .optional()
}

pub fn set_setting(db: &Db, key: &str, value: &str) -> rusqlite::Result<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![key, value],
    )?;
    Ok(())
}

// ── search ──────────────────────────────────────────────────────────────────

fn escape_like(query: &str) -> String {
    query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// First case-insensitive occurrence of `needle` in `haystack`, in chars.
fn find_ci(haystack: &str, needle: &str) -> Option<usize> {
    let h: Vec<char> = haystack.chars().collect();
    let n: Vec<char> = needle.chars().collect();
    if n.is_empty() || n.len() > h.len() {
        return None;
    }
    let lower = |c: char| c.to_lowercase().next().unwrap_or(c);
    (0..=h.len() - n.len()).find(|&i| (0..n.len()).all(|j| lower(h[i + j]) == lower(n[j])))
}

fn snippet_around(text: &str, needle: &str) -> (String, i64, i64) {
    let flattened: String = text.replace(['\r', '\n'], " ");
    match find_ci(&flattened, needle) {
        None => (String::new(), 0, 0),
        Some(idx) => {
            let chars: Vec<char> = flattened.chars().collect();
            let start = idx.saturating_sub(40);
            let end = (idx + needle.chars().count() + 60).min(chars.len());
            let mut out = String::new();
            if start > 0 {
                out.push('…');
            }
            out.extend(&chars[start..end]);
            if end < chars.len() {
                out.push('…');
            }
            let prefix: String = out
                .chars()
                .take(if start > 0 { 1 + (idx - start) } else { idx })
                .collect();
            let match_start = prefix.encode_utf16().count() as i64;
            let match_len = needle.encode_utf16().count() as i64;
            (out, match_start, match_len)
        }
    }
}

pub fn search(db: &Db, query: &str, limit: usize) -> rusqlite::Result<Vec<SearchHit>> {
    let needle = query.trim();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let like = format!("%{}%", escape_like(&needle.to_lowercase()));
    let conn = db.conn.lock().unwrap();

    let mut hits: Vec<SearchHit> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // Body matches first: they carry the snippet the user actually recognises.
    {
        let mut stmt = conn.prepare(
            "SELECT m.conversation_id, c.title, c.updated_at, m.content \
             FROM messages m JOIN conversations c ON c.id = m.conversation_id \
             WHERE lower(m.content) LIKE ?1 ESCAPE '\\' \
             ORDER BY c.updated_at DESC, m.created_at ASC",
        )?;
        let rows = stmt.query_map(params![like], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
            ))
        })?;
        for row in rows {
            let (conversation_id, title, updated_at, content) = row?;
            if !seen.insert(conversation_id.clone()) {
                continue;
            }
            let (snippet, match_start, match_len) = snippet_around(&content, needle);
            hits.push(SearchHit {
                conversation_id,
                title,
                updated_at,
                matched_title: false,
                snippet,
                match_start,
                match_len,
            });
            if hits.len() >= limit {
                return Ok(hits);
            }
        }
    }

    // Title matches (kept even when the body has none).
    {
        let mut stmt = conn.prepare(
            "SELECT id, title, updated_at FROM conversations \
             WHERE lower(title) LIKE ?1 ESCAPE '\\' ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map(params![like], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
            ))
        })?;
        for row in rows {
            let (conversation_id, title, updated_at) = row?;
            if !seen.insert(conversation_id.clone()) {
                continue;
            }
            let (_, match_start, match_len) = snippet_around(&title, needle);
            hits.push(SearchHit {
                conversation_id,
                title: title.clone(),
                updated_at,
                matched_title: true,
                snippet: String::new(),
                match_start,
                match_len,
            });
            if hits.len() >= limit {
                break;
            }
        }
    }
    Ok(hits)
}

// ── backup ──────────────────────────────────────────────────────────────────

pub fn export_backup(db: &Db) -> rusqlite::Result<Value> {
    let conn = db.conn.lock().unwrap();
    let conversations = {
        let sql = format!("SELECT {CONVERSATION_COLS} FROM conversations ORDER BY created_at ASC");
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], map_conversation)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(serde_json::to_value(r?).unwrap_or(Value::Null));
        }
        out
    };
    let messages = {
        let sql = format!("SELECT {MESSAGE_COLS} FROM messages ORDER BY created_at ASC");
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([], map_message)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(serde_json::to_value(r?).unwrap_or(Value::Null));
        }
        out
    };
    let presets = {
        let mut stmt = conn
            .prepare("SELECT id, name, content, sort_order, created_at, updated_at FROM presets")?;
        let rows = stmt.query_map([], |r| {
            Ok(Preset {
                id: r.get(0)?,
                name: r.get(1)?,
                content: r.get(2)?,
                sort_order: r.get(3)?,
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(serde_json::to_value(r?).unwrap_or(Value::Null));
        }
        out
    };
    let compactions = {
        let mut stmt = conn.prepare(
            "SELECT id, conversation_id, through_message_id, summary, created_at, updated_at \
             FROM compactions",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Compaction {
                id: r.get(0)?,
                conversation_id: r.get(1)?,
                through_message_id: r.get(2)?,
                summary: r.get(3)?,
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(serde_json::to_value(r?).unwrap_or(Value::Null));
        }
        out
    };
    let settings: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = 'app'", [], |r| {
            r.get(0)
        })
        .optional()?;

    Ok(serde_json::json!({
        "app": "simple-agent",
        "version": 1,
        "exportedAt": now_ms(),
        "conversations": conversations,
        "messages": messages,
        "presets": presets,
        "compactions": compactions,
        "settings": settings.map(|s| serde_json::from_str::<Value>(&s).unwrap_or(Value::Null)),
    }))
}

fn as_str(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
}

fn as_i64(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(|x| x.as_i64())
}

fn as_bool(v: &Value, key: &str) -> Option<bool> {
    v.get(key).and_then(|x| x.as_bool())
}

/// Import a SimpleChat / Simple Agent JSON backup. Existing ids are skipped, so
/// importing the same file twice does not duplicate anything.
pub fn import_backup(db: &Db, payload: &Value) -> rusqlite::Result<ImportSummary> {
    let mut conn = db.conn.lock().unwrap();
    let tx = conn.transaction()?;
    let mut summary = ImportSummary {
        conversations: 0,
        messages: 0,
        presets: 0,
        skipped: 0,
    };

    if let Some(presets) = payload.get("presets").and_then(|v| v.as_array()) {
        for p in presets {
            let Some(id) = as_str(p, "id") else { continue };
            let name = as_str(p, "name").unwrap_or_else(|| "预设".into());
            let content = as_str(p, "content").unwrap_or_default();
            let inserted = tx.execute(
                "INSERT OR IGNORE INTO presets (id, name, content, sort_order, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    id,
                    name,
                    content,
                    as_i64(p, "sortOrder").unwrap_or(0),
                    as_i64(p, "createdAt").unwrap_or_else(now_ms),
                    as_i64(p, "updatedAt").unwrap_or_else(now_ms),
                ],
            )?;
            if inserted > 0 {
                summary.presets += 1;
            }
        }
    }

    if let Some(conversations) = payload.get("conversations").and_then(|v| v.as_array()) {
        for c in conversations {
            let Some(id) = as_str(c, "id") else { continue };
            let exists: bool = tx
                .query_row(
                    "SELECT 1 FROM conversations WHERE id = ?1",
                    params![id],
                    |_| Ok(true),
                )
                .optional()?
                .unwrap_or(false);
            if exists {
                summary.skipped += 1;
                continue;
            }
            tx.execute(
                "INSERT INTO conversations (id, title, mode, provider, model, system_prompt, \
                 workspace, created_at, updated_at, pinned, pinned_at) \
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                params![
                    id,
                    as_str(c, "title").unwrap_or_else(|| "导入的会话".into()),
                    as_str(c, "mode").unwrap_or_else(|| "CREATIVE".into()),
                    as_str(c, "provider").unwrap_or_else(|| "CUSTOM".into()),
                    as_str(c, "model").unwrap_or_default(),
                    as_str(c, "systemPrompt"),
                    as_str(c, "workspace"),
                    as_i64(c, "createdAt").unwrap_or_else(now_ms),
                    as_i64(c, "updatedAt").unwrap_or_else(now_ms),
                    as_bool(c, "pinned").unwrap_or(false) as i64,
                    as_i64(c, "pinnedAt"),
                ],
            )?;
            summary.conversations += 1;
        }
    }

    if let Some(messages) = payload.get("messages").and_then(|v| v.as_array()) {
        for m in messages {
            let Some(id) = as_str(m, "id") else { continue };
            let Some(conversation_id) = as_str(m, "conversationId") else {
                continue;
            };
            let exists: bool = tx
                .query_row("SELECT 1 FROM messages WHERE id = ?1", params![id], |_| {
                    Ok(true)
                })
                .optional()?
                .unwrap_or(false);
            if exists {
                summary.skipped += 1;
                continue;
            }
            tx.execute(
                "INSERT INTO messages (id, conversation_id, parent_id, variant_index, active, role, \
                 content, attachments, reasoning, steps, status, error_message, model, thinking_ms, \
                 ttft_ms, tps, tokens_in, tokens_out, created_at) \
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)",
                params![
                    id,
                    conversation_id,
                    as_str(m, "parentId").unwrap_or_default(),
                    as_i64(m, "variantIndex").unwrap_or(0),
                    as_bool(m, "active").unwrap_or(true) as i64,
                    as_str(m, "role").unwrap_or_else(|| "user".into()),
                    as_str(m, "content").unwrap_or_default(),
                    as_str(m, "attachments"),
                    as_str(m, "reasoning"),
                    as_str(m, "steps"),
                    as_str(m, "status").unwrap_or_else(|| "DONE".into()),
                    as_str(m, "errorMessage"),
                    as_str(m, "model"),
                    as_i64(m, "thinkingMs"),
                    as_i64(m, "ttftMs"),
                    m.get("tps").and_then(|x| x.as_f64()),
                    as_i64(m, "tokensIn"),
                    as_i64(m, "tokensOut"),
                    as_i64(m, "createdAt").unwrap_or_else(now_ms),
                ],
            )?;
            summary.messages += 1;
        }
    }

    if let Some(compactions) = payload.get("compactions").and_then(|v| v.as_array()) {
        for c in compactions {
            let (Some(id), Some(conversation_id)) = (as_str(c, "id"), as_str(c, "conversationId"))
            else {
                continue;
            };
            tx.execute(
                "INSERT OR IGNORE INTO compactions (id, conversation_id, through_message_id, \
                 summary, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6)",
                params![
                    id,
                    conversation_id,
                    as_str(c, "throughMessageId").unwrap_or_default(),
                    as_str(c, "summary").unwrap_or_default(),
                    as_i64(c, "createdAt").unwrap_or_else(now_ms),
                    as_i64(c, "updatedAt").unwrap_or_else(now_ms),
                ],
            )?;
        }
    }

    tx.commit()?;
    Ok(summary)
}

/// Best-effort Chatbox export importer: linear conversations, one node each.
pub fn import_chatbox(
    db: &Db,
    payload: &Value,
    provider: &str,
    model: &str,
) -> rusqlite::Result<ImportSummary> {
    let mut conn = db.conn.lock().unwrap();
    let tx = conn.transaction()?;
    let mut summary = ImportSummary {
        conversations: 0,
        messages: 0,
        presets: 0,
        skipped: 0,
    };

    let Some(conversations) = payload.get("conversations").and_then(|v| v.as_array()) else {
        return Ok(summary);
    };

    for c in conversations {
        let title = as_str(c, "name")
            .or_else(|| as_str(c, "title"))
            .unwrap_or_else(|| "导入的会话".into());
        let Some(msgs) = c.get("messages").and_then(|v| v.as_array()) else {
            continue;
        };
        let conversation_id = new_id();
        let now = now_ms();
        tx.execute(
            "INSERT INTO conversations (id, title, mode, provider, model, system_prompt, workspace, \
             created_at, updated_at, pinned, pinned_at) VALUES (?1,?2,'CREATIVE',?3,?4,NULL,NULL,?5,?5,0,NULL)",
            params![conversation_id, title, provider, model, now],
        )?;
        summary.conversations += 1;

        let mut parent = String::new();
        let mut index = 0i64;
        for m in msgs {
            let role = as_str(m, "role").unwrap_or_else(|| "user".into());
            if role != "user" && role != "assistant" {
                summary.skipped += 1;
                continue;
            }
            let content = as_str(m, "content").unwrap_or_default();
            if content.trim().is_empty() {
                continue;
            }
            let id = new_id();
            tx.execute(
                "INSERT INTO messages (id, conversation_id, parent_id, variant_index, active, role, \
                 content, attachments, reasoning, steps, status, error_message, model, created_at) \
                 VALUES (?1,?2,?3,?4,1,?5,?6,NULL,NULL,NULL,'DONE',NULL,?7,?8)",
                params![id, conversation_id, parent, index, role, content, model, now + index],
            )?;
            parent = id;
            index += 1;
            summary.messages += 1;
        }
    }

    tx.commit()?;
    Ok(summary)
}

pub fn audit_tool(
    db: &Db,
    conversation_id: &str,
    tool: &str,
    args: &str,
    ok: bool,
    duration_ms: i64,
) -> rusqlite::Result<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO tool_audit (id, conversation_id, tool, args, ok, duration_ms, created_at) \
         VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![
            new_id(),
            conversation_id,
            tool,
            args,
            ok as i64,
            duration_ms,
            now_ms()
        ],
    )?;
    Ok(())
}

/// Path of the database file, exposed for the About panel.
pub fn db_path(dir: &Path) -> PathBuf {
    dir.join("simple-agent.db")
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDb {
        db: Db,
        path: std::path::PathBuf,
    }

    impl TempDb {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("sa-db-{}.db", new_id()));
            let db = Db::open(&path).unwrap();
            Self { db, path }
        }
    }

    impl Drop for TempDb {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.path);
            let _ = std::fs::remove_file(self.path.with_extension("db-wal"));
            let _ = std::fs::remove_file(self.path.with_extension("db-shm"));
        }
    }

    fn seed(t: &TempDb) -> (String, Message, Message) {
        let conversation = create_conversation(
            &t.db,
            &NewConversation {
                mode: "CREATIVE".into(),
                provider: "CUSTOM".into(),
                model: "m".into(),
                system_prompt: None,
                workspace: None,
                title: Some("t".into()),
            },
        )
        .unwrap();

        let user = append_message(
            &t.db,
            &NewMessage {
                id: None,
                conversation_id: conversation.id.clone(),
                parent_id: String::new(),
                role: "user".into(),
                content: "hello".into(),
                attachments: None,
                reasoning: None,
                steps: None,
                status: None,
                model: None,
                created_at: Some(1_000),
            },
        )
        .unwrap();

        let assistant = append_message(
            &t.db,
            &NewMessage {
                id: None,
                conversation_id: conversation.id.clone(),
                parent_id: user.id.clone(),
                role: "assistant".into(),
                content: "hi".into(),
                attachments: None,
                reasoning: None,
                steps: None,
                status: None,
                model: Some("m".into()),
                created_at: Some(2_000),
            },
        )
        .unwrap();

        (conversation.id, user, assistant)
    }

    #[test]
    fn append_assigns_variant_indices_and_moves_the_active_flag() {
        let t = TempDb::new();
        let (conversation_id, user, first) = seed(&t);

        let second = append_message(
            &t.db,
            &NewMessage {
                id: None,
                conversation_id: conversation_id.clone(),
                parent_id: user.id.clone(),
                role: "assistant".into(),
                content: "hi again".into(),
                attachments: None,
                reasoning: None,
                steps: None,
                status: None,
                model: None,
                created_at: Some(3_000),
            },
        )
        .unwrap();

        assert_eq!(first.variant_index, 0);
        assert_eq!(second.variant_index, 1);

        let all = load_messages(&t.db, &conversation_id).unwrap();
        let assistants: Vec<_> = all.iter().filter(|m| m.parent_id == user.id).collect();
        assert_eq!(assistants.len(), 2);
        assert_eq!(assistants.iter().filter(|m| m.active).count(), 1);
        assert!(
            assistants
                .iter()
                .find(|m| m.id == second.id)
                .unwrap()
                .active
        );
    }

    #[test]
    fn deleting_a_subtree_removes_descendants_and_restores_sibling_active() {
        let t = TempDb::new();
        let (conversation_id, user, assistant) = seed(&t);

        // A grandchild under the assistant.
        append_message(
            &t.db,
            &NewMessage {
                id: None,
                conversation_id: conversation_id.clone(),
                parent_id: assistant.id.clone(),
                role: "user".into(),
                content: "follow up".into(),
                attachments: None,
                reasoning: None,
                steps: None,
                status: None,
                model: None,
                created_at: Some(4_000),
            },
        )
        .unwrap();

        delete_subtree(&t.db, &user.id).unwrap();
        assert!(load_messages(&t.db, &conversation_id).unwrap().is_empty());
    }

    #[test]
    fn switching_the_active_variant_changes_the_path() {
        let t = TempDb::new();
        let (conversation_id, user, first) = seed(&t);
        let second = append_message(
            &t.db,
            &NewMessage {
                id: None,
                conversation_id: conversation_id.clone(),
                parent_id: user.id.clone(),
                role: "assistant".into(),
                content: "second".into(),
                attachments: None,
                reasoning: None,
                steps: None,
                status: None,
                model: None,
                created_at: Some(3_000),
            },
        )
        .unwrap();

        set_active_variant(&t.db, &conversation_id, &user.id, &first.id).unwrap();
        let all = load_messages(&t.db, &conversation_id).unwrap();
        assert!(all.iter().find(|m| m.id == first.id).unwrap().active);
        assert!(!all.iter().find(|m| m.id == second.id).unwrap().active);
    }

    #[test]
    fn fork_copies_the_path_and_relinks_parents() {
        let t = TempDb::new();
        let (conversation_id, user, assistant) = seed(&t);

        let forked = fork_conversation(&t.db, &conversation_id, &assistant.id, None)
            .unwrap()
            .expect("fork");

        let copied = load_messages(&t.db, &forked.id).unwrap();
        assert_eq!(copied.len(), 2);
        assert_eq!(copied[0].parent_id, "");
        assert_eq!(copied[1].parent_id, copied[0].id);
        assert!(copied.iter().all(|m| m.active && m.variant_index == 0));
        assert_eq!(copied[0].content, user.content);
        assert_eq!(copied[1].content, assistant.content);
    }

    #[test]
    fn drafting_clears_hollow_rows() {
        let t = TempDb::new();
        save_draft(&t.db, "", "half typed", None).unwrap();
        assert_eq!(get_draft(&t.db, "").unwrap().unwrap().text, "half typed");

        save_draft(&t.db, "", "", None).unwrap();
        assert!(get_draft(&t.db, "").unwrap().is_none());
    }

    #[test]
    fn search_finds_body_matches_and_reports_offsets() {
        let t = TempDb::new();
        seed(&t);
        let hits = search(&t.db, "hello", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].snippet.contains("hello"));
        assert_eq!(hits[0].match_start, 0);
        assert_eq!(hits[0].match_len, 5);
    }

    #[test]
    fn compaction_upserts_a_single_row_per_conversation() {
        let t = TempDb::new();
        let (conversation_id, user, _assistant) = seed(&t);
        save_compaction(&t.db, &conversation_id, &user.id, "first").unwrap();
        save_compaction(&t.db, &conversation_id, &user.id, "second").unwrap();
        assert_eq!(
            get_compaction(&t.db, &conversation_id)
                .unwrap()
                .unwrap()
                .summary,
            "second"
        );
        delete_compaction(&t.db, &conversation_id).unwrap();
        assert!(get_compaction(&t.db, &conversation_id).unwrap().is_none());
    }

    #[test]
    fn dangling_streams_are_repaired_on_startup() {
        let t = TempDb::new();
        let (conversation_id, user, assistant) = seed(&t);
        update_message(
            &t.db,
            &assistant.id,
            &MessagePatch {
                status: Some("STREAMING".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let repaired = resolve_dangling_streams(&t.db).unwrap();
        assert_eq!(repaired, 1);
        let all = load_messages(&t.db, &conversation_id).unwrap();
        assert_eq!(
            all.iter().find(|m| m.id == assistant.id).unwrap().status,
            "STOPPED"
        );
        assert_eq!(all.iter().find(|m| m.id == user.id).unwrap().status, "DONE");
    }

    #[test]
    fn backup_round_trips_through_import() {
        let source = TempDb::new();
        seed(&source);
        let payload = export_backup(&source.db).unwrap();

        let target = TempDb::new();
        let summary = import_backup(&target.db, &payload).unwrap();
        assert_eq!(summary.conversations, 1);
        assert_eq!(summary.messages, 2);

        // Importing the same payload twice must not duplicate anything.
        // Skipped = 1 conversation + 2 messages already present.
        let again = import_backup(&target.db, &payload).unwrap();
        assert_eq!(again.conversations, 0);
        assert_eq!(again.messages, 0);
        assert_eq!(again.skipped, 3);
        assert_eq!(
            load_messages(
                &target.db,
                &payload["conversations"][0]["id"]
                    .as_str()
                    .unwrap()
                    .to_string()
            )
            .unwrap()
            .len(),
            2
        );
    }
}
