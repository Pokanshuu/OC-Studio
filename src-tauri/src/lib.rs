use std::sync::OnceLock;

mod files;
mod journal;
mod open;
mod vault;

#[cfg(target_os = "windows")]
static IS_WIN11: OnceLock<bool> = OnceLock::new();

#[cfg(target_os = "windows")]
fn is_windows_11() -> bool {
    *IS_WIN11.get_or_init(|| {
        let v = windows_version::OsVersion::current();
        v.major >= 10 && v.build >= 22000
    })
}

/// 只回答「这台机器能不能用模糊」，**不去动窗口**。
///
/// 以前前端拿 `init_blur(enabled: false)` 当探针用，于是每次打开设置都会
/// 把已经生效的 Mica 关掉（`clear_mica` + 把背景刷成不透明纸色）。
#[tauri::command]
fn blur_supported() -> bool {
    #[cfg(target_os = "windows")]
    {
        return is_windows_11();
    }

    #[cfg(target_os = "macos")]
    {
        return true;
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        false
    }
}

#[tauri::command]
fn init_blur(window: tauri::WebviewWindow, enabled: bool, is_dark: bool) -> bool {
    use tauri::webview::Color;

    #[cfg(target_os = "windows")]
    {
        if !is_windows_11() { return false; }
        if enabled {
            let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
            window_vibrancy::apply_mica(&window, None).ok();
        } else {
            window_vibrancy::clear_mica(&window).ok();
            window_vibrancy::clear_acrylic(&window).ok();
            window_vibrancy::clear_blur(&window).ok();
            let color = if is_dark { Color(28, 27, 26, 255) } else { Color(254, 252, 248, 255) };
            let _ = window.set_background_color(Some(color));
        }
        return true;
    }

    #[cfg(target_os = "macos")]
    {
        if enabled {
            let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
            window_vibrancy::apply_blur(&window, None, None, None).ok();
        } else {
            window_vibrancy::clear_vibrancy(&window).ok();
            let color = if is_dark { Color(28, 27, 26, 255) } else { Color(254, 252, 248, 255) };
            let _ = window.set_background_color(Some(color));
        }
        return true;
    }

    #[cfg(target_os = "linux")]
    return false;
}

#[tauri::command]
fn update_blur_effect(window: tauri::WebviewWindow, enabled: bool, is_dark: bool) -> bool {
    use tauri::webview::Color;

    #[cfg(target_os = "windows")]
    {
        if enabled {
            let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
            if is_windows_11() {
                window_vibrancy::apply_mica(&window, Some(is_dark)).ok();
                return true;
            } else {
                let accent = if is_dark { (28, 27, 26, 200u8) } else { (254, 252, 248, 200u8) };
                window_vibrancy::apply_acrylic(&window, Some(accent)).ok();
                return true;
            }
        } else {
            window_vibrancy::clear_mica(&window).ok();
            window_vibrancy::clear_acrylic(&window).ok();
            window_vibrancy::clear_blur(&window).ok();
            let color = if is_dark { Color(28, 27, 26, 255) } else { Color(254, 252, 248, 255) };
            let _ = window.set_background_color(Some(color));
            return false;
        }
    }

    #[cfg(target_os = "macos")]
    {
        if enabled {
            let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
            window_vibrancy::apply_blur(&window, None, None, None).ok();
            return true;
        } else {
            window_vibrancy::clear_vibrancy(&window).ok();
            let color = if is_dark { Color(28, 27, 26, 255) } else { Color(254, 252, 248, 255) };
            let _ = window.set_background_color(Some(color));
            return false;
        }
    }

    #[cfg(target_os = "linux")]
    return false;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      use tauri::Manager;
      let window = app.get_webview_window("main").expect("主窗口未找到");
      use tauri::webview::Color;
      let _ = window.set_background_color(Some(Color(254, 252, 248, 255)));

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      update_blur_effect,
      init_blur,
      blur_supported,
      open::open_external,
      vault::vault_probe,
      vault::vault_scan,
      vault::vault_write_texts,
      vault::vault_write_bytes,
      vault::vault_import_file,
      vault::vault_read_bytes,
      vault::vault_move,
      vault::vault_remove,
      vault::vault_mkdir,
      vault::vault_exists,
      journal::journal_append,
      journal::journal_tail,
      files::save_text
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
