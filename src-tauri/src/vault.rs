use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

// ── Vault 文件 IO ───────────────────────────────────────────────────────
// 刻意**不走 JS 的 fs 插件**，而是自建命令：
//   · 不需要运行时给 fs scope 授权，也不需要跨重启持久化授权（capability 不动）
//   · 递归扫描在原生侧一次做完，比逐文件往返 JS 快一个量级
//   · Windows 路径 / 原子写 / mtime 比对都在一处收口
//
// 所有命令都必须是 async：Tauri 的同步命令跑在主线程上，一次几万文件的扫描
// 会把界面卡死。这里统一用 spawn_blocking 把阻塞 IO 挪出主线程。

/// 扫描时跳过的目录（VCS、Obsidian 自身、依赖、回收站）
const SKIP_DIRS: &[&str] = &[
    ".git",
    ".obsidian",
    ".trash",
    ".ocstudio",
    "node_modules",
    ".claude",
    ".claudian",
    ".vs",
    "target",
];

const MARKER: &str = "oc-studio.json";
const OCSTUDIO_DIR: &str = ".ocstudio";

/// 单个文本文件上限：超过就不读进内存（8 MB 的 .md 已经是病态数据）
const MAX_TEXT_BYTES: u64 = 8 * 1024 * 1024;
/// 单次扫描的文件数上限，防止误选一个大目录把内存吃光
const MAX_FILES: usize = 20_000;
/// 报告里最多列出多少个「不认识的文件」
const MAX_OTHER_FILES: usize = 500;
/// 报告里最多列出多少个目录
const MAX_DIRS: usize = 2_000;

#[derive(Serialize)]
pub struct VaultProbe {
    exists: bool,
    #[serde(rename = "isDir")]
    is_dir: bool,
    /// 是否已被认作 vault（有 oc-studio.json 标记，或本就是 Obsidian vault）
    #[serde(rename = "isVault")]
    is_vault: bool,
    #[serde(rename = "hasMarker")]
    has_marker: bool,
    #[serde(rename = "hasObsidian")]
    has_obsidian: bool,
    #[serde(rename = "hasOcstudioDir")]
    has_ocstudio_dir: bool,
    #[serde(rename = "mdCount")]
    md_count: usize,
    #[serde(rename = "dirCount")]
    dir_count: usize,
    #[serde(rename = "schemaVersion")]
    schema_version: Option<u32>,
}

#[derive(Serialize)]
pub struct VaultFile {
    #[serde(rename = "relPath")]
    rel_path: String,
    content: String,
    size: u64,
    #[serde(rename = "mtimeMs")]
    mtime_ms: i64,
}

#[derive(Serialize)]
pub struct VaultScan {
    root: String,
    files: Vec<VaultFile>,
    /// 被跳过的目录（相对路径）
    #[serde(rename = "skippedDirs")]
    skipped_dirs: Vec<String>,
    /// 非 .md 的其它文件（原样保留，只报告）
    #[serde(rename = "otherFiles")]
    other_files: Vec<String>,
    /// 全部未跳过的目录（含空目录）
    dirs: Vec<String>,
    /// 标记文件 oc-studio.json 的原文
    marker: Option<String>,
    warnings: Vec<String>,
    #[serde(rename = "truncated")]
    truncated: bool,
}

#[derive(Deserialize)]
pub struct WriteEntry {
    #[serde(rename = "relPath")]
    rel_path: String,
    content: String,
    /// 上次读到的 mtime；不匹配则拒绝覆盖（乐观并发，避免抹掉 Obsidian 侧的改动）
    #[serde(rename = "expectedMtimeMs")]
    expected_mtime_ms: Option<i64>,
}

#[derive(Serialize)]
pub struct WriteResult {
    #[serde(rename = "relPath")]
    rel_path: String,
    ok: bool,
    conflict: bool,
    #[serde(rename = "mtimeMs")]
    mtime_ms: Option<i64>,
    error: Option<String>,
}

fn mtime_ms(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 把 vault 根相对路径拼成绝对路径，并挡掉逃逸（绝对路径、`..`、盘符）。
pub(crate) fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let normalized = rel.replace('\\', "/");
    if normalized.trim().is_empty() {
        return Err("相对路径为空".into());
    }
    let candidate = Path::new(&normalized);
    if candidate.is_absolute() {
        return Err(format!("拒绝绝对路径: {rel}"));
    }
    let mut out = root.to_path_buf();
    for comp in candidate.components() {
        match comp {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return Err(format!("非法相对路径（含 .. 或根组件）: {rel}")),
        }
    }
    Ok(out)
}

fn to_rel(root: &Path, full: &Path) -> String {
    full.strip_prefix(root)
        .unwrap_or(full)
        .to_string_lossy()
        .replace('\\', "/")
}

fn is_skipped_dir(name: &str) -> bool {
    if name.starts_with('.') {
        return true;
    }
    SKIP_DIRS.iter().any(|skip| *skip == name)
}

fn read_text(path: &Path) -> Result<(String, u64, i64, bool), String> {
    let meta = fs::metadata(path).map_err(|e| format!("读取元信息失败 {}: {e}", path.display()))?;
    let size = meta.len();
    let mtime = mtime_ms(&meta);
    let bytes = fs::read(path).map_err(|e| format!("读取失败 {}: {e}", path.display()))?;
    // 去掉 UTF-8 BOM（Windows 编辑器常常带上）
    let trimmed: &[u8] = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        &bytes
    };
    let lossy = std::str::from_utf8(trimmed).is_err();
    Ok((
        String::from_utf8_lossy(trimmed).into_owned(),
        size,
        mtime,
        lossy,
    ))
}

struct WalkAccum {
    files: Vec<VaultFile>,
    skipped_dirs: Vec<String>,
    /// 全部未跳过的目录（含空目录）——用于识别素材目录一类约定（如 `99.附件`）
    dirs: Vec<String>,
    other_files: Vec<String>,
    warnings: Vec<String>,
    truncated: bool,
    dir_count: usize,
    md_count: usize,
}

fn walk(root: &Path, dir: &Path, accum: &mut WalkAccum) {
    if accum.truncated {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(err) => {
            accum
                .warnings
                .push(format!("目录不可读 {}: {err}", to_rel(root, dir)));
            return;
        }
    };

    let is_root = dir == root;

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };

        // 不进入符号链接 / 目录联接，避免递归打转或跑到 vault 之外
        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            accum.dir_count += 1;
            if is_skipped_dir(&name) {
                accum.skipped_dirs.push(to_rel(root, &path));
                continue;
            }
            if accum.dirs.len() < MAX_DIRS {
                accum.dirs.push(to_rel(root, &path));
            }
            walk(root, &path, accum);
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        // 根目录的标记文件单独取出
        if is_root && name == MARKER {
            continue;
        }

        let is_md = name.to_lowercase().ends_with(".md");
        if !is_md {
            if accum.other_files.len() < MAX_OTHER_FILES {
                accum.other_files.push(to_rel(root, &path));
            }
            continue;
        }

        accum.md_count += 1;
        if accum.files.len() >= MAX_FILES {
            accum.truncated = true;
            return;
        }

        // 先看大小再读，别把 8 MB 的文件真读进内存才发现该跳过
        if let Ok(meta) = entry.metadata() {
            if meta.len() > MAX_TEXT_BYTES {
                accum.warnings.push(format!(
                    "文件过大已跳过：{}（{} 字节）",
                    to_rel(root, &path),
                    meta.len()
                ));
                return;
            }
        }

        match read_text(&path) {
            Ok((content, size, mtime, lossy)) => {
                if lossy {
                    accum
                        .warnings
                        .push(format!("非 UTF-8 内容已按容错方式解码：{}", to_rel(root, &path)));
                }
                accum.files.push(VaultFile {
                    rel_path: to_rel(root, &path),
                    content,
                    size,
                    mtime_ms: mtime,
                });
            }
            Err(err) => accum.warnings.push(err),
        }
    }
}

fn scan_impl(path: &str) -> Result<VaultScan, String> {
    let root = PathBuf::from(path);
    if !root.exists() {
        return Err(format!("目录不存在: {path}"));
    }
    if !root.is_dir() {
        return Err(format!("不是目录: {path}"));
    }

    let mut accum = WalkAccum {
        files: Vec::new(),
        skipped_dirs: Vec::new(),
        dirs: Vec::new(),
        other_files: Vec::new(),
        warnings: Vec::new(),
        truncated: false,
        dir_count: 0,
        md_count: 0,
    };
    walk(&root, &root, &mut accum);

    // 按相对路径排序：TS 侧按此顺序确定性分配实体 id
    accum.files.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));

    let marker_path = root.join(MARKER);
    let marker = if marker_path.is_file() {
        match fs::read_to_string(&marker_path) {
            Ok(text) => Some(text),
            Err(err) => {
                accum.warnings.push(format!("标记文件读取失败: {err}"));
                None
            }
        }
    } else {
        None
    };

    Ok(VaultScan {
        root: root.to_string_lossy().replace('\\', "/"),
        files: accum.files,
        skipped_dirs: accum.skipped_dirs,
        other_files: accum.other_files,
        dirs: accum.dirs,
        marker,
        warnings: accum.warnings,
        truncated: accum.truncated,
    })
}

fn probe_impl(path: &str) -> Result<VaultProbe, String> {
    let root = PathBuf::from(path);
    let exists = root.exists();
    let is_dir = root.is_dir();

    if !exists || !is_dir {
        return Ok(VaultProbe {
            exists,
            is_dir,
            is_vault: false,
            has_marker: false,
            has_obsidian: false,
            has_ocstudio_dir: false,
            md_count: 0,
            dir_count: 0,
            schema_version: None,
        });
    }

    let marker_path = root.join(MARKER);
    let has_marker = marker_path.is_file();
    let has_obsidian = root.join(".obsidian").is_dir();
    let has_ocstudio_dir = root.join(OCSTUDIO_DIR).is_dir();

    let schema_version = if has_marker {
        fs::read_to_string(&marker_path)
            .ok()
            .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
            .and_then(|value| value.get("schemaVersion").and_then(|v| v.as_u64()))
            .map(|v| v as u32)
    } else {
        None
    };

    // 只做一层浅统计：探针要快，不能为了给个数字把整棵树走一遍
    let mut md_count = 0usize;
    let mut dir_count = 0usize;
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            let file_type = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().into_owned();
            if file_type.is_dir() {
                if !is_skipped_dir(&name) {
                    dir_count += 1;
                }
            } else if name.to_lowercase().ends_with(".md") {
                md_count += 1;
            }
        }
    }

    Ok(VaultProbe {
        exists,
        is_dir,
        is_vault: has_marker || has_obsidian,
        has_marker,
        has_obsidian,
        has_ocstudio_dir,
        md_count,
        dir_count,
        schema_version,
    })
}

/// 原子写：先写同目录临时文件，再 rename 覆盖。
/// 直接 write 一个被打断就会留下半截文件，把用户的笔记写坏。
fn write_atomic(path: &Path, contents: &[u8], expected_mtime_ms: Option<i64>) -> WriteResult {
    let rel = path.to_string_lossy().into_owned();

    if let Some(expected) = expected_mtime_ms {
        match fs::metadata(path) {
            Ok(meta) => {
                let actual = mtime_ms(&meta);
                if actual != expected {
                    return WriteResult {
                        rel_path: rel,
                        ok: false,
                        conflict: true,
                        mtime_ms: Some(actual),
                        error: Some("磁盘上的文件已被外部修改".into()),
                    };
                }
            }
            Err(_) => {
                // 我们以为文件在，但它没了 —— 同样算冲突，交给上层决定
                return WriteResult {
                    rel_path: rel,
                    ok: false,
                    conflict: true,
                    mtime_ms: None,
                    error: Some("文件已不存在".into()),
                };
            }
        }
    }

    if let Some(parent) = path.parent() {
        if let Err(err) = fs::create_dir_all(parent) {
            return WriteResult {
                rel_path: rel,
                ok: false,
                conflict: false,
                mtime_ms: None,
                error: Some(format!("创建目录失败: {err}")),
            };
        }
    }

    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "unnamed".into());
    let tmp = path.with_file_name(format!(".{file_name}.octmp"));

    if let Err(err) = fs::write(&tmp, contents) {
        let _ = fs::remove_file(&tmp);
        return WriteResult {
            rel_path: rel,
            ok: false,
            conflict: false,
            mtime_ms: None,
            error: Some(format!("写入临时文件失败: {err}")),
        };
    }

    if let Err(err) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return WriteResult {
            rel_path: rel,
            ok: false,
            conflict: false,
            mtime_ms: None,
            error: Some(format!("替换目标文件失败: {err}")),
        };
    }

    let mtime = fs::metadata(path).map(|m| mtime_ms(&m)).ok();
    WriteResult {
        rel_path: rel,
        ok: true,
        conflict: false,
        mtime_ms: mtime,
        error: None,
    }
}

/// 把阻塞 IO 挪出主线程。Tauri 的同步命令跑在主线程上，会卡死界面。
pub(crate) async fn blocking<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|err| format!("后台任务失败: {err}"))?
}

#[tauri::command]
pub async fn vault_probe(path: String) -> Result<VaultProbe, String> {
    blocking(move || probe_impl(&path)).await
}

#[tauri::command]
pub async fn vault_scan(path: String) -> Result<VaultScan, String> {
    blocking(move || scan_impl(&path)).await
}

#[tauri::command]
pub async fn vault_write_texts(
    path: String,
    entries: Vec<WriteEntry>,
) -> Result<Vec<WriteResult>, String> {
    blocking(move || {
        let root = PathBuf::from(&path);
        if !root.is_dir() {
            return Err(format!("不是目录: {path}"));
        }
        let mut results = Vec::with_capacity(entries.len());
        for entry in entries {
            let target = match safe_join(&root, &entry.rel_path) {
                Ok(target) => target,
                Err(err) => {
                    results.push(WriteResult {
                        rel_path: entry.rel_path,
                        ok: false,
                        conflict: false,
                        mtime_ms: None,
                        error: Some(err),
                    });
                    continue;
                }
            };
            results.push(write_atomic(
                &target,
                entry.content.as_bytes(),
                entry.expected_mtime_ms,
            ));
        }
        Ok(results)
    })
    .await
}

/// 把外部文件（用户从任意位置选的图片）复制进 vault。
/// 在原生侧一次做完，避免「读成字节 → 经 JS → 再写回」的两次编解码。
#[tauri::command]
pub async fn vault_import_file(path: String, source: String, rel_path: String) -> Result<i64, String> {
    blocking(move || {
        let root = PathBuf::from(&path);
        let target = safe_join(&root, &rel_path)?;
        let source_path = PathBuf::from(&source);
        if !source_path.is_file() {
            return Err(format!("源文件不存在: {source}"));
        }
        let bytes = fs::read(&source_path)
            .map_err(|err| format!("读取源文件失败 {}: {err}", source_path.display()))?;
        let result = write_atomic(&target, &bytes, None);
        if result.ok {
            Ok(result.mtime_ms.unwrap_or_else(now_ms))
        } else {
            Err(result.error.unwrap_or_else(|| "导入失败".into()))
        }
    })
    .await
}

/// 写入二进制（图片等素材）
#[tauri::command]
pub async fn vault_write_bytes(path: String, rel_path: String, bytes: Vec<u8>) -> Result<i64, String> {
    blocking(move || {
        let root = PathBuf::from(&path);
        let target = safe_join(&root, &rel_path)?;
        let result = write_atomic(&target, &bytes, None);
        if result.ok {
            Ok(result.mtime_ms.unwrap_or_else(now_ms))
        } else {
            Err(result.error.unwrap_or_else(|| "写入失败".into()))
        }
    })
    .await
}

#[tauri::command]
pub async fn vault_read_bytes(path: String, rel_path: String) -> Result<Vec<u8>, String> {
    blocking(move || {
        let root = PathBuf::from(&path);
        let target = safe_join(&root, &rel_path)?;
        fs::read(&target).map_err(|err| format!("读取失败 {}: {err}", target.display()))
    })
    .await
}

#[tauri::command]
pub async fn vault_move(path: String, from: String, to: String) -> Result<(), String> {
    blocking(move || {
        let root = PathBuf::from(&path);
        let source = safe_join(&root, &from)?;
        let target = safe_join(&root, &to)?;
        if !source.exists() {
            return Err(format!("源文件不存在: {from}"));
        }
        if target.exists() {
            return Err(format!("目标已存在: {to}"));
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|err| format!("创建目录失败: {err}"))?;
        }
        fs::rename(&source, &target).map_err(|err| format!("移动失败: {err}"))
    })
    .await
}

#[tauri::command]
pub async fn vault_remove(path: String, rel_path: String) -> Result<(), String> {
    blocking(move || {
        let root = PathBuf::from(&path);
        let target = safe_join(&root, &rel_path)?;
        if !target.exists() {
            return Ok(());
        }
        fs::remove_file(&target).map_err(|err| format!("删除失败: {err}"))
    })
    .await
}

#[tauri::command]
pub async fn vault_mkdir(path: String, rel_path: String) -> Result<(), String> {
    blocking(move || {
        let root = PathBuf::from(&path);
        let target = safe_join(&root, &rel_path)?;
        fs::create_dir_all(&target).map_err(|err| format!("创建目录失败: {err}"))
    })
    .await
}

#[tauri::command]
pub async fn vault_exists(path: String, rel_path: String) -> Result<bool, String> {
    blocking(move || {
        let root = PathBuf::from(&path);
        Ok(safe_join(&root, &rel_path)?.exists())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 前端按 camelCase 读这些字段；字段名改错不会报错，只会静默变成 `undefined`
    /// （表现是「数据全空」这种最难查的故障），所以用一条测试把线格式钉死。
    #[test]
    fn wire_contract_field_names() {
        let scan = VaultScan {
            root: "R".into(),
            files: vec![VaultFile {
                rel_path: "a/b.md".into(),
                content: "x".into(),
                size: 1,
                mtime_ms: 2,
            }],
            skipped_dirs: vec![".obsidian".into()],
            dirs: vec!["20.角色".into()],
            other_files: vec!["oc.json".into()],
            marker: Some("{}".into()),
            warnings: vec!["w".into()],
            truncated: false,
        };
        let json = serde_json::to_value(&scan).expect("序列化 VaultScan");
        for key in [
            "root",
            "files",
            "skippedDirs",
            "otherFiles",
            "dirs",
            "marker",
            "warnings",
            "truncated",
        ] {
            assert!(json.get(key).is_some(), "VaultScan 缺字段 {key}");
        }
        for key in ["relPath", "content", "size", "mtimeMs"] {
            assert!(json["files"][0].get(key).is_some(), "VaultFile 缺字段 {key}");
        }

        let probe_json = serde_json::to_value(probe_impl(".").expect("探测当前目录")).expect("序列化");
        for key in [
            "exists",
            "isDir",
            "isVault",
            "hasMarker",
            "hasObsidian",
            "hasOcstudioDir",
            "mdCount",
            "dirCount",
            "schemaVersion",
        ] {
            assert!(probe_json.get(key).is_some(), "VaultProbe 缺字段 {key}");
        }

        let result = WriteResult {
            rel_path: "a.md".into(),
            ok: true,
            conflict: false,
            mtime_ms: Some(1),
            error: None,
        };
        let result_json = serde_json::to_value(&result).expect("序列化 WriteResult");
        for key in ["relPath", "ok", "conflict", "mtimeMs", "error"] {
            assert!(result_json.get(key).is_some(), "WriteResult 缺字段 {key}");
        }

        // 反序列化方向：前端传 camelCase
        let entry: WriteEntry =
            serde_json::from_str(r#"{"relPath":"a.md","content":"x","expectedMtimeMs":7}"#)
                .expect("解析 WriteEntry");
        assert_eq!(entry.rel_path, "a.md");
        assert_eq!(entry.expected_mtime_ms, Some(7));

        // 新建文件时前端会省略 expectedMtimeMs，必须仍能解析
        let fresh: WriteEntry = serde_json::from_str(r#"{"relPath":"a.md","content":"x"}"#)
            .expect("解析不含 mtime 的 WriteEntry");
        assert_eq!(fresh.expected_mtime_ms, None);
    }

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> Self {
            let mut base = std::env::temp_dir();
            let unique = format!("ocstudio-vault-{tag}-{}", now_ms());
            base.push(unique);
            fs::create_dir_all(&base).expect("建临时目录");
            TempDir(base)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        fn write(&self, rel: &str, content: &str) {
            let target = self.0.join(rel);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).expect("建父目录");
            }
            fs::write(target, content).expect("写文件");
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn safe_join_rejects_escape() {
        let root = Path::new("D:\\vault");
        assert!(safe_join(root, "角色/亚瑟.md").is_ok());
        assert!(safe_join(root, "./a/b.md").is_ok());
        assert!(safe_join(root, "../外面.md").is_err());
        assert!(safe_join(root, "a/../../外面.md").is_err());
        assert!(safe_join(root, "").is_err());
        #[cfg(windows)]
        assert!(safe_join(root, "C:\\Windows\\evil.md").is_err());
    }

    #[test]
    fn scan_finds_md_and_skips_hidden() {
        let dir = TempDir::new("scan");
        dir.write("20.角色/亚瑟.md", "---\ntitle: 亚瑟\n---\n\n正文\n");
        dir.write("10.国家/不列颠.md", "# 不列颠\n");
        dir.write(".obsidian/workspace.json", "{}");
        dir.write("图片/封面.png", "binary");
        dir.write(MARKER, r#"{"app":"oc-studio","schemaVersion":1}"#);

        let scan = scan_impl(dir.path().to_str().unwrap()).expect("扫描");

        assert_eq!(scan.files.len(), 2, "只应有 2 个 md");
        // 排序后第一条应是 10.国家/不列颠.md
        assert_eq!(scan.files[0].rel_path, "10.国家/不列颠.md");
        assert_eq!(scan.files[1].rel_path, "20.角色/亚瑟.md");
        assert!(scan.marker.is_some(), "标记文件应被读出");
        assert!(
            scan.other_files.iter().any(|p| p == "图片/封面.png"),
            "非 md 文件应进 other_files"
        );
        assert!(
            scan.skipped_dirs.iter().any(|p| p == ".obsidian"),
            ".obsidian 应被跳过"
        );
    }

    #[test]
    fn probe_detects_obsidian_vault_without_marker() {
        let dir = TempDir::new("probe");
        dir.write(".obsidian/app.json", "{}");
        dir.write("笔记.md", "x");

        let probe = probe_impl(dir.path().to_str().unwrap()).expect("探测");
        assert!(probe.exists && probe.is_dir);
        assert!(probe.has_obsidian);
        assert!(!probe.has_marker);
        assert!(probe.is_vault, "有 .obsidian 就应认作 vault");
        assert_eq!(probe.md_count, 1);
    }

    #[test]
    fn atomic_write_creates_and_detects_conflict() {
        let dir = TempDir::new("write");
        let target = dir.path().join("角色/新角色.md");

        // 无快照 → 直接建（含中间目录）
        let created = write_atomic(&target, "第一版".as_bytes(), None);
        assert!(created.ok, "首次写入应成功: {:?}", created.error);
        assert_eq!(fs::read_to_string(&target).unwrap(), "第一版");
        assert!(!target.with_file_name(".新角色.md.octmp").exists(), "临时文件应已清理");

        // 带上「很久以前」的 mtime → 必须判定冲突且**不覆盖**
        let stale = write_atomic(&target, "第二版".as_bytes(), Some(1));
        assert!(stale.conflict, "过期 mtime 应判定冲突");
        assert!(!stale.ok);
        assert_eq!(fs::read_to_string(&target).unwrap(), "第一版", "冲突时不得改写磁盘内容");

        // 带上真实 mtime → 允许覆盖
        let actual = mtime_ms(&fs::metadata(&target).unwrap());
        let updated = write_atomic(&target, "第二版".as_bytes(), Some(actual));
        assert!(updated.ok, "mtime 匹配时应允许覆盖: {:?}", updated.error);
        assert_eq!(fs::read_to_string(&target).unwrap(), "第二版");

        // 我们以为文件在、实际已删除 → 也算冲突
        fs::remove_file(&target).unwrap();
        let missing = write_atomic(&target, "第三版".as_bytes(), Some(actual));
        assert!(missing.conflict, "文件消失应判定冲突");
    }

    #[test]
    fn scan_strips_utf8_bom() {
        let dir = TempDir::new("bom");
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice("---\ntitle: 带BOM\n---\n".as_bytes());
        let target = dir.path().join("带BOM.md");
        fs::write(&target, &bytes).unwrap();

        let scan = scan_impl(dir.path().to_str().unwrap()).expect("扫描");
        assert_eq!(scan.files.len(), 1);
        assert!(
            scan.files[0].content.starts_with("---"),
            "BOM 应被剥掉，frontmatter 才能被识别"
        );
    }
}
