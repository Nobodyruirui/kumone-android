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
    card.appendChild(el('p', { class: 'm-login-note' }, opts.note || '用网易云音乐 App 扫码即可，不保存密码'));
    var actions = el('div', { class: 'm-err-actions' });
    if (opts.onLogin) {
      actions.appendChild(button('扫码登录', 'primary', function () { opts.onLogin(); }));
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
    var img = el('img', { class: 'm-tile-cover', alt: (opts.name || '') + ' 封面' });
    if (opts.cover) img.setAttribute('src', opts.cover);
    b.appendChild(img);
    b.appendChild(el('div', { class: 'm-tile-name' }, opts.name || ''));
    if (opts.sub) b.appendChild(el('div', { class: 'm-tile-sub' }, opts.sub));
    if (opts.onClick) b.addEventListener('click', opts.onClick);
    return b;
  }

  /**
   * 曲目行。
   * 结构是 <li><button>…</button></li>：列表语义归 li，
   * 按钮语义归 button —— 两者都要有，模型侧才拿得到可点的 ref。
   * @param {object} opts { track, index, onClick }
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
    li.appendChild(b);
    if (opts.onClick) b.addEventListener('click', opts.onClick);
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

  M.ui = {
    el: el,
    section: section,
    skeleton: skeleton,
    skeletonRail: skeletonRail,
    emptyNote: emptyNote,
    errorCard: errorCard,
    loginCard: loginCard,
    button: button,
    tile: tile,
    trackRow: trackRow,
    rankRow: rankRow,
    formatCount: formatCount,
    formatDuration: formatDuration,
    artistNames: artistNames,
    LOGIN_CODES: LOGIN_CODES
  };
})(window.Mobile = window.Mobile || {});
