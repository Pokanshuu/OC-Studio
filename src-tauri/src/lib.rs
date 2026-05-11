use tauri::Manager;

#[tauri::command]
fn update_theme(window: tauri::WebviewWindow, is_dark: bool) -> bool {
    #[cfg(target_os = "windows")]
    return window_vibrancy::apply_mica(&window, Some(is_dark)).is_ok();

    #[cfg(target_os = "macos")]
    return window_vibrancy::apply_blur(&window, None, None, None).is_ok();

    #[cfg(target_os = "linux")]
    return false;
}

#[tauri::command]
fn update_blur_effect(window: tauri::WebviewWindow, effect: String) {
    #[cfg(target_os = "windows")]
    match effect.as_str() {
        "mica" => { window_vibrancy::apply_mica(&window, None).ok(); }
        "acrylic" => { window_vibrancy::apply_acrylic(&window, Some((18, 18, 18, 125))).ok(); }
        "blur" => { window_vibrancy::apply_blur(&window, None).ok(); }
        _ => {}
    };

    #[cfg(target_os = "macos")]
    window_vibrancy::apply_blur(&window, None, None, None).ok();

    #[cfg(target_os = "linux")]
    { /* 不处理 */ }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let window = app.get_webview_window("main").expect("主窗口未找到");

      #[cfg(target_os = "windows")]
      {
        if window_vibrancy::apply_mica(&window, None).is_err() {
          window_vibrancy::apply_acrylic(&window, Some((18, 18, 18, 125))).ok();
        }
      }

      #[cfg(target_os = "macos")]
      window_vibrancy::apply_blur(&window, None, None, None)
        .expect("应用模糊效果失败");

      #[cfg(target_os = "linux")]
      { /* 不调用 window-vibrancy，保持透明无原生效果 */ }

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![update_theme, update_blur_effect])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
