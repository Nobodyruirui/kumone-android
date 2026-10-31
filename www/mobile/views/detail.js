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
      tracks: function (d) { return d.tracks || []; },
      // 歌单可以很长：多出来的部分按 id 批量取
      more: function (d) { return { ids: d.trackIds || [], total: d.total || 0 }; }
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
    var img = ui.cover({ url: hero.cover, alt: hero.name + ' 封面', className: 'm-hero-cover', size: 400, eager: true });
    card.appendChild(img);
    var info = ui.el('div', { class: 'm-hero-info' });
    info.appendChild(ui.el('div', { class: 'm-hero-name' }, hero.name));
    (hero.lines || []).forEach(function (line) {
      info.appendChild(ui.el('div', { class: 'm-tile-sub' }, line));
    });
    card.appendChild(info);
    return card;
  }

  /**
   * 专辑页的「收藏」按钮。
   * 初始状态靠「收藏的专辑」列表判断 —— 与其猜，不如读一次真相。
   */
  function albumFavRow(albumId) {
    var wrap = ui.el('div', { class: 'm-action-row' });
    var btn = ui.el('button', {
      class: 'm-btn',
      type: 'button',
      'aria-label': '收藏专辑',
      'aria-pressed': 'false'
    }, '收藏专辑');
    var fav = false;

    function paint() {
      btn.textContent = fav ? '已收藏' : '收藏专辑';
      btn.setAttribute('aria-pressed', fav ? 'true' : 'false');
      btn.classList.toggle('is-on', fav);
    }

    btn.addEventListener('click', function () {
      btn.disabled = true;
      var want = !fav;
      Promise.resolve(M.service.subscribeAlbum(albumId, want)).then(function (r) {
        btn.disabled = false;
        if (!r || r.ok !== true) {
          if (M.shell) M.shell.toast((r && r.title) || '操作失败');
          return;
        }
        fav = want;
        paint();
        if (M.shell) M.shell.toast(fav ? '已收藏专辑' : '已取消收藏');
      });
    });

    // 初始状态
    Promise.resolve(M.service.likedAlbums ? M.service.likedAlbums() : null).then(function (r) {
      if (!r || r.ok !== true) return;
      fav = (r.data || []).some(function (a) { return a.id === albumId; });
      paint();
    });

    wrap.appendChild(btn);
    paint();
    return wrap;
  }

  function build(type, view) {    var src = SOURCES[type];
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

        // 专辑页：收藏 / 取消收藏
        if (type === 'album' && view.id) {
          body.appendChild(albumFavRow(view.id));
        }

        var tracks = src.tracks(r.data || {});
        if (!tracks.length) {
          body.appendChild(ui.emptyNote('这个列表暂时没有内容'));
          return;
        }

        // 首屏 50 首；歌单更长时给「加载更多」
        var PAGE = 50;
        var more = src.more ? src.more(r.data || {}) : null;
        var pool = tracks.slice();
        var ids = (more && more.ids) || [];
        var shown = Math.min(PAGE, pool.length);

        var list = ui.el('ul', { class: 'm-list', role: 'list', 'aria-label': '曲目列表' });
        body.appendChild(list);

        var moreWrap = ui.el('div', { class: 'm-more-wrap' });
        body.appendChild(moreWrap);

        function paintList() {
          list.textContent = '';
          pool.slice(0, shown).forEach(function (t, i) {
            list.appendChild(ui.trackRow({
              track: t,
              index: i,
              onClick: function () { M.actions.playTracks(pool.slice(0, shown), i); },
              onAdd: function (track) { M.actions.addToPlaylist(track); }
            }));
          });
          moreWrap.textContent = '';
          var hasMore = shown < pool.length || (ids.length > shown);
          if (!hasMore) return;
          var btn = ui.button('加载更多', '', function () {
            btn.disabled = true;
            btn.textContent = '加载中…';
            // 先用已经拿到的，没了再按 id 去取
            var next = pool.slice(shown, shown + PAGE);
            if (next.length) {
              pool = pool.concat(next);
              shown = pool.length;
              paintList();
              return;
            }
            var need = ids.slice(shown, shown + PAGE);
            if (!need.length) { paintList(); return; }
            Promise.resolve(M.service.songDetails ? M.service.songDetails(need) : null)
              .then(function (r) {
                if (!r || r.ok !== true) throw r || new Error('加载失败');
                pool = pool.concat(r.data || []);
                shown = pool.length;
                paintList();
              })
              .catch(function (e) {
                btn.disabled = false;
                btn.textContent = '重试加载';
                moreWrap.appendChild(ui.errorCard(
                  M.errors.make('KUMONE_NETWORK', {
                    expected: 'await service.songDetails(ids)',
                    state: '加载更多曲目失败',
                    cause: (e && (e.message || e.code)) || String(e),
                    next: '点重试再试一次'
                  }), { onRetry: function () { btn.click(); } }));
              });
          });
          moreWrap.appendChild(btn);
        }

        paintList();
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
