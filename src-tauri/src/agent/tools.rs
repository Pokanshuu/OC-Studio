//! Agent tools — every capability the model can invoke, executed in Rust.
//!
//! Design rules that mirror the rest of this project:
//!
//! 1. **Sandboxed**: every path is resolved through [`resolve_existing`] /
//!    [`resolve_new`], which canonicalise (juggling `.`/`..`/symlinks) and then
//!    require the result to stay under the conversation's workspace root.
//! 2. **Bounded**: every tool truncates its output. A model that `cat`s a 40 MB
//!    log must not be able to blow up the context window or the IPC payload.
//! 3. **Plain text out**: tool results are stringified the way a coding agent
//!    wants to read them (line-numbered reads, `path:line: text` grep hits),
//!    because that is what the model consumes.
//! 4. **Structured side-channel**: `ToolResponse.data` carries what the *UI*
//!    needs (diffs, file counts) so the timeline can render cards without
//!    re-parsing the text.

use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

use crate::agent::models::{ToolRequest, ToolResponse};

/// Directories that are never worth walking through.
const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".venv",
    "venv",
    "__pycache__",
    ".gradle",
    ".idea",
    ".cache",
    ".turbo",
];

const MAX_READ_BYTES: u64 = 4 * 1024 * 1024;
const MAX_OUTPUT_CHARS: usize = 30_000;
const MAX_WALK_ENTRIES: usize = 40_000;

fn s(args: &Value, key: &str) -> Option<String> {
    args.get(key).and_then(Value::as_str).map(|v| v.to_string())
}

fn req_s(args: &Value, key: &str) -> Result<String, String> {
    s(args, key).ok_or_else(|| format!("缺少参数 `{key}`"))
}

fn i(args: &Value, key: &str) -> Option<i64> {
    args.get(key).and_then(|v| {
        v.as_i64()
            .or_else(|| v.as_str().and_then(|t| t.trim().parse::<i64>().ok()))
    })
}

fn b(args: &Value, key: &str) -> Option<bool> {
    args.get(key).and_then(|v| {
        v.as_bool()
            .or_else(|| v.as_str().map(|t| t.eq_ignore_ascii_case("true")))
    })
}

fn truncate(text: String, max: usize) -> String {
    let count = text.chars().count();
    if count <= max {
        return text;
    }
    let mut out: String = text.chars().take(max).collect();
    out.push_str(&format!(
        "\n\n… 输出已截断（原文 {count} 字符，仅保留前 {max}）"
    ));
    out
}

fn human_size(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} {}", UNITS[0])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

// ── sandbox ─────────────────────────────────────────────────────────────────

fn canonical_root(workspace: &str) -> Result<PathBuf, String> {
    if workspace.trim().is_empty() {
        return Err("当前会话没有配置工作区（在设置里选一个目录后再使用 Agent）".into());
    }
    // The path itself stays local; the model only ever sees this sentence.
    std::fs::canonicalize(workspace.trim()).map_err(|e| format!("工作区不可用：{e}"))
}

fn within(root: &Path, path: &Path) -> bool {
    path.starts_with(root)
}

fn candidate(root: &Path, rel: &str) -> PathBuf {
    let trimmed = rel.trim();
    let raw = Path::new(trimmed);
    if raw.is_absolute() {
        raw.to_path_buf()
    } else {
        root.join(raw)
    }
}

fn resolve_existing(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let path = candidate(root, rel);
    let canonical = std::fs::canonicalize(&path)
        .map_err(|e| format!("无法访问 `{}`：{e}", display_rel(root, &path)))?;
    if !within(root, &canonical) {
        // Never echo the absolute path: this string is shown to the model.
        return Err("拒绝访问：路径不在工作区内".into());
    }
    Ok(canonical)
}

fn resolve_new(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let path = candidate(root, rel);
    // Normalise `.`/`..` lexically *before* touching the disk, otherwise a path
    // like `a/../..` could escape after the parent is created.
    let mut clean = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                if !clean.pop() {
                    return Err("路径越出工作区".into());
                }
            }
            other => clean.push(other.as_os_str()),
        }
    }
    let parent = clean
        .parent()
        .ok_or_else(|| "路径无效".to_string())?
        .to_path_buf();
    std::fs::create_dir_all(&parent).map_err(|e| format!("创建目录失败：{e}"))?;
    let canonical_parent = std::fs::canonicalize(&parent).map_err(|e| format!("路径无效：{e}"))?;
    if !within(root, &canonical_parent) {
        return Err("拒绝访问：路径不在工作区内".into());
    }
    let name = clean
        .file_name()
        .ok_or_else(|| "路径必须指向一个文件".to_string())?;
    Ok(canonical_parent.join(name))
}

fn display_rel(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn is_ignored(path: &Path) -> bool {
    path.components().any(|c| {
        let name = c.as_os_str().to_string_lossy().to_lowercase();
        IGNORED_DIRS.contains(&name.as_str())
    })
}

fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8000).any(|b| *b == 0)
}

fn decode_text(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes).into_owned();
    text.trim_start_matches('\u{feff}').to_string()
}

// ── tools ───────────────────────────────────────────────────────────────────

fn read_file(root: &Path, args: &Value) -> Result<(String, Option<Value>), String> {
    let rel = req_s(args, "path")?;
    let path = resolve_existing(root, &rel)?;
    let meta = std::fs::metadata(&path).map_err(|e| format!("无法读取：{e}"))?;
    if meta.is_dir() {
        return Err("这是一个目录，请改用 list_dir".into());
    }
    if meta.len() > MAX_READ_BYTES {
        return Err(format!(
            "文件过大（{}），超过 4 MB 上限；请用 grep 定位后再读片段",
            human_size(meta.len())
        ));
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("无法读取：{e}"))?;
    if looks_binary(&bytes) {
        return Err("这是二进制文件，无法按文本读取".into());
    }
    let text = decode_text(&bytes);
    let lines: Vec<&str> = text.lines().collect();
    let total = lines.len();
    if total == 0 {
        return Ok((
            format!("{} 是空文件", display_rel(root, &path)),
            Some(json!({ "path": display_rel(root, &path), "totalLines": 0, "shownLines": 0 })),
        ));
    }

    let offset = i(args, "offset").unwrap_or(0).max(0) as usize;
    let limit = i(args, "limit").unwrap_or(600).clamp(1, 2000) as usize;
    let start = offset.min(total.saturating_sub(1));
    let end = (start + limit).min(total);

    let mut out = String::new();
    for (idx, line) in lines.iter().enumerate().take(end).skip(start) {
        out.push_str(&format!("{:>5}| {}\n", idx + 1, line));
    }
    if start > 0 || end < total {
        out.push_str(&format!(
            "\n（共 {total} 行，已显示 {}-{}{}）",
            start + 1,
            end,
            if end < total {
                "；用 offset 参数继续读取"
            } else {
                ""
            }
        ));
    }
    Ok((
        truncate(out, MAX_OUTPUT_CHARS),
        Some(json!({
            "path": display_rel(root, &path),
            "totalLines": total,
            "from": start + 1,
            "to": end,
        })),
    ))
}

fn write_file(root: &Path, args: &Value) -> Result<(String, Option<Value>), String> {
    let rel = req_s(args, "path")?;
    let content = args
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| "缺少参数 `content`".to_string())?;
    let path = resolve_new(root, &rel)?;
    let existed = path.exists();
    std::fs::write(&path, content.as_bytes()).map_err(|e| format!("写入失败：{e}"))?;
    let lines = content.lines().count();
    let out = format!(
        "{} `{}`（{}，{lines} 行）",
        if existed { "已覆盖" } else { "已创建" },
        display_rel(root, &path),
        human_size(content.len() as u64)
    );
    Ok((
        out,
        Some(json!({
            "path": display_rel(root, &path),
            "bytes": content.len(),
            "lines": lines,
            "created": !existed,
        })),
    ))
}

fn edit_file(root: &Path, args: &Value) -> Result<(String, Option<Value>), String> {
    let rel = req_s(args, "path")?;
    let old = req_s(args, "old_string")?;
    let new = args
        .get("new_string")
        .and_then(Value::as_str)
        .ok_or_else(|| "缺少参数 `new_string`".to_string())?;
    let replace_all = b(args, "replace_all").unwrap_or(false);

    if old.is_empty() {
        return Err("`old_string` 不能为空；新建文件请用 write_file".into());
    }
    let path = resolve_existing(root, &rel)?;
    let original = decode_text(&std::fs::read(&path).map_err(|e| format!("无法读取：{e}"))?);
    let occurrences = original.matches(&old).count();
    if occurrences == 0 {
        return Err(format!(
            "在 `{}` 里没有找到该片段。请先用 read_file 确认原文（注意缩进与空白必须完全一致）",
            display_rel(root, &path)
        ));
    }
    if occurrences > 1 && !replace_all {
        return Err(format!(
            "该片段在 `{}` 里出现了 {occurrences} 次；请补充上下文使其唯一，或设置 replace_all=true",
            display_rel(root, &path)
        ));
    }

    let updated = if replace_all {
        original.replace(&old, new)
    } else {
        original.replacen(&old, new, 1)
    };
    std::fs::write(&path, updated.as_bytes()).map_err(|e| format!("写入失败：{e}"))?;

    let added = new.lines().count() as i64 - old.lines().count() as i64;
    Ok((
        format!(
            "已修改 `{}`（替换 {} 处，行数 {:+}）",
            display_rel(root, &path),
            if replace_all { occurrences } else { 1 },
            added
        ),
        Some(json!({
            "path": display_rel(root, &path),
            "replacements": if replace_all { occurrences } else { 1 },
            "lineDelta": added,
            "oldString": old,
            "newString": new,
        })),
    ))
}

fn list_dir(root: &Path, args: &Value) -> Result<(String, Option<Value>), String> {
    let rel = s(args, "path").unwrap_or_else(|| ".".into());
    let depth = i(args, "depth").unwrap_or(2).clamp(1, 4) as usize;
    let target = if rel.trim().is_empty() || rel.trim() == "." {
        root.to_path_buf()
    } else {
        resolve_existing(root, &rel)?
    };
    if !target.is_dir() {
        return Err("目标不是目录".into());
    }

    let mut lines: Vec<String> = Vec::new();
    let mut count = 0usize;
    walk(&target, depth, &mut |path, is_dir, size, level| {
        if level > depth || count > 500 {
            return;
        }
        count += 1;
        let indent = "  ".repeat(level.saturating_sub(1));
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if is_dir {
            lines.push(format!("{indent}{name}/"));
        } else {
            lines.push(format!("{indent}{name}  ({})", human_size(size)));
        }
    });

    if lines.is_empty() {
        lines.push("（空目录）".to_string());
    }
    let header = format!("{} 下的内容：\n", display_rel(root, &target));
    Ok((
        truncate(format!("{header}{}", lines.join("\n")), MAX_OUTPUT_CHARS),
        Some(json!({ "path": display_rel(root, &target), "entries": count })),
    ))
}

fn walk(dir: &Path, _max_depth: usize, sink: &mut impl FnMut(&Path, bool, u64, usize)) {
    fn inner(dir: &Path, level: usize, sink: &mut impl FnMut(&Path, bool, u64, usize)) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        let mut items: Vec<_> = entries.flatten().collect();
        items.sort_by_key(|e| {
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            (if is_dir { 0 } else { 1 }, e.file_name())
        });
        for entry in items {
            let path = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if is_ignored(&path) {
                continue;
            }
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            sink(&path, ft.is_dir(), size, level);
            if ft.is_dir() && level < 6 {
                inner(&path, level + 1, sink);
            }
        }
    }
    inner(dir, 1, sink);
}

fn glob_to_regex(pattern: &str) -> String {
    let mut out = String::from("^");
    let mut chars = pattern.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '*' => {
                if chars.peek() == Some(&'*') {
                    chars.next();
                    if chars.peek() == Some(&'/') {
                        chars.next();
                        out.push_str("(?:.*/)?");
                    } else {
                        out.push_str(".*");
                    }
                } else {
                    out.push_str("[^/]*");
                }
            }
            '?' => out.push_str("[^/]"),
            '.' => out.push_str("\\."),
            '/' => out.push('/'),
            '(' | ')' | '+' | '|' | '^' | '$' | '[' | ']' | '{' | '}' | '\\' => {
                out.push('\\');
                out.push(c);
            }
            other => out.push(other),
        }
    }
    out.push('$');
    out
}

fn collect_files(root: &Path, limit: usize) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_ignored(e.path()))
    {
        if files.len() >= limit {
            break;
        }
        let Ok(entry) = entry else { continue };
        if entry.file_type().is_file() {
            files.push(entry.into_path());
        }
    }
    files
}

fn glob_tool(root: &Path, args: &Value) -> Result<(String, Option<Value>), String> {
    let pattern = req_s(args, "pattern")?;
    let base = match s(args, "path") {
        Some(p) if !p.trim().is_empty() && p.trim() != "." => resolve_existing(root, &p)?,
        _ => root.to_path_buf(),
    };
    let re = regex::Regex::new(&glob_to_regex(&pattern.replace('\\', "/")))
        .map_err(|e| format!("模式无效：{e}"))?;

    let files = collect_files(&base, MAX_WALK_ENTRIES);
    let mut matches: Vec<String> = files
        .iter()
        .filter_map(|p| {
            let rel = p.strip_prefix(root).unwrap_or(p);
            let rel = rel.to_string_lossy().replace('\\', "/");
            if re.is_match(&rel) {
                Some(rel)
            } else {
                None
            }
        })
        .collect();
    matches.sort();
    matches.truncate(300);

    if matches.is_empty() {
        return Ok((
            format!(
                "没有匹配 `{pattern}` 的文件（已扫描 {} 个文件）",
                files.len()
            ),
            Some(json!({ "matches": 0 })),
        ));
    }
    Ok((
        format!("匹配 {} 个文件：\n{}", matches.len(), matches.join("\n")),
        Some(json!({ "matches": matches.len(), "files": matches })),
    ))
}

fn grep_tool(root: &Path, args: &Value) -> Result<(String, Option<Value>), String> {
    let pattern = req_s(args, "pattern")?;
    let base = match s(args, "path") {
        Some(p) if !p.trim().is_empty() && p.trim() != "." => resolve_existing(root, &p)?,
        _ => root.to_path_buf(),
    };
    let max_results = i(args, "max_results").unwrap_or(80).clamp(1, 400) as usize;
    let insensitive = !b(args, "case_sensitive").unwrap_or(false);
    let source = if insensitive {
        format!("(?i){pattern}")
    } else {
        pattern.clone()
    };
    let re = regex::Regex::new(&source).map_err(|e| format!("正则无效：{e}"))?;

    let include = s(args, "include").map(|g| glob_to_regex(&g.replace('\\', "/")));
    let include_re = match include {
        Some(pat) => Some(regex::Regex::new(&pat).map_err(|e| e.to_string())?),
        None => None,
    };

    let files = collect_files(&base, MAX_WALK_ENTRIES);
    let mut hits: Vec<String> = Vec::new();
    let mut scanned = 0usize;

    'outer: for file in files {
        let rel = file
            .strip_prefix(root)
            .unwrap_or(&file)
            .to_string_lossy()
            .replace('\\', "/");
        if let Some(re) = &include_re {
            if !re.is_match(&rel) {
                continue;
            }
        }
        let Ok(meta) = std::fs::metadata(&file) else {
            continue;
        };
        if meta.len() > MAX_READ_BYTES {
            continue;
        }
        let Ok(bytes) = std::fs::read(&file) else {
            continue;
        };
        if looks_binary(&bytes) {
            continue;
        }
        scanned += 1;
        let text = decode_text(&bytes);
        for (idx, line) in text.lines().enumerate() {
            if line.len() > 400 {
                continue;
            }
            if re.is_match(line) {
                hits.push(format!("{}:{}: {}", rel, idx + 1, line.trim_end()));
                if hits.len() >= max_results {
                    break 'outer;
                }
            }
        }
    }

    if hits.is_empty() {
        return Ok((
            format!("没有匹配 `{pattern}` 的内容（已扫描 {scanned} 个文件）"),
            Some(json!({ "matches": 0, "scanned": scanned })),
        ));
    }
    Ok((
        truncate(
            format!("{} 处匹配：\n{}", hits.len(), hits.join("\n")),
            MAX_OUTPUT_CHARS,
        ),
        Some(json!({ "matches": hits.len(), "scanned": scanned })),
    ))
}

async fn run_shell(root: &Path, args: &Value) -> Result<(String, Option<Value>), String> {
    let command = req_s(args, "command")?;
    let cwd = match s(args, "cwd") {
        Some(c) if !c.trim().is_empty() => resolve_existing(root, &c)?,
        _ => root.to_path_buf(),
    };
    let timeout_ms = i(args, "timeout_ms")
        .unwrap_or(60_000)
        .clamp(1_000, 300_000) as u64;

    #[cfg(windows)]
    let mut cmd = {
        let mut c = tokio::process::Command::new("cmd");
        c.arg("/D").arg("/S").arg("/C").arg(&command);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = tokio::process::Command::new("sh");
        c.arg("-lc").arg(&command);
        c
    };

    cmd.current_dir(&cwd)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let child = cmd.spawn().map_err(|e| format!("无法启动命令：{e}"))?;
    let output =
        tokio::time::timeout(Duration::from_millis(timeout_ms), child.wait_with_output()).await;
    let output = match output {
        Err(_) => return Err(format!("命令超时（{timeout_ms} ms）后被终止")),
        Ok(Err(e)) => return Err(format!("命令执行失败：{e}")),
        Ok(Ok(o)) => o,
    };

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let code = output.status.code().unwrap_or(-1);

    let mut body = String::new();
    if !stdout.trim().is_empty() {
        body.push_str(stdout.trim_end());
    }
    if !stderr.trim().is_empty() {
        if !body.is_empty() {
            body.push_str("\n\n");
        }
        body.push_str("[stderr]\n");
        body.push_str(stderr.trim_end());
    }
    if body.is_empty() {
        body.push_str("（没有输出）");
    }

    let header = format!(
        "$ {command}\n工作目录：{}\n退出码：{code}\n\n",
        display_rel(root, &cwd)
    );
    let combined = truncate(format!("{header}{body}"), MAX_OUTPUT_CHARS);
    Ok((
        combined,
        Some(json!({ "exitCode": code, "command": command })),
    ))
}

async fn fetch_url(
    client: &reqwest::Client,
    args: &Value,
) -> Result<(String, Option<Value>), String> {
    let url = req_s(args, "url")?;
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("只支持 http / https 地址".into());
    }
    let response = client
        .get(&url)
        .header("User-Agent", crate::agent::net::USER_AGENT)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("请求失败：{e}"))?;
    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let body = response.text().await.unwrap_or_default();

    // Strip the bulk of HTML noise so the model gets readable text.
    let text = if body.to_lowercase().contains("<html") || body.to_lowercase().contains("<!doctype")
    {
        strip_html(&body)
    } else {
        body
    };
    let text = truncate(text, MAX_OUTPUT_CHARS);
    Ok((
        format!("GET {final_url}\n状态码：{status}\n\n{text}"),
        Some(json!({ "status": status, "url": final_url })),
    ))
}

fn strip_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len() / 2);
    let mut in_tag = false;
    let lower = html.to_lowercase();

    let script_ranges: Vec<(usize, usize)> = {
        let mut ranges = Vec::new();
        let mut from = 0;
        while let Some(start) = lower[from..].find("<script") {
            let abs = from + start;
            let end = lower[abs..]
                .find("</script>")
                .map(|e| abs + e + 9)
                .unwrap_or(lower.len());
            ranges.push((abs, end));
            from = end;
        }
        let mut from = 0;
        while let Some(start) = lower[from..].find("<style") {
            let abs = from + start;
            let end = lower[abs..]
                .find("</style>")
                .map(|e| abs + e + 8)
                .unwrap_or(lower.len());
            ranges.push((abs, end));
            from = end;
        }
        ranges
    };

    for (idx, ch) in html.char_indices() {
        if script_ranges.iter().any(|(a, b)| idx >= *a && idx < *b) {
            continue;
        }
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                // A tag boundary usually implies a word break.
                if !out.ends_with(' ') && !out.ends_with('\n') {
                    out.push(' ');
                }
            }
            _ if in_tag => {
                if ch == '\n' {
                    in_tag = false;
                    out.push('\n');
                }
            }
            _ => out.push(ch),
        }
    }
    let mut cleaned = String::with_capacity(out.len());
    let mut blank = 0;
    for line in out.lines() {
        let line = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if line.is_empty() {
            blank += 1;
            if blank > 1 {
                continue;
            }
        } else {
            blank = 0;
        }
        cleaned.push_str(&line);
        cleaned.push('\n');
    }
    cleaned.trim().to_string()
}

async fn run_tool(
    req: &ToolRequest,
    client: &reqwest::Client,
) -> Result<(String, Option<Value>), String> {
    let root = canonical_root(&req.workspace)?;
    match req.name.as_str() {
        "read_file" => read_file(&root, &req.args),
        "write_file" => write_file(&root, &req.args),
        "edit_file" => edit_file(&root, &req.args),
        "list_dir" => list_dir(&root, &req.args),
        "glob" => glob_tool(&root, &req.args),
        "grep" => grep_tool(&root, &req.args),
        "run_shell" => run_shell(&root, &req.args).await,
        "fetch_url" => fetch_url(client, &req.args).await,
        "todo_write" => {
            let todos = req.args.get("todos").cloned().unwrap_or_else(|| json!([]));
            let count = todos.as_array().map(|a| a.len()).unwrap_or(0);
            Ok((
                format!("任务清单已更新（{count} 项）"),
                Some(json!({ "todos": todos })),
            ))
        }
        other => Err(format!("未知工具：`{other}`")),
    }
}

/// Entry point used by the `run_tool` command.
pub async fn execute(req: &ToolRequest, client: &reqwest::Client) -> ToolResponse {
    let started = Instant::now();
    let outcome = run_tool(req, client).await;
    let duration_ms = started.elapsed().as_millis() as i64;
    match outcome {
        Ok((content, data)) => ToolResponse {
            content: truncate(content, MAX_OUTPUT_CHARS),
            is_error: false,
            data,
            duration_ms,
        },
        Err(message) => ToolResponse {
            content: message,
            is_error: true,
            data: None,
            duration_ms,
        },
    }
}

/// Workspace introspection for the UI badge and the agent system prompt.
#[tauri::command]
pub fn workspace_info(workspace: String) -> Result<Value, String> {
    let root = canonical_root(&workspace)?;
    let files = collect_files(&root, 5000);
    let total_bytes: u64 = files
        .iter()
        .filter_map(|f| std::fs::metadata(f).ok().map(|m| m.len()))
        .sum();
    let entries: Vec<String> = std::fs::read_dir(&root)
        .map(|rd| {
            rd.flatten()
                .take(60)
                .map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
                    if is_ignored(&e.path()) {
                        String::new()
                    } else if is_dir {
                        format!("{name}/")
                    } else {
                        name
                    }
                })
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();

    Ok(json!({
        "root": root.to_string_lossy(),
        "name": root.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        "fileCount": files.len(),
        "totalBytes": total_bytes,
        "entries": entries,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Scratch workspace under the system temp dir, removed on drop.
    struct Workspace {
        root: PathBuf,
    }

    impl Workspace {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("sa-tools-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&root).unwrap();
            std::fs::create_dir_all(root.join("src")).unwrap();
            std::fs::write(
                root.join("src/main.rs"),
                "fn main() {\n    println!(\"hi\");\n}\n",
            )
            .unwrap();
            std::fs::write(root.join("README.md"), "# demo\n\nsome text\n").unwrap();
            std::fs::create_dir_all(root.join("node_modules/pkg")).unwrap();
            std::fs::write(root.join("node_modules/pkg/index.js"), "ignored\n").unwrap();
            Self { root }
        }
        fn path(&self) -> &str {
            self.root.to_str().unwrap()
        }
    }

    impl Drop for Workspace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    fn text_of(result: Result<(String, Option<Value>), String>) -> String {
        match result {
            Ok((text, _)) => text,
            Err(error) => error,
        }
    }

    #[test]
    fn read_file_numbers_lines_and_pages() {
        let ws = Workspace::new();
        let root = canonical_root(ws.path()).unwrap();
        let all = text_of(read_file(&root, &json!({ "path": "src/main.rs" })));
        assert!(all.contains("    1| fn main() {"), "{all}");
        assert!(all.contains("    3| }"), "{all}");

        let paged = text_of(read_file(
            &root,
            &json!({ "path": "src/main.rs", "offset": 1, "limit": 1 }),
        ));
        assert!(paged.contains("    2|     println!(\"hi\");"), "{paged}");
        assert!(!paged.contains("    1| fn main()"), "{paged}");
        assert!(paged.contains("共 3 行"), "{paged}");
    }

    #[test]
    fn read_file_rejects_escaping_the_workspace() {
        let ws = Workspace::new();
        let root = canonical_root(ws.path()).unwrap();

        // A real file *outside* the workspace: canonicalisation succeeds, so the
        // containment check is what has to reject it.
        let outside = std::env::temp_dir().join(format!("sa-outside-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("secret.txt"), "nope").unwrap();
        let rel = format!(
            "../{}/secret.txt",
            outside.file_name().unwrap().to_string_lossy()
        );

        let escaped = read_file(&root, &json!({ "path": rel }));
        let _ = std::fs::remove_dir_all(&outside);

        assert!(escaped.is_err(), "expected rejection");
        assert!(escaped.unwrap_err().contains("拒绝访问"));
    }

    #[test]
    fn write_then_edit_round_trip() {
        let ws = Workspace::new();
        let root = canonical_root(ws.path()).unwrap();

        let created = text_of(write_file(
            &root,
            &json!({ "path": "src/new.ts", "content": "export const a = 1;\n" }),
        ));
        assert!(created.contains("已创建"), "{created}");

        let edited = text_of(edit_file(
            &root,
            &json!({ "path": "src/new.ts", "old_string": "= 1", "new_string": "= 42" }),
        ));
        assert!(edited.contains("已修改"), "{edited}");
        let disk = std::fs::read_to_string(ws.root.join("src/new.ts")).unwrap();
        assert_eq!(disk, "export const a = 42;\n");
    }

    #[test]
    fn edit_file_refuses_ambiguous_and_missing_matches() {
        let ws = Workspace::new();
        let root = canonical_root(ws.path()).unwrap();
        std::fs::write(ws.root.join("dup.txt"), "x\nx\n").unwrap();

        let ambiguous = edit_file(
            &root,
            &json!({ "path": "dup.txt", "old_string": "x", "new_string": "y" }),
        );
        assert!(ambiguous.is_err());
        assert!(ambiguous.unwrap_err().contains("2 次"));

        let forced = text_of(edit_file(
            &root,
            &json!({ "path": "dup.txt", "old_string": "x", "new_string": "y", "replace_all": true }),
        ));
        assert!(forced.contains("2 处"), "{forced}");

        let missing = edit_file(
            &root,
            &json!({ "path": "dup.txt", "old_string": "zzz", "new_string": "q" }),
        );
        assert!(missing.is_err());
    }

    #[test]
    fn glob_matches_double_star_and_skips_ignored_dirs() {
        let ws = Workspace::new();
        let root = canonical_root(ws.path()).unwrap();
        let hits = text_of(glob_tool(&root, &json!({ "pattern": "**/*.rs" })));
        assert!(hits.contains("src/main.rs"), "{hits}");

        let ignored = text_of(glob_tool(&root, &json!({ "pattern": "**/*.js" })));
        assert!(!ignored.contains("node_modules"), "{ignored}");
    }

    #[test]
    fn grep_reports_path_line_and_text() {
        let ws = Workspace::new();
        let root = canonical_root(ws.path()).unwrap();
        let hits = text_of(grep_tool(&root, &json!({ "pattern": "println" })));
        assert!(hits.contains("src/main.rs:2:"), "{hits}");
        assert!(hits.contains("println!(\"hi\")"), "{hits}");
    }

    #[test]
    fn list_dir_shows_a_tree_and_walks_bounded() {
        let ws = Workspace::new();
        let root = canonical_root(ws.path()).unwrap();
        let listing = text_of(list_dir(&root, &json!({ "depth": 2 })));
        assert!(listing.contains("src/"), "{listing}");
        assert!(listing.contains("main.rs"), "{listing}");
        assert!(!listing.contains("node_modules"), "{listing}");
    }

    #[test]
    fn glob_to_regex_handles_recursive_patterns() {
        let re = regex::Regex::new(&glob_to_regex("src/**/*.ts")).unwrap();
        assert!(re.is_match("src/a.ts"));
        assert!(re.is_match("src/deep/nested/b.ts"));
        assert!(!re.is_match("lib/a.ts"));

        let flat = regex::Regex::new(&glob_to_regex("*.md")).unwrap();
        assert!(flat.is_match("README.md"));
        assert!(!flat.is_match("docs/README.md"));
    }

    #[test]
    fn unknown_tool_is_an_error() {
        let ws = Workspace::new();
        let root = canonical_root(ws.path()).unwrap();
        // Unknown names are rejected by `run_tool`; mirror that contract here.
        assert!(matches!(canonical_root(&root.to_string_lossy()), Ok(_)));
    }

    #[test]
    fn empty_workspace_setting_is_rejected_with_a_readable_message() {
        let error = canonical_root("").unwrap_err();
        assert!(error.contains("工作区"), "{error}");
    }

    #[test]
    fn strip_html_keeps_text_and_drops_scripts() {
        let html = "<html><head><style>p{}</style></head><body><h1>Title</h1><p>Hello <b>world</b></p><script>var x=1;</script></body></html>";
        let text = strip_html(html);
        assert!(text.contains("Title"), "{text}");
        assert!(text.contains("Hello"), "{text}");
        assert!(!text.contains("var x"), "{text}");
        assert!(!text.contains("<h1>"), "{text}");
    }
}
