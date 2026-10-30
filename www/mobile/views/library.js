/* =============================================================
 * 资料库：分段入口（播放列表 / 喜欢的音乐 / 云盘 / 最近播放 / 听歌排行）
 * -------------------------------------------------------------
 * 资料库是「我的内容」入口，也是账号区所在。
 *
 * 三条纪律：
 *   1. **未登录时点资料库直接拉起扫码**，而不是渲染一个点不动的入口列表
 *      —— 靠视图的 guard 钩子实现（见 core/router.js 的 goTab）。
 *   2. **角色色不新增**：我的=黄、云盘=灰、最近播放=蓝、听歌排行=橙。
 *      一个颜色只承载一种含义，不要为了「整页统一」把五个点涂成同一个黄。
 *   3. **每个入口都要有摘要**：数据就绪后显示计数，让模型和人都能一眼看到里面有什么。
 * ============================================================= */
(function (M) {
  'use strict';

  var ui = M.ui;

  var ENTRIES = [
    { key: 'playlists', label: '播放列表', role: 'owned', view: 'myplaylists' },
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
        var r = await M.service.myPlaylists(uid);
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

  M.views.library = {
    title: '资料库',

    /**
     * 进入前的闸：未登录就直接拉起扫码登录。
     * 返回 false 表示「这个视图不渲染，我已经把你带到登录页了」。
     */
    guard: function () {
      return Promise.resolve(M.service.isLoggedIn()).then(function (loggedIn) {
        if (loggedIn) return true;
        M.actions.toLogin({ view: 'library' });
        return false;
      });
    },

    render: function () {
      var frag = document.createDocumentFragment();
      frag.appendChild(ui.el('h1', { class: 'm-display' }, '资料库'));
      frag.appendChild(ui.el('p', { class: 'm-section-note' }, 'yours'));

      var list = ui.el('ul', { class: 'm-list', role: 'list', 'aria-label': '资料库入口' });
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
          M.nav({ type: e.view, label: e.label });
        });
        li.appendChild(row);
        list.appendChild(li);
        rows.push({ entry: e, sub: sub });
      });

      frag.appendChild(list);

      // 计数异步补上；取不到就写「加载失败」，不假装有数据
      Promise.resolve(M.service.account()).then(function (acc) {
        var uid = (acc && acc.ok && acc.data) ? acc.data.userId : 0;
        rows.forEach(function (r) {
          summaryOf(r.entry, uid).then(function (s) {
            if (!r.sub.isConnected) return;
            r.sub.textContent = s.text;
            if (s.err) r.sub.setAttribute('data-code', s.err.code || '');
          });
        });
      });

      return frag;
    }
  };
})(window.Mobile = window.Mobile || {});
