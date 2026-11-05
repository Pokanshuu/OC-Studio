//! 助手插件的后端。
//!
//! 这一层**原样搬自 Simple-Agent**，唯一改动是模块路径换成 `crate::agent::*`。
//! 上游更新时整目录覆盖即可。
//!
//! 存储是**插件自己的**：系统 app data 目录下的一只 SQLite，跟宿主的笔记库
//! （`.ocstudio/`）没有关系 —— 插件边界就该长这样，宿主不关心它数据放哪。
//! 宿主只注入两样东西：换模型要用的网络出口（`net`），以及给助手工具用的
//! 工作区（`tools`）。

pub mod commands;
pub mod db;
pub mod docx;
pub mod models;
pub mod net;
pub mod secrets;
pub mod tools;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct AppState {
  pub db: db::Db,
  pub streams: net::StreamRegistry,
  pub client: reqwest::Client,
  pub data_dir: PathBuf,
}

/// 搭插件自己的库与网络客户端。在宿主 `setup` 里调一次。
pub fn init(app: &tauri::AppHandle) -> Result<AppState, Box<dyn std::error::Error>> {
  use tauri::Manager;

  let data_dir = app
    .path()
    .app_data_dir()
    .unwrap_or_else(|_| PathBuf::from("."));
  std::fs::create_dir_all(&data_dir)?;

  let db = db::Db::open(&db::db_path(&data_dir))?;
  // 进程被半路杀掉会留下永远 STREAMING 的行。
  let repaired = db::resolve_dangling_streams(&db).unwrap_or(0);
  if repaired > 0 {
    println!("[agent] repaired {repaired} dangling streaming message(s)");
  }

  Ok(AppState {
    db,
    streams: Arc::new(Mutex::new(HashMap::new())),
    client: net::build_client(),
    data_dir,
  })
}
