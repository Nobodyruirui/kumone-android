/* =============================================================
 * 详情页：歌单 / 歌手 / 专辑
 * -------------------------------------------------------------
 * 这三个页面结构一样：一个大标题卡（封面 + 名字 + 几条元信息）
 * ＋一个曲目列表。所以它们共用一份实现，只是取数与副标题不同。
 *
 * 从主页点进来必须有落点（ticket 08），
 * 完整的内容运营留给后续 ticket（这里先保证能进、能看、能播）。
 * ============================================================= */
(function (M) {
  'use strict';

  var ui = M.ui;

  /* ---------------------------------------------------------- 取数 */

  var SOURCES = {
    playlist: {
      load: function (id) { return M.service.playlistDetail(id); },
      hero: function (d) {
        var pl = d.playlist || {};
        return {
          cover: pl.cover,
          name: pl.name || '歌单',
          lines: [
            pl.creator && pl.creator.nickname ? 'by ' + pl.creator.nickname : null,
            pl.trackCount ? pl.trackCount + ' 首' : null,
            pl.playCount ? ui.formatCount(pl.playCount) + '次播放' : null
          ].filter(Boolean)
        };
      },
      tracks: function (d) { return d.tracks || []; }
    },
    artist: {
      load: function (id) { return M.service.artist(id); },
      hero: function (d) {
        var a = d.artist || {};
        return {
          cover: a.pic,
          name: a.name || '歌手',
          lines: [
            a.alias && a.alias.length ? a.alias[0] : null,
            a.albumSize ? a.albumSize + ' 张专辑' : null,
            a.musicSize ? a.musicSize + ' 首作品' : null
          ].filter(Boolean)
        };
      },
      tracks: function (d) { return d.hotSongs || []; }
    },
    album: {
      load: function (id) { return M.service.album(id); },
      hero: function (d) {
        var al = d.album || {};
        return {
          cover: al.pic,
          name: al.name || '专辑',
          lines: [
            al.artistName || null,
            al.size ? al.size + ' 首' : null,
            al.publishTime ? String(al.publishTime).slice(0, 4) : null
          ].filter(Boolean)
        };
      },
      tracks: function (d) { return d.songs || []; }
    }
  };

  /* ---------------------------------------------------------- 渲染 */

  function heroCard(hero) {
    var card = ui.el('div', { class: 'm-card m-hero', role: 'group', 'aria-label': hero.name });
    var img = ui.el('img', { class: 'm-hero-cover', alt: hero.name + ' 封面' });
    if (hero.cover) img.setAttribute('src', hero.cover);
    card.appendChild(img);
    var info = ui.el('div', { class: 'm-hero-info' });
    info.appendChild(ui.el('div', { class: 'm-hero-name' }, hero.name));
    (hero.lines || []).forEach(function (line) {
      info.appendChild(ui.el('div', { class: 'm-tile-sub' }, line));
    });
    card.appendChild(info);
    return card;
  }

  function build(type, view) {
    var src = SOURCES[type];
    var frag = document.createDocumentFragment();
    var body = ui.el('div', { class: 'm-block-body' });

    frag.appendChild(ui.el('h1', { class: 'm-display' }, view.name || '详情'));
    frag.appendChild(body);

    body.setAttribute('aria-busy', 'true');
    body.appendChild(ui.skeleton(4, '加载中'));

    function retry() {
      body.textContent = '';
      body.setAttribute('aria-busy', 'true');
      body.appendChild(ui.skeleton(4, '加载中'));
      load();
    }

    function load() {
      Promise.resolve(src.load(view.id)).then(function (r) {
        if (!body.isConnected) return;
        body.setAttribute('aria-busy', 'false');
        body.textContent = '';

        if (!r || r.ok !== true) {
          var err = r || M.errors.make('KUMONE_NETWORK', { cause: '服务层没有返回结果' });
          if (ui.LOGIN_CODES[err.code]) {
            body.appendChild(ui.loginCard({
              note: '这个页面需要登录后才有内容',
              onLogin: function () { M.actions.toLogin({ channel: type, args: { id: view.id } }); }
            }));
            return;
          }
          body.appendChild(ui.errorCard(err, { onRetry: retry }));
          return;
        }

        var hero = src.hero(r.data || {});
        body.appendChild(heroCard(hero));

        var tracks = src.tracks(r.data || {});
        if (!tracks.length) {
          body.appendChild(ui.emptyNote('这个列表暂时没有内容'));
          return;
        }

        var list = ui.el('ul', { class: 'm-list', role: 'list', 'aria-label': '曲目列表' });
        tracks.forEach(function (t, i) {
          list.appendChild(ui.trackRow({
            track: t,
            index: i,
            onClick: function () { M.actions.playTracks(tracks, i); }
          }));
        });
        body.appendChild(list);
      }).catch(function (e) {
        if (!body.isConnected) return;
        body.setAttribute('aria-busy', 'false');
        body.textContent = '';
        body.appendChild(ui.errorCard(M.errors.make('KUMONE_NETWORK', {
          expected: 'await ' + type,
          state: '加载详情时抛了异常',
          cause: (e && e.message) || String(e),
          next: '重试一次'
        }), { onRetry: retry }));
      });
    }

    load();
    return frag;
  }

  /* ---------------------------------------------------------- 注册 */

  Object.keys(SOURCES).forEach(function (type) {
    M.views[type] = {
      title: function (view) { return (view && view.name) || '详情'; },
      render: function (view) { return build(type, view || {}); }
    };
  });
})(window.Mobile = window.Mobile || {});
