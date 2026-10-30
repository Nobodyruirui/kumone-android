/* =============================================================
 * 移动端渲染层 · 外壳（吸顶栏 / 底部导航 / 迷你播放条）
 * -------------------------------------------------------------
 * 只负责"壳"，不碰数据。数据通过 Mobile.render 传进来。
 *
 * 语义约束：可交互元素一律用语义标签 + aria-label，
 * 无障碍树就是界面契约（docs/adr/0003）。
 * ============================================================= */
(function (M) {
  'use strict';

  var SVG = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10.4 12 3.8l8.5 6.6"/><path d="M5.6 9.6V20h12.8V9.6"/></svg>',
    radio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6"/><path d="M15.8 15.8a5.4 5.4 0 0 0 0-7.6"/><path d="M5.4 5.4a9.4 9.4 0 0 0 0 13.2"/><path d="M18.6 18.6a9.4 9.4 0 0 0 0-13.2"/></svg>',
    library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 5.6h16"/><path d="M4 10.6h16"/><path d="M4 15.6h9.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.4"/><path d="M15.6 15.6 20.4 20.4"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4 7 12l8 8"/></svg>'
  };

  // 底部导航四项：主页 / 广播 / 资料库 / 搜索
  var TABS = [
    { view: 'home', label: '主页', icon: SVG.home },
    { view: 'fm', label: '广播', icon: SVG.radio },
    { view: 'library', label: '资料库', icon: SVG.library },
    { view: 'search', label: '搜索', icon: SVG.search }
  ];

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else n.setAttribute(k, attrs[k]);
      });
    }
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* ------------------------------------------------------------ 构建 */

  function buildHeader() {
    var main = document.getElementById('m-main');
    var h = el('header', { id: 'm-header', role: 'banner' });
    h.innerHTML =
      '<button id="m-back" type="button" aria-label="返回">' + SVG.back + '</button>' +
      '<div id="m-title" role="heading" aria-level="1"></div>' +
      '<div id="m-header-right"></div>';
    main.insertBefore(h, main.firstChild);
    h.querySelector('#m-back').addEventListener('click', function () { M.back(); });
  }

  function buildNav() {
    var nav = el('nav', { id: 'm-nav', 'aria-label': '主导航' });
    TABS.forEach(function (t) {
      var b = el('button', { class: 'm-tab', type: 'button', 'data-view': t.view, 'aria-label': t.label });
      b.innerHTML = '<span class="m-tab-ico" aria-hidden="true">' + t.icon + '</span>' +
                    '<span class="m-tab-lb">' + t.label + '</span>';
      b.addEventListener('click', function () { M.goTab(t.view); });
      nav.appendChild(b);
    });
    document.body.appendChild(nav);
  }

  function buildMini() {
    var bar = el('section', { id: 'm-mini', 'aria-label': '迷你播放条' });
    bar.innerHTML =
      '<div id="m-mini-line" aria-hidden="true"><i></i></div>' +
      '<button id="m-mini-open" type="button" aria-label="打开播放页">' +
      '<img id="m-mini-cover" alt="">' +
      '<span id="m-mini-text">' +
      '<span id="m-mini-title">未在播放</span>' +
      '<span id="m-mini-artist"></span>' +
      '</span></button>' +
      '<button id="m-mini-play" type="button" aria-label="播放">▶</button>';
    document.body.appendChild(bar);

    var open = bar.querySelector('#m-mini-open');
    if (open) {
      open.addEventListener('click', function () {
        M.nav({ type: 'nowplaying' });
      });
    }

    var playBtn = bar.querySelector('#m-mini-play');
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (M.player && typeof M.player.toggle === 'function') M.player.toggle();
      });
    }
  }

  /* ------------------------------------------------------------ 同步 */

  // 把当前视图的状态同步到外壳
  function sync(view, def) {
    var title = document.getElementById('m-title');
    if (title) {
      // 标题可以是字符串，也可以是函数（详情页要显示歌单名而不是"歌单"）
      var name = (def && def.title) || '';
      if (typeof name === 'function') name = name(view) || '';
      title.textContent = name;
      title.setAttribute('aria-label', name);
    }

    // 底部导航选中态：当前项用重墨 + aria-current
    var rootType = view && view.type;
    if (rootType === 'playlist' || rootType === 'album' || rootType === 'artist') rootType = 'home';
    Array.prototype.forEach.call(document.querySelectorAll('#m-nav .m-tab'), function (b) {
      var on = b.getAttribute('data-view') === rootType;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    // 返回箭头：有历史才显示
    var back = document.getElementById('m-back');
    if (back) back.classList.toggle('visible', !!(M.state.history && M.state.history.length));

    // 全屏播放页：占满屏幕，底部导航与迷你条都要消失（ADR-0002）
    // 隐藏逻辑放在外壳层，任何视图都能要求「藏起外壳」，视图自己不碰。
    setFullscreen(!!(view && view.type === 'nowplaying'));

    // 扫码登录与播放队列是**沉浸式流程**：藏起导航与迷你条。
    // 否则会出现「底部导航一个高亮都没有」——用户点了「资料库」却看不到它被选中；
    // 队列是从全屏播放页进来的，导航一冒出来，播放器就「塌」回普通页面了。
    setFocused(!!(view && (view.type === 'login' || view.type === 'queue')));
  }

  /**
   * 全屏模式开关：全屏播放页打开时藏起底部导航与迷你播放条。
   * @param {boolean} on
   */
  function setFullscreen(on) {
    document.body.classList.toggle('m-np', !!on);
  }

  /**
   * 沉浸式流程开关：藏起导航与迷你播放条（顶栏保留，返回箭头要用）。
   * @param {boolean} on
   */
  function setFocused(on) {
    document.body.classList.toggle('m-focus', !!on);
  }

  // 迷你播放条内容
  function setMini(track) {
    var cover = document.getElementById('m-mini-cover');
    var title = document.getElementById('m-mini-title');
    var artist = document.getElementById('m-mini-artist');
    if (!cover) return;
    if (!track) {
      cover.removeAttribute('src');
      cover.setAttribute('alt', '');
      title.textContent = '未在播放';
      artist.textContent = '';
      return;
    }
    if (track.cover) cover.setAttribute('src', track.cover);
    else cover.removeAttribute('src');
    cover.setAttribute('alt', track.name + ' 封面');
    title.textContent = track.name;
    // 归一化后的曲目里艺人是数组；播放状态快照里是字符串，两种都兜住
    var who = track.artist;
    if (!who && track.artists && track.artists.length) {
      who = track.artists.map(function (a) { return a.name; }).join(' / ');
    }
    artist.textContent = who || '';
  }

  // 迷你条上的播放/暂停按钮（跟着播放状态变文案）
  function setMiniPlaying(playing) {
    var btn = document.getElementById('m-mini-play');
    if (!btn) return;
    btn.textContent = playing ? '❚❚' : '▶';
    btn.setAttribute('aria-label', playing ? '暂停' : '播放');
  }

  /* ---------------------------------------------------------- 账号区 */

  /**
   * 顶栏右上角的账号入口：头像 + 昵称。
   * 未登录时清空（留一个空的槽，不显示假账号）。
   * @param {object|null} account { nickname, avatarUrl }
   */
  function setAccount(account) {
    var host = document.getElementById('m-header-right');
    if (!host) return;
    host.textContent = '';
    if (!account) { host.classList.remove('has-account'); return; }

    var who = account.nickname || '账号';
    var b = el('button', {
      id: 'm-account',
      type: 'button',
      class: 'm-account',
      'aria-label': '账号 ' + who
    });
    if (account.avatarUrl) {
      var img = el('img', { class: 'm-account-avatar', alt: who + ' 头像' });
      img.setAttribute('src', account.avatarUrl);
      b.appendChild(img);
    } else {
      b.appendChild(el('span', { class: 'm-account-dot', 'aria-hidden': 'true' }));
    }
    b.appendChild(el('span', { class: 'm-account-name' }, who));
    b.addEventListener('click', function () {
      if (M.actions && M.actions.confirmLogout) M.actions.confirmLogout();
    });
    host.appendChild(b);
    host.classList.add('has-account');
  }

  /* -------------------------------------------------------- 确认弹窗 */

  /**
   * 一个可复用的确认弹窗（替代 window.confirm —— 原生弹窗在 WebView 里体验差）。
   * @param {object} opts { title, text, okText, cancelText }
   * @returns {Promise<boolean>} 用户确认则 true
   */
  function confirmDialog(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var mask = el('div', { class: 'm-modal-mask' });
      var box = el('div', {
        class: 'm-modal',
        role: 'alertdialog',
        'aria-label': opts.title || '确认'
      });
      box.appendChild(el('div', { class: 'm-modal-title' }, opts.title || '确认'));
      if (opts.text) box.appendChild(el('p', { class: 'm-modal-text' }, opts.text));

      var row = el('div', { class: 'm-modal-actions' });
      var cancel = el('button', {
        class: 'm-btn', type: 'button', 'aria-label': opts.cancelText || '取消'
      }, opts.cancelText || '取消');
      var ok = el('button', {
        class: 'm-btn m-btn-primary', type: 'button', 'aria-label': opts.okText || '确定'
      }, opts.okText || '确定');

      function close(v) {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
        resolve(v);
      }
      cancel.addEventListener('click', function () { close(false); });
      ok.addEventListener('click', function () { close(true); });

      row.appendChild(cancel);
      row.appendChild(ok);
      box.appendChild(row);
      mask.appendChild(box);
      document.body.appendChild(mask);
      ok.focus();
    });
  }

  // 迷你条顶部进度细线
  function setMiniProgress(ratio) {
    var fill = document.querySelector('#m-mini-line > i');
    if (!fill) return;
    var p = Math.max(0, Math.min(1, ratio || 0));
    fill.style.width = (p * 100).toFixed(2) + '%';
  }

  // 吐司提示
  function toast(message) {
    var host = document.getElementById('m-toasts');
    if (!host) return;
    var t = el('div', { class: 'm-toast', role: 'status', 'aria-live': 'polite' }, null);
    t.textContent = message;
    host.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transition = 'opacity .3s';
      setTimeout(function () { t.remove(); }, 320);
    }, 2200);
  }

  /* ------------------------------------------------------------ 启动 */

  function boot() {
    buildHeader();
    buildNav();
    buildMini();

    var toasts = el('div', { id: 'm-toasts', role: 'region', 'aria-label': '提示' });
    document.body.appendChild(toasts);

    // 滚动收缩：大标题滚上去之后顶栏出现小标题
    var main = document.getElementById('m-main');
    if (main) {
      main.addEventListener('scroll', function () {
        var h = document.getElementById('m-header');
        if (h) h.classList.toggle('compact', main.scrollTop > 12);
      }, { passive: true });
    }
  }

  M.shell = { boot: boot, sync: sync, setMini: setMini, setMiniPlaying: setMiniPlaying, setMiniProgress: setMiniProgress, setAccount: setAccount, setFullscreen: setFullscreen, setFocused: setFocused, confirm: confirmDialog, toast: toast, TABS: TABS };
})(window.Mobile = window.Mobile || {});
