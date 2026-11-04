/* =============================================================
 * 收藏：一级功能（与主页 / 广播 / 搜索并列）
 * -------------------------------------------------------------
 * 「收藏」是**独立的一级功能**，不是「登录之后才能进的子页面」。
 *
 * 独立在哪：
 *   1. 入口独立 —— 底部导航第四键，任何时候都能点开；
 *   2. 流程独立 —— 未登录时**不把人踢去登录页**：页面照常打开，
 *      每个分区给「登录后查看」+「去登录」，登录完**原地回来**。
 *
 * 这里放两件收藏：
 *   收藏的歌单   —— 我订阅的别人的歌单（网易云 /user/playlist 里 subscribed=true 的那些）
 *   收藏的专辑   —— 网易云的「我喜欢的专辑」
 *
 * 「我创建的歌单」不在这里 —— 那是云端资产，留在顶栏左上角的「我的」里。
 * ============================================================= */
(function (M) {
  'use strict';

  var ui = M.ui;

  /** 两个分区：标题 + 取数 + 呈现。 */
  var SECTIONS = [
    {
      key: 'playlists',
      title: '收藏的歌单',
      note: 'favourites',
      load: async function () {
        var acc = await M.service.account();
        var uid = (acc && acc.ok && acc.data) ? acc.data.userId : 0;
        return M.service.favoritePlaylists(uid);
      },
      render: function (list) {
        var grid = ui.el('div', { class: 'm-grid', role: 'list', 'aria-label': '收藏的歌单' });
        list.forEach(function (pl) {
          var li = ui.el('div', { class: 'm-grid-item', role: 'listitem' });
          li.appendChild(ui.tile({
            name: pl.name,
            sub: pl.creator ? pl.creator.nickname : null,
            cover: pl.cover,
            ariaLabel: '歌单 ' + pl.name,
            onClick: function () { M.actions.openPlaylist(pl); }
          }));
          grid.appendChild(li);
        });
        return grid;
      }
    },
    {
      key: 'albums',
      title: '收藏的专辑',
      note: 'albums you kept',
      load: async function () {
        return M.service.favoriteAlbums();
      },
      render: function (list) {
        var grid = ui.el('div', { class: 'm-grid', role: 'list', 'aria-label': '收藏的专辑' });
        list.forEach(function (al) {
          var li = ui.el('div', { class: 'm-grid-item', role: 'listitem' });
          li.appendChild(ui.tile({
            name: al.name,
            sub: al.artistName || null,
            cover: al.pic,
            ariaLabel: '专辑 ' + al.name,
            onClick: function () { M.actions.openAlbum(al); }
          }));
          grid.appendChild(li);
        });
        return grid;
      }
    }
  ];

  /** 造一个分区（含标题、加载态、错误态、空态）。 */
  function section(spec) {
    var sec = ui.el('section', { class: 'm-section', role: 'region', 'aria-label': spec.title });
    sec.appendChild(ui.el('h2', { class: 'm-section-title' }, spec.title));
    sec.appendChild(ui.el('p', { class: 'm-section-note' }, spec.note));
    var body = ui.el('div', { class: 'm-block-body' });
    sec.appendChild(body);
    return { sec: sec, body: body };
  }

  M.views.favorites = {
    title: '收藏',
    // 离开后停放：返回时不用重新拉一遍（没有订阅与轮询）。
    cacheable: true,

    render: function () {
      var frag = document.createDocumentFragment();
      frag.appendChild(ui.el('h1', { class: 'm-display' }, '收藏'));
      frag.appendChild(ui.el('p', { class: 'm-section-note' }, 'saved by you'));

      // **分区骨架同步搭好**：render 返回的 fragment 会被立刻插进 DOM，
      // 之后再往 fragment 里 append 的节点全都进不了页面
      // （早先这里把 appendChild 放在 isLoggedIn 的 then 里 → 两个分区根本没渲染出来）。
      var shells = SECTIONS.map(function (spec) {
        var s = section(spec);
        frag.appendChild(s.sec);
        return s;
      });

      // 再问一次登录态：没登录就把两个分区都画成「登录后查看」，
      // **不发那些注定失败的请求**（也不把人踢去登录页）。
      Promise.resolve(M.service.isLoggedIn()).then(function (loggedIn) {
        shells.forEach(function (s, i) { paint(s, SECTIONS[i], loggedIn); });
      });

      return frag;
    }
  };

  /**
   * 画一个分区的内容。
   * @param {object} s section() 的返回（s.body 是内容槽）
   * @param {object} spec 分区定义
   * @param {boolean} loggedIn
   */
  function paint(s, spec, loggedIn) {
    var what = spec.key === 'playlists' ? '歌单' : '专辑';

    if (!loggedIn) {
      s.body.appendChild(ui.loginCard({
        note: '登录后能看到你收藏的' + what,
        onLogin: function () { M.actions.toLogin({ view: 'favorites' }); }
      }));
      return;
    }

    s.body.setAttribute('aria-busy', 'true');
    s.body.appendChild(ui.skeleton(2, '加载收藏的' + what));
    Promise.resolve(spec.load()).then(function (r) {
      if (!s.body.isConnected) return;
      s.body.textContent = '';
      s.body.setAttribute('aria-busy', 'false');
      if (!r || r.ok !== true) {
        var err = r || M.errors.make('KUMONE_NETWORK', { cause: '没有拿到结果' });
        if (ui.LOGIN_CODES[err.code]) {
          s.body.appendChild(ui.loginCard({
            note: '登录后能看到你收藏的' + what,
            onLogin: function () { M.actions.toLogin({ view: 'favorites' }); }
          }));
          return;
        }
        s.body.appendChild(ui.errorCard(err, {
          onRetry: function () { M.render({ direction: 'none' }); }
        }));
        return;
      }
      var list = r.data || [];
      if (!list.length) {
        s.body.appendChild(ui.emptyNote('还没有收藏' + what));
        return;
      }
      s.body.appendChild(spec.render(list));
    });
  }
})(window.Mobile = window.Mobile || {});
