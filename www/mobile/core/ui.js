/* =============================================================
 * 移动端渲染层 · 界面零件
 * -------------------------------------------------------------
 * 视图之间要复用的东西集中在这里，避免每个视图各写一遍：
 *
 *   el          建元素的小工具
 *   section     区块外壳（粗体标题 + 细斜体副标）
 *   skeleton    加载占位（区别于错误态与空态）
 *   emptyNote   空态
 *   errorCard   错误卡（按错误码分支给动作）
 *   loginCard   登录引导
 *   tile        封面卡（歌单 / 歌手 / 专辑）
 *   trackRow    曲目行
 *   rankRow     榜单项
 *
 * 每个零件都自带语义（role + aria-label）——
 * 无障碍树就是界面契约（docs/adr/0003）：模型侧靠它定位，靠 ref 动作。
 *
 * 这一层只管"长什么样、叫什么名字"，不发请求、不改状态。
 * ============================================================= */
(function (M) {
  'use strict';

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

  /* ------------------------------------------------------------ 数字 */

  /** 播放量：12345 → 1.2万 */
  function formatCount(n) {
    n = Number(n) || 0;
    if (n >= 100000000) return trimZero(n / 100000000) + '亿';
    if (n >= 10000) return trimZero(n / 10000) + '万';
    return String(n);
  }

  function trimZero(v) {
    return (Math.round(v * 10) / 10).toString();
  }

  /** 时长（毫秒） → 3:07 */
  function formatDuration(ms) {
    var total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /** 曲目艺人名（归一化后的曲目里艺人是数组）。 */
  function artistNames(track) {
    if (!track || !track.artists || !track.artists.length) return '';
    return track.artists.map(function (a) { return a.name; }).join(' / ');
  }

  /* ---------------------------------------------------------- 外壳件 */

  /**
   * 区块外壳：标题 + 细斜体副标 + 内容槽。
   * @param {object} opts { key, title, note, role }
   * @returns {object} { sec, body }  body 是内容槽，异步结果往里替换
   */
  function section(opts) {
    opts = opts || {};
    var sec = el('section', { class: 'm-section', role: 'region', 'aria-label': opts.title || '' });
    if (opts.key) sec.setAttribute('data-block', opts.key);
    if (opts.role) sec.setAttribute('data-role', opts.role);
    sec.appendChild(el('h2', { class: 'm-section-title' }, opts.title || ''));
    if (opts.note) sec.appendChild(el('p', { class: 'm-section-note' }, opts.note));
    var body = el('div', { class: 'm-block-body' });
    sec.appendChild(body);
    return { sec: sec, body: body };
  }

  /**
   * 加载占位。必须随数据返回被替换 —— 它表示"还在路上"，
   * 不表示"失败了"（失败走 errorCard，空走 emptyNote）。
   */
  function skeleton(count, label) {
    var wrap = el('div', { class: 'm-skeleton-grid', role: 'list', 'aria-label': label || '加载中', 'aria-busy': 'true' });
    for (var i = 0; i < (count || 2); i++) {
      var card = el('div', { role: 'listitem' });
      card.appendChild(el('div', { class: 'm-skeleton', 'aria-hidden': 'true' }));
      card.appendChild(el('div', { class: 'm-skeleton skeleton-line', 'aria-hidden': 'true' }));
      wrap.appendChild(card);
    }
    return wrap;
  }

  /** 横向骨架条（用于横向歌单区）。 */
  function skeletonRail(count, label) {
    var wrap = el('div', { class: 'm-rail', role: 'list', 'aria-label': label || '加载中', 'aria-busy': 'true' });
    for (var i = 0; i < (count || 3); i++) {
      var item = el('div', { role: 'listitem' });
      item.appendChild(el('div', { class: 'm-skeleton m-skeleton-tile', 'aria-hidden': 'true' }));
      item.appendChild(el('div', { class: 'm-skeleton skeleton-line', 'aria-hidden': 'true' }));
      wrap.appendChild(item);
    }
    return wrap;
  }

  /** 空态：有区块但没有内容。 */
  function emptyNote(text) {
    return el('div', { class: 'm-empty' }, text || '这里还没有内容');
  }

  /* ---------------------------------------------------------- 错误件 */

  // 需要"换策略"的错误码：给「去登录」而不是「重试」
  var LOGIN_CODES = {
    KUMONE_NEED_LOGIN: 1,
    KUMONE_AUTH_EXPIRED: 1
  };

  /**
   * 错误卡：把契约错误的五要素摊开给人看，并**按码**决定给什么动作。
   *
   *   transient → 「重试」
   *   需要登录 → 「去登录」
   *   其余 permanent → 不给重试（重试没有意义），只展示"下一步该干什么"
   *
   * @param {object} err 契约错误（core/errors.js 造的）
   * @param {object} opts { onRetry, onLogin }
   */
  function errorCard(err, opts) {
    opts = opts || {};
    err = err || {};

    var card = el('div', {
      class: 'm-card m-err',
      role: 'status',
      'aria-label': (err.title || '出错了') + '：' + (err.code || '')
    });
    card.setAttribute('data-code', err.code || '');
    card.setAttribute('data-kind', err.kind || '');

    card.appendChild(el('div', { class: 'm-err-title' }, err.title || '出错了'));
    if (err.code) {
      card.appendChild(el('div', { class: 'm-err-code' }, err.code));
    }
    if (err.message) {
      card.appendChild(el('pre', { class: 'm-err-msg' }, err.message));
    }

    var actions = el('div', { class: 'm-err-actions' });
    if (LOGIN_CODES[err.code]) {
      if (opts.onLogin) {
        actions.appendChild(button('去登录', 'primary', function () { opts.onLogin(); }));
      }
    } else if (err.kind === 'transient') {
      if (opts.onRetry) {
        actions.appendChild(button('重试', 'primary', function () { opts.onRetry(); }));
      }
    }
    card.appendChild(actions);

    return card;
  }

  /**
   * 登录引导：未登录时出现在需要登录的区块里。
   * 点击拉起扫码（与登录中断共用同一条路径）。
   */
  function loginCard(opts) {
    opts = opts || {};
    var card = el('div', { class: 'm-card m-login', role: 'group', 'aria-label': '需要登录' });
    card.appendChild(el('div', { class: 'm-login-title' }, '登录后这里才有内容'));
    card.appendChild(el('p', { class: 'm-login-note' }, opts.note || '用手机号密码登录，或用网易云音乐 App 扫码'));
    var actions = el('div', { class: 'm-err-actions' });
    if (opts.onLogin) {
      actions.appendChild(button('去登录', 'primary', function () { opts.onLogin(); }));
    }
    card.appendChild(actions);
    return card;
  }

  /** 通用按钮。 */
  function button(label, variant, onClick) {
    var b = el('button', {
      class: 'm-btn' + (variant ? ' m-btn-' + variant : ''),
      type: 'button',
      'aria-label': label
    }, label);
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  /* ---------------------------------------------------------- 内容件 */

  /**
   * 封面占位图：图片真的取不到时用它顶上。
   * 为什么要有：真机上网易云的图片地址可能失效，
   * 没有兜底就是浏览器默认的裂图图标，界面看起来「坏了」。
   */
  var COVER_PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="10" fill="#e9e9ee"/>' +
    '<path d="M27 44V21l15-3v20" fill="none" stroke="#b6b6c0" stroke-width="2.4" ' +
    'stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="23.5" cy="45" r="4.2" fill="#b6b6c0"/>' +
    '<circle cx="38.5" cy="42" r="4.2" fill="#b6b6c0"/></svg>'
  );

  /**
   * 封面元素：统一负责「地址规整 + 缩略尺寸 + 加载失败兜底」。
   *
   * 地址规整在共享归一化层做（见 imageUrl）：网易云对歌曲封面返回
   * `http://`，在 `https://localhost` 的页面里会被当成混合内容拦掉。
   *
   * 尺寸：按用途给缩略图（卡片 220 / 迷你条 96 / 详情头图 400 / 全屏封面 500），
   * 不然每次都在下原图 —— 真机上「有的封面秒出、有的半天不出」就是这么来的。
   *
   * 兜底：图片 CDN 有 p1..p4 四个节点，内容相同；一个节点失败就换下一个重试，
   * 都失败了才落占位图。
   *
   * @param {object} opts { url, alt, className, size, eager }
   * @returns {object} <img>
   */
  function cover(opts) {
    opts = opts || {};
    var img = el('img', { class: (opts.className || 'm-cover') + ' m-cover', alt: opts.alt || '' });
    img.setAttribute('decoding', 'async');
    img.setAttribute('loading', opts.eager ? 'eager' : 'lazy');
    watchCover(img);
    setCover(img, opts.url, opts.size);
    return img;
  }

  /**
   * 给一个已有的 <img> 装上封面的加载行为：淡入 + 失败换 CDN 节点重试。
   * 迷你播放条那种用 innerHTML 建出来的元素走这里。
   */
  function watchCover(img) {
    if (!img || img.__coverWatched) return img;
    img.__coverWatched = true;
    img.setAttribute('decoding', 'async');
    img.addEventListener('load', function () {
      img.classList.add('is-loaded');
    });
    img.addEventListener('error', function () {
      var tries = Number(img.getAttribute('data-cdn-tries') || 0);
      var alt = nextCdnHost(img.getAttribute('src'));
      if (alt && tries < 3) {
        img.setAttribute('data-cdn-tries', String(tries + 1));
        img.setAttribute('src', alt);
        return;
      }
      if (img.getAttribute('src') === COVER_PLACEHOLDER) return;
      img.setAttribute('src', COVER_PLACEHOLDER);
      img.classList.add('is-missing');
      img.classList.add('is-loaded');
    });
    return img;
  }

  /** 网易云图片 CDN 的四个节点（内容相同）：换节点重试。 */
  var CDN_RE = /^(https?:)\/\/p([1-4])\.music\.126\.net\//i;

  function nextCdnHost(url) {
    var m = String(url || '').match(CDN_RE);
    if (!m) return null;
    var n = (Number(m[2]) % 4) + 1;
    return String(url).replace(CDN_RE, m[1] + '//p' + n + '.music.126.net/');
  }

  /**
   * 给已有的封面元素换图（复用 cover() 建好的元素）。
   * @param {object} img <img>
   * @param {string|null} url 图片地址
   * @param {number} [size] 缩略尺寸
   */
  function setCover(img, url, size) {
    if (!img) return;
    var u = url;
    if (u && M.normalize && M.normalize.imageUrl) u = M.normalize.imageUrl(u, size);
    if (!u) {
      img.setAttribute('src', COVER_PLACEHOLDER);
      img.classList.add('is-missing');
      img.classList.add('is-loaded');
      return;
    }
    img.classList.remove('is-missing');
    if (img.getAttribute('src') !== u) {
      img.setAttribute('data-cdn-tries', '0');
      // 记下第一次请求的地址：换节点重试后还能看出原本要的是哪张
      if (!img.getAttribute('data-cdn-first')) img.setAttribute('data-cdn-first', u);
      img.setAttribute('src', u);
    }
    if (img.complete && img.naturalWidth > 0) img.classList.add('is-loaded');
  }

  /**
   * 封面卡：歌单 / 歌手 / 专辑都用它。
   * @param {object} opts { name, sub, cover, ariaLabel, onClick }
   */
  function tile(opts) {
    opts = opts || {};
    var b = el('button', {
      class: 'm-tile',
      type: 'button',
      'aria-label': opts.ariaLabel || opts.name || ''
    });
    b.appendChild(cover({ url: opts.cover, alt: (opts.name || '') + ' 封面', className: 'm-tile-cover', size: 220 }));
    b.appendChild(el('div', { class: 'm-tile-name' }, opts.name || ''));
    if (opts.sub) b.appendChild(el('div', { class: 'm-tile-sub' }, opts.sub));
    if (opts.onClick) b.addEventListener('click', opts.onClick);
    return b;
  }

  /**
   * 曲目行。
   * 结构是 <li><button>…</button></li>：列表语义归 li，
   * 按钮语义归 button —— 两者都要有，模型侧才拿得到可点的 ref。
   *
   * 给了 onAdd 就多一个「+」按钮（与主按钮**平级**，不能嵌套）：
   *   <li><button class="m-track-btn">…</button><button class="m-track-add">+</button></li>
   *
   * @param {object} opts { track, index, onClick, onAdd, sub }
   */
  function trackRow(opts) {
    opts = opts || {};
    var track = opts.track || {};
    var name = track.name || '';
    var who = artistNames(track);

    var li = el('li', { class: 'm-track', role: 'listitem' });
    var b = el('button', {
      class: 'm-track-btn',
      type: 'button',
      'aria-label': '播放 ' + name + (who ? ' · ' + who : '')
    });
    if (opts.index != null) {
      b.appendChild(el('span', { class: 'm-track-idx', 'aria-hidden': 'true' }, String(opts.index + 1)));
    }
    var main = el('div', { class: 'm-track-main' });
    main.appendChild(el('div', { class: 'm-track-name' }, name));
    var sub = who;
    if (track.album && track.album.name) sub = sub ? sub + ' · ' + track.album.name : track.album.name;
    if (opts.sub) sub = opts.sub;          // 调用方想换副标题（比如「本周 12 次」）
    if (sub) main.appendChild(el('div', { class: 'm-track-sub' }, sub));
    b.appendChild(main);
    b.appendChild(el('span', { class: 'm-track-dur' }, formatDuration(track.durationMS)));
    if (opts.onClick) b.addEventListener('click', opts.onClick);
    li.appendChild(b);

    if (opts.onAdd) {
      var add = el('button', {
        class: 'm-track-add',
        type: 'button',
        'aria-label': '加入歌单 · ' + name
      }, '+');
      add.addEventListener('click', function (e) {
        e.stopPropagation();
        opts.onAdd(track);
      });
      li.appendChild(add);
    }
    return li;
  }

  /**
   * 榜单项：带名次。
   * @param {object} opts { rank, name, sub, onClick }
   */
  function rankRow(opts) {
    opts = opts || {};
    var li = el('li', { class: 'm-rank', role: 'listitem' });
    var b = el('button', {
      class: 'm-track-btn',
      type: 'button',
      'aria-label': '第 ' + opts.rank + ' 名 ' + (opts.name || '')
    });
    b.appendChild(el('span', { class: 'm-rank-no', 'aria-hidden': 'true' }, String(opts.rank)));
    var main = el('div', { class: 'm-track-main' });
    main.appendChild(el('div', { class: 'm-track-name' }, opts.name || ''));
    if (opts.sub) main.appendChild(el('div', { class: 'm-track-sub' }, opts.sub));
    b.appendChild(main);
    li.appendChild(b);
    if (opts.onClick) b.addEventListener('click', opts.onClick);
    return li;
  }

  /**
   * 底部抽屉：从下方滑进来，点背景或点关闭收起。
   * 用在「加入歌单」「新建歌单」这类**临时选择**上 —— 不切页面，用户的上下文不丢。
   *
   * @param {object} opts { title }
   * @returns {object} { body, setBody(node), close() }
   */
  function sheet(opts) {
    opts = opts || {};
    var mask = el('div', { class: 'm-sheet-mask' });
    var box = el('div', {
      class: 'm-sheet',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': opts.title || '面板'
    });
    var head = el('div', { class: 'm-sheet-head' });
    head.appendChild(el('span', { class: 'm-sheet-title' }, opts.title || ''));
    var closeBtn = el('button', { class: 'm-sheet-close', type: 'button', 'aria-label': '关闭' }, '×');
    head.appendChild(closeBtn);
    var bodyEl = el('div', { class: 'm-sheet-body' });
    box.appendChild(head);
    box.appendChild(bodyEl);
    mask.appendChild(box);
    document.body.appendChild(mask);

    var opened = false;
    function open() {
      if (opened) return;
      opened = true;
      mask.classList.add('is-open');
    }
    // 入场动画：rAF 不触发时靠定时器兜底（否则面板永远半透明）
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(open);
    setTimeout(open, 24);

    function close() {
      mask.classList.remove('is-open');
      setTimeout(function () {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }, 260);
    }
    closeBtn.addEventListener('click', close);
    mask.addEventListener('click', function (e) {
      if (e.target === mask) close();
    });

    return {
      body: bodyEl,
      setBody: function (node) {
        bodyEl.textContent = '';
        if (node) bodyEl.appendChild(node);
      },
      close: close
    };
  }

  M.ui = {
    el: el,
    section: section,
    skeleton: skeleton,
    skeletonRail: skeletonRail,
    emptyNote: emptyNote,
    errorCard: errorCard,
    loginCard: loginCard,
    button: button,
    cover: cover,
    watchCover: watchCover,
    setCover: setCover,
    sheet: sheet,
    COVER_PLACEHOLDER: COVER_PLACEHOLDER,
    tile: tile,
    trackRow: trackRow,
    rankRow: rankRow,
    formatCount: formatCount,
    formatDuration: formatDuration,
    artistNames: artistNames,
    LOGIN_CODES: LOGIN_CODES
  };
})(window.Mobile = window.Mobile || {});
