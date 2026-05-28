(function() {
  try {
    var s = JSON.parse(localStorage.getItem('oc-studio-settings') || '{}');
    var t = s.theme || 'auto';
    var d = t === 'auto' ? window.matchMedia('(prefers-color-scheme: dark)').matches : t === 'dark';
    if (d) { document.documentElement.classList.add('dark'); document.documentElement.setAttribute('data-theme', 'dark'); }

    if (window.__TAURI__ || window.__TAURI_INTERNALS__) {
      document.documentElement.classList.add('tauri-mica');
    }

  } catch(e) {}
})()
