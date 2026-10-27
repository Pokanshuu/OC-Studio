/* ============================================================================
   OC Studio 静态站点 · 样张脚本
   职责：主题切换 + 目录高亮。无框架、零依赖；禁用 JS 时页面依然完整可读。
   ========================================================================== */
(function () {
  'use strict';

  /* ── 主题 ──────────────────────────────────────────────────────────────── */
  var STORE_KEY = 'oc-site-theme';
  var btn = document.getElementById('theme-toggle');

  function bindTheme() {
    if (!btn) return;
    btn.addEventListener('click', function () {
      var dark = document.documentElement.classList.toggle('dark');
      try { localStorage.setItem(STORE_KEY, dark ? 'dark' : 'light'); } catch (e) { /* private mode */ }
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    });
  }

  /* ── 目录高亮（IntersectionObserver，无则静默跳过） ─────────────────────── */
  function bindToc() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    var map = {};
    var headings = [];
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var el = document.getElementById(id);
      if (el) { map[id] = a; headings.push(el); }
    });
    if (!headings.length) return;

    var visible = new Set();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      });
      // 取当前可见中最靠上的标题作为激活项
      var active = headings.filter(function (h) { return visible.has(h.id); })[0];
      if (!active) return;
      links.forEach(function (a) { a.classList.remove('is-active'); });
      if (map[active.id]) map[active.id].classList.add('is-active');
    }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });

    headings.forEach(function (h) { observer.observe(h); });
  }

  function init() {
    bindTheme();
    bindToc();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
