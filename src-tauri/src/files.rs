use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::command;

// ── 把导出内容写到用户选定的路径 ────────────────────────────────────────
// 为什么需要它：WebView2 里 `<a download>` 那条老路是不可靠的（浏览器下载被宿主接管），
// 导出的 `.ocbak` / Markdown / TXT 在桌面版会「点了没反应」。
// 现在统一走「系统保存对话框拿绝对路径 → Rust 侧落盘」。
//
// 写入用「同目录临时文件 + rename」：中途失败不会在用户磁盘上留下半个备份。

fn temp_path_for(target: &Path) -> PathBuf {
    let mut name = target
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "oc-studio-export".to_string());
    name.push_str(".tmp");
    target.with_file_name(name)
}

/// 写文本文件；返回写入字节数
#[command]
pub async fn save_text(path: String, content: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || save_text_impl(&path, &content))
        .await
        .map_err(|e| format!("保存任务失败: {e}"))?
}

fn save_text_impl(path: &str, content: &str) -> Result<u64, String> {
    let target = PathBuf::from(path);
    if target.is_dir() {
        return Err("目标路径是个文件夹".into());
    }
    if let Some(parent) = target.parent() {
        if !parent.is_dir() {
            return Err(format!("目录不存在：{}", parent.display()));
        }
    }

    let bytes = content.as_bytes();
    let temp = temp_path_for(&target);
    {
        let mut file = fs::File::create(&temp).map_err(|e| format!("创建临时文件失败: {e}"))?;
        file.write_all(bytes).map_err(|e| {
            let _ = fs::remove_file(&temp);
            format!("写入失败: {e}")
        })?;
        file.flush().map_err(|e| format!("刷新失败: {e}"))?;
    }
    fs::rename(&temp, &target).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("替换目标文件失败: {e}")
    })?;
    Ok(bytes.len() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("save-text-{tag}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn writes_and_overwrites() {
        let dir = temp_dir("ok");
        let target = dir.join("备份.ocbak");
        let written = save_text_impl(target.to_str().unwrap(), "{\"a\":1}").unwrap();
        assert_eq!(written, 7);
        assert_eq!(fs::read_to_string(&target).unwrap(), "{\"a\":1}");

        // 覆盖写：不残留临时文件
        save_text_impl(target.to_str().unwrap(), "{}").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "{}");
        assert!(!dir.join("备份.ocbak.tmp").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_missing_directory() {
        let dir = temp_dir("missing");
        let target = dir.join("不存在的子目录").join("x.md");
        assert!(save_text_impl(target.to_str().unwrap(), "x").is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_directory_target() {
        let dir = temp_dir("dir-target");
        assert!(save_text_impl(dir.to_str().unwrap(), "x").is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
