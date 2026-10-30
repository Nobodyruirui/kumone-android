/* =============================================================
 * Kumone for Android — Apple Music 风格皮肤层 · 骨架与布局
 * -------------------------------------------------------------
 * 不改上游任何文件，只在运行时叠加 iOS 观感：
 *   1. 底部 Tab Bar（发现 / 电台 / 搜索 / 我的）
 *   2. 吸顶大标题导航栏（滚动后收缩成居中小标题）
 *   3. 迷你播放条（毛玻璃 + 顶部进度细线）
 *   4. 正在播放页的全屏化（顶部收起/队列按钮、隐藏 Tab Bar）
 *
 * 依赖 app.js 的全局绑定：state / player / audio / render / back
 * ============================================================= */
(function () {
  'use strict';
  if (window.__appleTheme) return;
  window.__appleTheme = true;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function mk(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function appState() {
    try { return (typeof state !== "undefined" && state) ? state : null; } catch (_e) { return null; }
  }

  /* ------------------------------------------------ 1. 底部 Tab Bar */

  var SVG = {
    home: '<svg viewBox="0 0 24 24"><path d="M12 3.1 2.9 10.2a1 1 0 0 0 .63 1.77H4.9v7.13A1.9 1.9 0 0 0 6.8 21h3.05v-5.1a1.05 1.05 0 0 1 1.05-1.05h2.2A1.05 1.05 0 0 1 14.15 15.9V21h3.05a1.9 1.9 0 0 0 1.9-1.9v-7.13h1.37a1 1 0 0 0 .63-1.77Z"/></svg>',
    radio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/><path d="M8 8a5.7 5.7 0 0 0 0 8"/><path d="M16 16a5.7 5.7 0 0 0 0-8"/><path d="M5.2 5.2a9.6 9.6 0 0 0 0 13.6"/><path d="M18.8 18.8a9.6 9.6 0 0 0 0-13.6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.4"/><path d="M15.6 15.6 20.4 20.4"/></svg>',
    person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.7"/><path d="M4.6 20.4a7.4 7.4 0 0 1 14.8 0Z"/></svg>'
  };

  var TABS = [
    { view: 'home', label: '发现', icon: SVG.home },
    { view: 'fm', label: '电台', icon: SVG.radio },
    { view: 'search', label: '搜索', icon: SVG.search },
    { view: 'library', label: '我的', icon: SVG.person }
  ];

  var lastRoot = 'home';

  function buildTabBar() {
    if ($('#tabbar')) return;
    var bar = mk('nav', 'tabbar');
    bar.id = 'tabbar';
    bar.setAttribute('aria-label', '主导航');
    TABS.forEach(function (t) {
      var b = mk('button', 'tab-item');
      b.setAttribute('data-view', t.view);
      b.setAttribute('type', 'button');
      b.innerHTML = '<span class="tab-ico">' + t.icon + '</span><span class="tab-lb">' + t.label + '</span>';
      b.addEventListener('click', function () { onTab(t.view); });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
  }

  function onTab(view) {
    var st = appState();
    // 「我的」未登录时直接拉起扫码登录
    if (view === 'library' && st && !st.account) {
      try { if (typeof openLogin === 'function') { openLogin(); return; } } catch (_e) {}
    }
    try {
      if (st && st.view && st.view.type === view) {
        var main = $('#main');
        if (main) main.scrollTop = 0;
        return;
      }
      window.kumoneNav({ type: view });
    } catch (_e) {}
  }

  function syncTabs() {
    var st = appState();
    var type = st && st.view ? st.view.type : 'home';
    var roots = { home: 1, fm: 1, search: 1, library: 1 };
    if (roots[type]) lastRoot = type;
    $$('#tabbar .tab-item').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === lastRoot);
    });
  }

  /* -------------------------------------------- 2. 吸顶大标题导航栏 */

  function buildHeader() {
    var main = $('#main');
    if (!main || $('#app-header')) return;
    var h = mk('header', 'app-header');
    h.id = 'app-header';
    h.innerHTML =
      '<button class="ah-back" id="ah-back" type="button" aria-label="返回">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4 7 12l8 8"/></svg>' +
      '</button>' +
      '<div class="ah-title" id="ah-title"></div>' +
      '<div class="ah-right"></div>';
    main.insertBefore(h, main.firstChild);
    h.querySelector('#ah-back').addEventListener('click', function () {
      try { back(); } catch (_e) {}
    });
  }

  function syncHeader() {
    var st = appState();
    var view = $('#view');
    if (!view) return;
    var h1 = view.querySelector('h1.page-title');
    var title = h1 ? h1.textContent.trim() : '';
    var t = $('#ah-title');
    if (t) t.textContent = title;
    var back = $('#ah-back');
    if (back) back.style.visibility = (st && st.history && st.history.length) ? 'visible' : 'hidden';
  }

  /* -------------------------------------------- 3. 迷你播放条进度线 */

  function buildPlayerLine() {
    var bar = $('#playerbar');
    if (!bar || $('#pb-line')) return;
    var line = mk('div', 'pb-line');
    line.id = 'pb-line';
    line.innerHTML = '<i></i>';
    bar.insertBefore(line, bar.firstChild);
  }

  function tickPlayerLine() {
    var fill = $('#pb-line > i');
    if (!fill) return;
    var a = (typeof audio !== "undefined") ? audio : null;
    if (!a || !a.duration || !isFinite(a.duration)) { fill.style.width = '0%'; return; }
    var p = (a.currentTime / a.duration) * 100;
    fill.style.width = Math.max(0, Math.min(100, p)).toFixed(2) + '%';
  }

  /* ---------------------------------------- 4. 正在播放页的顶部按钮 */

  function buildNowPlayingBar() {
    var np = $('.np-page');
    if (!np || $('.np-topbar')) return;
    var bar = mk('div', 'np-topbar');
    bar.innerHTML =
      '<button class="np-tb-btn" id="np-collapse" type="button" aria-label="收起">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg>' +
      '</button>' +
      '<div class="np-tb-spacer"></div>' +
      '<button class="np-tb-btn" id="np-queue" type="button" aria-label="播放队列">' +
      '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>' +
      '</button>';
    np.insertBefore(bar, np.firstChild);
    bar.querySelector('#np-collapse').addEventListener('click', function () {
      try { back(); } catch (_e) {}
    });
    bar.querySelector('#np-queue').addEventListener('click', function () {
      var q = $('#btn-queue');
      if (q) q.click();
    });
  }

  /* ---------------------------------------------- 5. 视图切换后的同步 */

  function afterRender() {
    var st = appState();
    var type = st && st.view ? st.view.type : 'home';
    document.body.classList.toggle('np-mode', type === 'nowplaying');
    buildHeader();
    buildPlayerLine();
    syncTabs();
    syncHeader();
    if (type === 'nowplaying') buildNowPlayingBar();
  }

  function hookRender() {
    var orig = window.render;
    if (typeof orig !== 'function' || orig.__appleHooked) return;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      setTimeout(afterRender, 0);
      return r;
    };
    wrapped.__appleHooked = true;
    window.render = wrapped;
  }

  /* ---------------------------------------------------- 6. 启动 */

  function boot() {
    buildTabBar();
    buildHeader();
    buildPlayerLine();
    hookRender();
    afterRender();

    // 滚动收缩：大标题滚上去之后顶栏出现小标题
    var main = $('#main');
    if (main) {
      main.addEventListener('scroll', function () {
        var h = $('#app-header');
        if (h) h.classList.toggle('compact', main.scrollTop > 18);
      }, { passive: true });
    }

    // 播放进度细线
    (function loop() {
      tickPlayerLine();
      requestAnimationFrame(loop);
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
