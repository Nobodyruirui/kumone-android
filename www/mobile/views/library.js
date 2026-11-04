/* =============================================================
 * 我的：抽屉与页面共用的入口集合
 * -------------------------------------------------------------
 * 「我的」是**我自己账号下的东西**：我创建的歌单 / 喜欢的音乐 / 云盘 /
 * 最近播放 / 听歌排行。
 *
 * 「收藏的歌单」「收藏的专辑」**不在这里** —— 它们是「我收藏的别人的东西」，
 * 已经升成一级功能（底部导航第四键「收藏」，见 views/favorites.js）。
 *
 * 三条纪律：
 *   1. **入口不被登录闸住**：未登录时抽屉照常打开，各条目写「登录后查看」，
 *      只有真的去取数的那一步才需要账号（用户要求：功能独立于登录流程）。
 *   2. **角色色不新增**：我的=黄、云盘=灰、最近播放=蓝、听歌排行=橙。
 *      一个颜色只承载一种含义，不要为了「整页统一」把五个点涂成同一个黄。
 *   3. **每个入口都要有摘要**：数据就绪后显示计数，让模型和人都能一眼看到里面有什么。
 * ============================================================= */
(function (M) {
  'use strict';

  var ui = M.ui;

  // 入口顺序 = 用户最可能找的东西排在前面。
  // 「收藏」已经独立成一级功能，这里只留「我的账号下的东西」。
  var ENTRIES = [
    { key: 'playlists', label: '我创建的歌单', role: 'owned', view: 'myplaylists' },
    { key: 'liked', label: '喜欢的音乐', role: 'owned', view: 'liked' },
    { key: 'cloud', label: '云盘', role: 'neutral', view: 'cloud' },
    { key: 'recent', label: '最近播放', role: 'auto', view: 'recent' },
    { key: 'records', label: '听歌排行', role: 'curated', view: 'records' }
  ];

  /* ------------------------------------------------------------ 摘要 */

  /**
   * 各入口的计数与摘要。取数一律经服务层；「最近播放」是本机历史，不发请求。
   */
  async function summaryOf(entry, uid) {
    try {
      if (entry.key === 'playlists') {
        var r = await M.service.createdPlaylists(uid);
        if (!r.ok) return { text: r.title || '加载失败', err: r };
        var n = (r.data || []).length;
        return { text: n ? n + ' 个歌单' : '还没有歌单' };
      }
      if (entry.key === 'liked') {
        var l = await M.service.likedSongs(uid);
        if (!l.ok) return { text: l.title || '加载失败', err: l };
        var ln = (l.data || []).length;
        return { text: ln ? ln + ' 首红心' : '还没有红心' };
      }
      if (entry.key === 'cloud') {
        var c = await M.service.cloudSongs();
        if (!c.ok) return { text: c.title || '加载失败', err: c };
        var cn = (c.data || []).length;
        return { text: cn ? cn + ' 首' : '云盘是空的' };
      }
      if (entry.key === 'recent') {
        var h = (M.player && M.player.history) ? M.player.history() : [];
        return { text: h.length ? h.length + ' 首 · 这台设备上播过' : '这台设备上还没播过' };
      }
      if (entry.key === 'records') {
        var p = await M.service.playRecords(uid, true);
        if (!p.ok) return { text: p.title || '加载失败', err: p };
        var pn = (p.data || []).length;
        return { text: pn ? '本周 ' + pn + ' 首' : '本周还没有记录' };
      }
    } catch (e) {
      return { text: '加载失败', err: e };
    }
    return { text: '' };
  }

  /* ------------------------------------------------------------ 视图 */

  /**
   * 「我的」的入口列表 —— 页面与底部抽屉**共用**这一份。
   *
   * 为什么共用：同一个入口集合写两遍，迟早会出现「抽屉里有、页面里没有」
   * 这种两个真相。这份函数只管造 DOM，摘要自己异步补。
   *
   * @param {object} [opts] { onPick: 点某一行之前先调（抽屉用来先收起自己）, logout: 末尾加「退出登录」 }
   * @returns {object} { list, rows }
   */
  function buildEntries(opts) {
    opts = opts || {};
    var list = ui.el('ul', { class: 'm-list', role: 'list', 'aria-label': '我的内容' });
    var rows = [];

    ENTRIES.forEach(function (e) {
      // <li> 承担列表语义，<button> 承担可点语义 —— 两者都要有，
      // 否则快照里这个元素拿不到 ref，模型点不了。
      var li = ui.el('li', { class: 'm-list-item', role: 'listitem' });
      var row = ui.el('button', {
        class: 'm-list-row',
        type: 'button',
        'aria-label': e.label
      });
      var dot = ui.el('span', { class: 'm-list-dot', 'aria-hidden': 'true' });
      dot.setAttribute('data-role', e.role);
      row.appendChild(dot);

      var main = ui.el('div', { class: 'm-track-main' });
      main.appendChild(ui.el('div', { class: 'm-track-name' }, e.label));
      var sub = ui.el('div', { class: 'm-track-sub' }, '加载中…');
      main.appendChild(sub);
      row.appendChild(main);

      row.appendChild(ui.el('span', { class: 'm-track-dur', 'aria-hidden': 'true' }, '›'));

      row.addEventListener('click', function () {
        if (typeof opts.onPick === 'function') opts.onPick();
        M.nav({ type: e.view, label: e.label });
      });
      li.appendChild(row);
      list.appendChild(li);
      rows.push({ entry: e, sub: sub });
    });

    // 退出登录：放在最后，与其它入口用不同的角色色区分
    if (opts.logout) {
      var li2 = ui.el('li', { class: 'm-list-item', role: 'listitem' });
      var row2 = ui.el('button', {
        class: 'm-list-row m-list-row-quiet',
        type: 'button',
        'aria-label': '退出登录'
      });
      var dot2 = ui.el('span', { class: 'm-list-dot', 'aria-hidden': 'true' });
      dot2.setAttribute('data-role', 'neutral');
      row2.appendChild(dot2);
      var main2 = ui.el('div', { class: 'm-track-main' });
      main2.appendChild(ui.el('div', { class: 'm-track-name' }, '退出登录'));
      main2.appendChild(ui.el('div', { class: 'm-track-sub' }, '清除本机的登录状态'));
      row2.appendChild(main2);
      row2.appendChild(ui.el('span', { class: 'm-track-dur', 'aria-hidden': 'true' }, '›'));
      row2.addEventListener('click', function () {
        if (typeof opts.onPick === 'function') opts.onPick();
        if (M.actions && M.actions.confirmLogout) M.actions.confirmLogout();
      });
      li2.appendChild(row2);
      list.appendChild(li2);
    }

    // 计数异步补上；取不到就写「加载失败」，不假装有数据。
    //
    // 未登录时**不发那些注定失败的请求**：除了「最近播放」（本机历史，
    // 不需要账号），其余入口一律写「登录后查看」。
    Promise.resolve(M.service.isLoggedIn()).then(function (loggedIn) {
      if (!loggedIn) {
        rows.forEach(function (r) {
          if (!r.sub.isConnected) return;
          if (r.entry.key === 'recent') {
            summaryOf(r.entry, 0).then(function (s) {
              if (r.sub.isConnected) r.sub.textContent = s.text;
            });
            return;
          }
          r.sub.textContent = '登录后查看';
        });
        return;
      }
      return Promise.resolve(M.service.account()).then(function (acc) {
        var uid = (acc && acc.ok && acc.data) ? acc.data.userId : 0;
        rows.forEach(function (r) {
          summaryOf(r.entry, uid).then(function (s) {
            if (!r.sub.isConnected) return;
            r.sub.textContent = s.text;
            if (s.err) r.sub.setAttribute('data-code', s.err.code || '');
          });
        });
      });
    });

    return { list: list, rows: rows };
  }

  M.views.library = {
    title: '我的',
    // 离开后停放：返回时不用重新拉一遍摘要（没有订阅与轮询，放着安全）。
    cacheable: true,

    // **没有 guard**：未登录也照常打开这个页面。
    // 早先这里是「未登录直接拉起扫码」—— 用户要求功能独立于登录流程，
    // 入口不能被登录态挡住；真正取数的那一步才需要账号。
    render: function () {
      var frag = document.createDocumentFragment();
      frag.appendChild(ui.el('h1', { class: 'm-display' }, '我的'));
      frag.appendChild(ui.el('p', { class: 'm-section-note' }, 'yours'));
      frag.appendChild(buildEntries({ logout: true }).list);
      return frag;
    }
  };

  // 抽屉（顶栏入口）也用这份入口集合 —— 同一件事不能有两个真相
  M.mine = { ENTRIES: ENTRIES, buildEntries: buildEntries, summaryOf: summaryOf };
})(window.Mobile = window.Mobile || {});

