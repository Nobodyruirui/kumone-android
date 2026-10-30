/* =============================================================
 * 主页：每日推荐 → 推荐歌单 → 排行榜 → 推荐歌手 → 新碟上架
 * -------------------------------------------------------------
 * 主页的难点不是样式，是**状态机**：每个区块都有五种态
 *
 *   loading  骨架占位（数据还在路上）
 *   data     有内容
 *   empty    接口通了但没东西
 *   error    失败了，按错误码给不同动作
 *   login    需要登录，给扫码引导
 *
 * 五种态是**分区块**的，不是整页的：排行榜、推荐歌手、新碟上架
 * 匿名也能看，所以未登录时不能做成"整页登录引导"。
 *
 * 数据一律经服务层（ticket 04），视图不碰网易云接口。
 * ============================================================= */
(function (M) {
  'use strict';

  var ui = M.ui;

  /* ---------------------------------------------------------- 区块表 */

  var BLOCKS = [
    { key: 'daily', title: '每日推荐', note: 'curated for you today', role: 'curated' },
    { key: 'playlists', title: '推荐歌单', note: 'playlists we picked', role: 'curated' },
    { key: 'toplist', title: '排行榜', note: 'charts', role: 'curated' },
    { key: 'artists', title: '推荐歌手', note: 'artists', role: 'curated' },
    { key: 'albums', title: '新碟上架', note: 'new releases', role: 'curated' }
  ];

  /* ------------------------------------------------------------ 动作 */

  // 打开歌单 / 歌手 / 专辑、扫码登录、播放 —— 都在 actions.js 里，
  // 主页只是调用方（详情页也调同一套，避免同一个动作两种行为）。

  /* -------------------------------------------------------- 各区块的渲染 */

  /** 每日推荐：第一首是大卡，其余是曲目行。 */
  function renderDaily(tracks) {
    var wrap = ui.el('div', { class: 'm-stack' });
    var first = tracks[0];

    var big = ui.el('button', {
      class: 'm-card m-big',
      type: 'button',
      'aria-label': '播放 ' + first.name + ' · ' + ui.artistNames(first)
    });
    var img = ui.el('img', { class: 'm-big-cover', alt: first.name + ' 封面' });
    if (first.album && first.album.picUrl) img.setAttribute('src', first.album.picUrl);
    big.appendChild(img);
    var info = ui.el('div', { class: 'm-big-info' });
    info.appendChild(ui.el('div', { class: 'm-big-name' }, first.name));
    var sub = ui.artistNames(first);
    if (sub) info.appendChild(ui.el('div', { class: 'm-tile-sub' }, sub));
    info.appendChild(ui.el('div', { class: 'm-tile-sub' }, '每日第一首 · ' + ui.formatDuration(first.durationMS)));
    big.appendChild(info);
    big.addEventListener('click', function () { M.actions.playTracks(tracks, 0); });
    wrap.appendChild(big);

    var list = ui.el('ul', { class: 'm-list', role: 'list', 'aria-label': '每日推荐曲目' });
    var rest = tracks.slice(1);
    // 首屏只摆 10 首：ego 的做法是"块要能一眼扫完"，30 首会把后面四个区块推到天边
    var shown = rest.slice(0, 9);
    shown.forEach(function (t, i) {
      list.appendChild(ui.trackRow({
        track: t,
        index: i + 1,
        onClick: function () { M.actions.playTracks(tracks, i + 1); }
      }));
    });
    wrap.appendChild(list);

    if (rest.length > shown.length) {
      wrap.appendChild(ui.el('div', { class: 'm-more' },
        '还有 ' + (rest.length - shown.length) + ' 首，往下是完整推荐'));
    }
    return wrap;
  }

  /** 推荐歌单：横向可滑动的封面卡。 */
  function renderPlaylists(list) {
    var rail = ui.el('div', { class: 'm-rail', role: 'list', 'aria-label': '推荐歌单' });
    list.forEach(function (pl) {
      var li = ui.el('li', { class: 'm-rail-item', role: 'listitem' });
      li.appendChild(ui.tile({
        name: pl.name,
        sub: pl.creator ? pl.creator.nickname : null,
        cover: pl.cover,
        ariaLabel: '歌单 ' + pl.name,
        onClick: function () { M.actions.openPlaylist(pl); }
      }));
      rail.appendChild(li);
    });
    return rail;
  }

  /** 排行榜：名次 + 歌单。 */
  function renderToplist(list) {
    var ul = ui.el('ul', { class: 'm-list', role: 'list', 'aria-label': '排行榜' });
    // 和每日推荐同一个道理：榜单有二十多个，首屏摆十个就够扫了
    var shown = list.slice(0, 10);
    shown.forEach(function (pl, i) {
      ul.appendChild(ui.rankRow({
        rank: i + 1,
        name: pl.name,
        sub: ui.formatCount(pl.playCount) + '次播放',
        onClick: function () { M.actions.openPlaylist(pl); }
      }));
    });
    var wrap = ui.el('div', { class: 'm-stack' });
    wrap.appendChild(ul);
    if (list.length > shown.length) {
      wrap.appendChild(ui.el('div', { class: 'm-more' },
        '还有 ' + (list.length - shown.length) + ' 个榜单'));
    }
    return wrap;
  }

  /** 推荐歌手：两列网格。 */
  function renderArtists(list) {
    var grid = ui.el('div', { class: 'm-grid', role: 'list', 'aria-label': '推荐歌手' });
    list.forEach(function (a) {
      var li = ui.el('div', { class: 'm-grid-item', role: 'listitem' });
      li.appendChild(ui.tile({
        name: a.name,
        sub: a.alias && a.alias.length ? a.alias[0] : null,
        cover: a.pic,
        ariaLabel: '歌手 ' + a.name,
        onClick: function () { M.actions.openArtist(a); }
      }));
      grid.appendChild(li);
    });
    return grid;
  }

  /** 新碟上架：两列网格。 */
  function renderAlbums(list) {
    var grid = ui.el('div', { class: 'm-grid', role: 'list', 'aria-label': '新碟上架' });
    list.forEach(function (al) {
      var li = ui.el('div', { class: 'm-grid-item', role: 'listitem' });
      li.appendChild(ui.tile({
        name: al.name,
        sub: al.artistName,
        cover: al.pic,
        ariaLabel: '专辑 ' + al.name,
        onClick: function () { M.actions.openAlbum(al); }
      }));
      grid.appendChild(li);
    });
    return grid;
  }

  /* -------------------------------------------------- 区块的加载与渲染 */

  var LOADERS = {
    daily: function () { return M.service.dailyRecommend(); },
    playlists: function () { return M.service.recommendedPlaylists(12); },
    toplist: function () { return M.service.toplists(); },
    artists: function () { return M.service.topArtists(12); },
    albums: function () { return M.service.newAlbums(12); }
  };

  var RENDERERS = {
    daily: renderDaily,
    playlists: renderPlaylists,
    toplist: renderToplist,
    artists: renderArtists,
    albums: renderAlbums
  };

  /**
   * 跑一个区块：骨架 → 数据 / 空态 / 错误态 / 登录引导。
   * 每个区块自己管自己，失败不牵连别人。
   */
  function runBlock(spec, body, loggedIn) {
    var loader = LOADERS[spec.key];
    var renderer = RENDERERS[spec.key];
    var resume = { channel: spec.key, args: {} };

    body.textContent = '';
    body.setAttribute('aria-busy', 'true');
    body.appendChild(spec.key === 'playlists' ? ui.skeletonRail(4, spec.title) : ui.skeleton(4, spec.title));

    Promise.resolve()
      .then(loader)
      .then(function (r) {
        // 视图可能已经被切走（区块节点脱离文档）—— 这时不要再写。
        if (!body.isConnected) return;

        body.setAttribute('aria-busy', 'false');
        // 骨架必须被**替换**掉，不是叠在它上面
        body.textContent = '';

        if (!r || r.ok !== true) {
          var err = r || M.errors.make('KUMONE_NETWORK', { cause: '服务层没有返回结果' });
          // 需要登录 → 给扫码引导，不给"重试"（重试多少次都没用）
          if (ui.LOGIN_CODES[err.code]) {
            body.appendChild(ui.loginCard({
              note: spec.title + '需要登录后才有内容',
              onLogin: function () { M.actions.toLogin(resume); }
            }));
            return;
          }
          body.appendChild(ui.errorCard(err, {
            onRetry: function () { runBlock(spec, body, loggedIn); }
          }));
          return;
        }

        var data = r.data || [];
        if (!data.length) {
          body.appendChild(ui.emptyNote('「' + spec.title + '」暂时没有内容'));
          return;
        }

        body.appendChild(renderer(data));

        // 未登录时，匿名也能拿到的东西给出"登录看更多"的提示
        if (!loggedIn && spec.key === 'playlists') {
          var hint = ui.el('div', { class: 'm-login-hint' });
          hint.appendChild(ui.el('span', { class: 'm-login-hint-text' }, '登录后能看到更多推荐'));
          hint.appendChild(ui.button('去登录', 'ghost', function () { M.actions.toLogin(resume); }));
          body.appendChild(hint);
        }
      })
      .catch(function (e) {
        if (!body.isConnected) return;
        body.setAttribute('aria-busy', 'false');
        body.textContent = '';
        body.appendChild(ui.errorCard(M.errors.make('KUMONE_NETWORK', {
          expected: 'await ' + spec.key,
          state: '区块加载时抛了异常',
          cause: (e && e.message) || String(e),
          next: '重试一次'
        }), {
          onRetry: function () { runBlock(spec, body, loggedIn); }
        }));
      });
  }

  /* ------------------------------------------------------------ 视图 */

  M.views.home = {
    title: '主页',
    render: function () {
      var frag = document.createDocumentFragment();
      frag.appendChild(ui.el('h1', { class: 'm-display' }, '主页'));
      frag.appendChild(ui.el('p', { class: 'm-section-note' }, 'discover'));

      var blocks = {};
      BLOCKS.forEach(function (spec) {
        var b = ui.section(spec);
        blocks[spec.key] = b;
        frag.appendChild(b.sec);
      });

      // 先问一次登录态：决定要不要给"登录看更多"的提示
      Promise.resolve(M.service.isLoggedIn()).then(function (loggedIn) {
        BLOCKS.forEach(function (spec) {
          runBlock(spec, blocks[spec.key].body, !!loggedIn);
        });
      }).catch(function () {
        BLOCKS.forEach(function (spec) {
          runBlock(spec, blocks[spec.key].body, false);
        });
      });

      return frag;
    }
  };
})(window.Mobile = window.Mobile || {});
