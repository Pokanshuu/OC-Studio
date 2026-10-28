use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

use crate::vault::{blocking, safe_join};

// ── 创作时间线（`.ocstudio/journal.jsonl`） ──────────────────────────────
// 给「这个是我想出来的」留证据用：每次保存往一个文件里**只追加**一行，
// 记录时间、改了哪些键、内容哈希与上一条哈希。
//
// 为什么单独一个模块而不是塞进 vault.rs：
//   · 它跟智能体数据无关，只是 append / tail 两件事；
//   · 只追加 = 永不走 write_texts 那套「原子替换」，语义相反，混在一起容易误用。
//
// 为什么不做回滚 / diff / 全文快照：见 `docs/todo.md` ③ —— 目标是「讲清过程」，
// 不是版本管理。正文哈希只用来证明「这一版和上一版不同」，不保存内容。

/// 单行上限：一条日志几十到几百字节，超过 16 KB 说明调用方传错了
const MAX_LINE_BYTES: usize = 16 * 1024;
/// tail 一次最多回多少行
const MAX_TAIL_LINES: usize = 2_000;

fn peek_dir(path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("创建目录失败: {err}"))?;
    }
    Ok(())
}

fn append_impl(root: &str, rel: &str, lines: &[String]) -> Result<(), String> {
    let root_path = PathBuf::from(root);
    if !root_path.is_dir() {
        return Err(format!("不是目录: {root}"));
    }
    let target = safe_join(&root_path, rel)?;
    peek_dir(&target)?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&target)
        .map_err(|err| format!("打开日志失败 {}: {err}", target.display()))?;

    for line in lines {
        if line.len() > MAX_LINE_BYTES {
            return Err(format!("日志行过长（{} 字节）", line.len()));
        }
        // 行内不允许换行：JSONL 的每一行必须独立可解析
        let cleaned = line.replace(['\n', '\r'], " ");
        file.write_all(cleaned.as_bytes())
            .and_then(|_| file.write_all(b"\n"))
            .map_err(|err| format!("写入日志失败: {err}"))?;
    }
    file.flush().map_err(|err| format!("刷新日志失败: {err}"))?;
    Ok(())
}

fn tail_impl(root: &str, rel: &str, max_lines: usize) -> Result<Vec<String>, String> {
    let root_path = PathBuf::from(root);
    let target = safe_join(&root_path, rel)?;
    if !target.is_file() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&target)
        .map_err(|err| format!("读取日志失败 {}: {err}", target.display()))?;

    let limit = max_lines.clamp(1, MAX_TAIL_LINES);
    let mut out: Vec<String> = content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.to_string())
        .collect();
    if out.len() > limit {
        out = out.split_off(out.len() - limit);
    }
    Ok(out)
}

/// 追加若干行到日志。每行由前端序列化成 JSON（这里不解释内容）。
#[tauri::command]
pub async fn journal_append(root: String, rel_path: String, lines: Vec<String>) -> Result<(), String> {
    blocking(move || append_impl(&root, &rel_path, &lines)).await
}

/// 取最后 `max_lines` 行（新的在后）。文件不存在返回空 —— 没记过日志不是错误。
#[tauri::command]
pub async fn journal_tail(
    root: String,
    rel_path: String,
    max_lines: usize,
) -> Result<Vec<String>, String> {
    blocking(move || tail_impl(&root, &rel_path, max_lines)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(tag: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("ocstudio-journal-{tag}-{nanos}"));
        fs::create_dir_all(&dir).expect("建临时目录");
        dir
    }

    #[test]
    fn append_creates_file_and_keeps_one_line_per_entry() {
        let root = temp_root("append");
        let rel = ".ocstudio/journal.jsonl";
        append_impl(root.to_str().unwrap(), rel, &["{\"a\":1}".to_string()]).expect("第一次追加");
        append_impl(
            root.to_str().unwrap(),
            rel,
            &["{\"b\":2}".to_string(), "{\"c\":3}".to_string()],
        )
        .expect("第二次追加");

        let text = fs::read_to_string(root.join(rel)).expect("读日志");
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines, vec!["{\"a\":1}", "{\"b\":2}", "{\"c\":3}"]);
        assert!(text.ends_with('\n'), "每行都要以换行结尾");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn append_flattens_newlines_inside_a_line() {
        let root = temp_root("nested");
        // 前端若传进带换行的字符串，必须压成一行 —— 否则 JSONL 结构就断了
        append_impl(root.to_str().unwrap(), ".ocstudio/journal.jsonl", &["a\nb".to_string()])
            .expect("追加");
        let text = fs::read_to_string(root.join(".ocstudio/journal.jsonl")).expect("读日志");
        assert_eq!(text, "a b\n");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn tail_returns_last_lines_in_order() {
        let root = temp_root("tail");
        let lines: Vec<String> = (1..=5).map(|i| format!("{{\"n\":{i}}}")).collect();
        append_impl(root.to_str().unwrap(), "j.jsonl", &lines).expect("追加");

        let tail = tail_impl(root.to_str().unwrap(), "j.jsonl", 2).expect("tail");
        assert_eq!(tail, vec!["{\"n\":4}", "{\"n\":5}"]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn tail_of_missing_file_is_empty_not_error() {
        let root = temp_root("missing");
        let tail = tail_impl(root.to_str().unwrap(), "nope.jsonl", 10).expect("tail");
        assert!(tail.is_empty());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn append_rejects_path_escape() {
        let root = temp_root("escape");
        let err = append_impl(root.to_str().unwrap(), "../evil.jsonl", &["x".into()]);
        assert!(err.is_err(), "必须拒绝 .. 逃逸");
        let _ = fs::remove_dir_all(&root);
    }
}
