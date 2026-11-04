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
    favorite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.2 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13Z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4 7 12l8 8"/></svg>'
  };

  // 底部导航四项：主页 / 广播 / 搜索 / 收藏
  //
  // 「收藏」是**独立的一级功能**（用户要求）：收藏的歌单 + 收藏的专辑，
  // 不跟「登录 → 再进资料库」那条流程绑在一起。
  // 「我的」（我创建的歌单 / 喜欢的音乐 / 云盘 / 最近播放 / 听歌排行）收在顶栏左上角。
  var TABS = [
    { view: 'home', label: '主页', icon: SVG.home },
    { view: 'fm', label: '广播', icon: SVG.radio },
    { view: 'search', label: '搜索', icon: SVG.search },
    { view: 'favorites', label: '收藏', icon: SVG.favorite }
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
    // 第三个参数可以是字符串，也可以是**元素**；
    // 传元素时走 appendChild —— 走 innerHTML 会渲染成「[object HTMLButtonElement]」。
    if (html != null) {
      if (html.nodeType === 1 || html.nodeType === 11) n.appendChild(html);
      else n.innerHTML = html;
    }
    return n;
  }

  /* ------------------------------------------------------------ 构建 */

  function buildHeader() {
    var main = document.getElementById('m-main');
    var h = el('header', { id: 'm-header', role: 'banner' });
    h.innerHTML =
      // 左边是一个**固定宽度**的槽位：返回箭头与「我的」图标二选一。
      // （早先两个按钮各占一格，而看不见的那个还占着位置，
      //   把「我的」顶到了离屏幕边缘半厘米的地方。）
      '<div id="m-left">' +
      '<button id="m-back" type="button" aria-label="返回">' + SVG.back + '</button>' +
      // 左上角常驻的「我的」：点开是抽屉（我创建的歌单 / 喜欢的音乐 / 云盘 / …）
      '<button id="m-mine" type="button" class="m-mine-btn" aria-label="我的">' +
      '<span class="m-mine-ico" aria-hidden="true">' + SVG.library + '</span>' +
      '</button>' +
      '</div>' +
      '<div id="m-title" role="heading" aria-level="1"></div>' +
      '<div id="m-header-right"></div>';
    main.insertBefore(h, main.firstChild);
    h.querySelector('#m-back').addEventListener('click', function () { M.back(); });

    var chip = h.querySelector('#m-mine');
    if (chip) {
      chip.addEventListener('click', function () {
        if (M.actions && M.actions.openMine) M.actions.openMine();
      });
    }
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
      '<img id="m-mini-cover" class="m-cover" alt="">' +
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

    // 封面加载失败时顶上占位图，不显示浏览器默认的裂图
    var miniCover = bar.querySelector('#m-mini-cover');
    if (miniCover) {
      if (M.ui && M.ui.watchCover) M.ui.watchCover(miniCover);
      miniCover.setAttribute('loading', 'eager');
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

    // 「我的」不是一级菜单（收藏才是），所以没有底部导航项可点亮 ——
    // 这时候把右上角账号胶囊标成当前项（模型也能看出「现在在「我的」里」）
    var acc = document.getElementById('m-account');
    if (acc) {
      if (rootType === 'library') acc.setAttribute('aria-current', 'page');
      else acc.removeAttribute('aria-current');
    }

    // 左槽：返回箭头（有历史时）与「我的」（**常驻**）并排。
    // 「我的」任何页面都在 —— 进了二级页它也不消失：
    // 用户报过「找不到歌单和收藏在哪」，入口不能时有时无。
    var isRoot = !(M.state.history && M.state.history.length);
    var back = document.getElementById('m-back');
    if (back) back.classList.toggle('visible', !isRoot);
    var chip = document.getElementById('m-mine');
    if (chip) chip.classList.add('visible');

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

  /**
   * 取曲目的封面地址。
   *
   * 两种形状都要认（真机踩过）：
   *   · 播放状态快照：封面在 `cover` 上（引擎的 coverOf 已经算好了）
   *   · 归一化后的曲目：封面在 `album.picUrl` 上，**没有** `cover` 字段
   * 只看 `track.cover` 的话，迷你条永远拿不到封面（真机报「播放框没有专辑封面」）。
   */
  function coverOfTrack(track) {
    if (!track) return null;
    return track.cover || (track.album && track.album.picUrl) || null;
  }

  // 迷你播放条内容
  function setMini(track) {
    var cover = document.getElementById('m-mini-cover');
    var title = document.getElementById('m-mini-title');
    var artist = document.getElementById('m-mini-artist');
    if (!cover) return;
    if (!track) {
      M.ui.setCover(cover, null, 96);
      cover.setAttribute('alt', '');
      title.textContent = '未在播放';
      artist.textContent = '';
      return;
    }
    M.ui.setCover(cover, coverOfTrack(track), 96);
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
   * 顶栏右上角：登录后是头像 + 昵称（点开「我的」），没登录是「登录」按钮。
   *
   * 为什么没登录也要留一个入口：资料库移出一级菜单后，
   * 「登录」与「我的」都只剩顶栏这一条路 —— 这里空了，路就断了。
   *
   * @param {object|null} account { nickname, avatarUrl }
   */
  function setAccount(account) {
    var host = document.getElementById('m-header-right');
    if (!host) return;
    host.textContent = '';
    if (!account) {
      host.classList.remove('has-account');
      var login = el('button', {
        id: 'm-login',
        type: 'button',
        class: 'm-login-btn',
        'aria-label': '登录'
      }, '登录');
      login.addEventListener('click', function () {
        if (M.actions && M.actions.toLogin) M.actions.toLogin(null);
      });
      host.appendChild(login);
      return;
    }

    var who = account.nickname || '账号';
    var b = el('button', {
      id: 'm-account',
      type: 'button',
      class: 'm-account',
      'aria-label': '账号 ' + who
    });
    if (account.avatarUrl) {
      var img = M.ui.cover({ url: account.avatarUrl, alt: who + ' 头像', className: 'm-account-avatar', size: 96, eager: true });
      b.appendChild(img);
    } else {
      b.appendChild(el('span', { class: 'm-account-dot', 'aria-hidden': 'true' }));
    }
    b.appendChild(el('span', { class: 'm-account-name' }, who));
    // VIP 标识：登录后要能一眼看出 VIP 权限有没有生效
    // （VIP 直接决定无损 / Hi-Res 能不能真放出来）
    if (account.vipType > 0) {
      b.appendChild(el('span', { class: 'm-account-vip', 'aria-label': 'VIP 会员' }, 'VIP'));
    }
    b.addEventListener('click', function () {
      // 右上角只用来「登录 / 账号」：登录状态与退出登录都在登录页里。
      // 早先点头像直接掉登录态 —— 太容易误触（用户原话：右上角只用来登录）。
      if (M.actions && M.actions.toLogin) M.actions.toLogin(null);
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
