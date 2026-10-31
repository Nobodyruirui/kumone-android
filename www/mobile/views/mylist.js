/* =============================================================
 * 资料库的二级列表：我的歌单 / 喜欢的音乐 / 云盘 / 最近播放 / 听歌排行
 * -------------------------------------------------------------
 * 五个列表结构一样：标题 + 一份数据 + 一种呈现，所以共用一份实现，
 * 只是「取数」和「怎么摆」不同。
 *
 *   我的歌单    歌单封面卡（点进歌单详情）
 *   喜欢的音乐  曲目行（可播）
 *   云盘        曲目行（可播）
 *   最近播放    曲目行（可播）—— **本机**播放历史，不发请求
 *   听歌排行    曲目行（带播放次数）—— 服务端按周统计
 *
 * 「最近播放」和「听歌排行」刻意用两套数据源：
 *   前者是这台设备上真正放过的，后者是网易云按周给的排行。
 * ============================================================= */
(function (M) {
  'use strict';

  var ui = M.ui;

  /* ---------------------------------------------------------- 取数 */

  /** 拿当前账号的 uid（我的内容都要它）。 */
  async function currentUid() {
    var r = await M.service.account();
    return (r && r.ok && r.data) ? r.data.userId : 0;
  }

  var LISTS = {
    myplaylists: {
      title: '我的歌单',
      load: async function () {
        var uid = await currentUid();
        var r = await M.service.myPlaylists(uid);
        return r.ok ? { ok: true, data: r.data } : r;
      },
      // 头部动作：新建歌单（建好要把列表刷新一下）
      header: function (reload) {
        var wrap = ui.el('div', { class: 'm-action-row' });
        wrap.appendChild(ui.button('新建歌单', 'primary', function () {
          M.actions.newPlaylist(function () { reload(); });
        }));
        return wrap;
      },
      render: function (list) {
        var grid = ui.el('div', { class: 'm-grid', role: 'list', 'aria-label': '我的歌单' });
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

    favalbums: {
      title: '收藏的专辑',
      load: async function () {
        var r = await M.service.likedAlbums();
        return r.ok ? { ok: true, data: r.data } : r;
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
    },

    liked: {
      title: '喜欢的音乐',
      load: async function () {
        var uid = await currentUid();
        var r = await M.service.likedSongs(uid);
        return r.ok ? { ok: true, data: r.data } : r;
      },
      render: function (tracks) { return trackList(tracks, '喜欢的音乐'); }
    },

    cloud: {
      title: '云盘',
      load: async function () {
        var r = await M.service.cloudSongs();
        return r.ok ? { ok: true, data: r.data } : r;
      },
      render: function (tracks) { return trackList(tracks, '云盘歌曲'); }
    },

    recent: {
      title: '最近播放',
      load: async function () {
        // 本机历史：不用发请求
        var h = (M.player && M.player.history) ? M.player.history() : [];
        return { ok: true, data: h };
      },
      render: function (tracks) { return trackList(tracks, '最近播放'); }
    },

    records: {
      title: '听歌排行',
      load: async function () {
        var uid = await currentUid();
        var r = await M.service.playRecords(uid, true);
        return r.ok ? { ok: true, data: r.data } : r;
      },
      render: function (rows) {
        var tracks = (rows || []).map(function (x) { return x.track; }).filter(Boolean);
        var counts = {};
        (rows || []).forEach(function (x) { if (x.track) counts[x.track.id] = x.playCount || 0; });
        var ul = ui.el('ul', { class: 'm-list', role: 'list', 'aria-label': '本周听歌排行' });
        tracks.forEach(function (t, i) {
          ul.appendChild(ui.trackRow({
            track: t,
            index: i,
            sub: ui.artistNames(t) + (counts[t.id] ? ' · 听了 ' + counts[t.id] + ' 次' : ''),
            onClick: function () { M.actions.playTracks(tracks, i); }
          }));
        });
        return ul;
      }
    }
  };

  /** 曲目列表（可播）。 */
  function trackList(tracks, label) {
    var ul = ui.el('ul', { class: 'm-list', role: 'list', 'aria-label': label });
    tracks.forEach(function (t, i) {
      ul.appendChild(ui.trackRow({
        track: t,
        index: i,
        onClick: function () { M.actions.playTracks(tracks, i); }
      }));
    });
    return ul;
  }

  /* ---------------------------------------------------------- 视图 */

  Object.keys(LISTS).forEach(function (key) {
    var spec = LISTS[key];
    M.views[key] = {
      title: spec.title,
      render: function (view) {
        var frag = document.createDocumentFragment();
        var label = (view && view.label) || spec.title;
        frag.appendChild(ui.el('h1', { class: 'm-display' }, label));
        frag.appendChild(ui.el('p', { class: 'm-section-note' }, spec.title === label ? 'library' : spec.title));

        var body = ui.el('div', { class: 'm-block-body' });
        frag.appendChild(body);
        body.setAttribute('aria-busy', 'true');
        body.appendChild(ui.skeleton(4, '加载中'));

        function retry() {
          body.textContent = '';
          body.setAttribute('aria-busy', 'true');
          body.appendChild(ui.skeleton(4, '加载中'));
          load();
        }

        // 重新拉一次（新建歌单后要刷新列表）
        function reload() {
          retry();
        }

        function load() {
          Promise.resolve(spec.load()).then(function (r) {
            if (!body.isConnected) return;
            body.setAttribute('aria-busy', 'false');
            body.textContent = '';

            // 头部动作（如「新建歌单」）先摆上
            if (spec.header) {
              var h = spec.header(reload);
              if (h) body.appendChild(h);
            }

            if (!r || r.ok !== true) {
              var err = r || M.errors.make('KUMONE_NETWORK', { cause: '服务层没有返回结果' });
              if (ui.LOGIN_CODES[err.code]) {
                body.appendChild(ui.loginCard({
                  note: '这个列表需要登录后才有内容',
                  onLogin: function () { M.actions.toLogin({ view: key }); }
                }));
                return;
              }
              body.appendChild(ui.errorCard(err, { onRetry: retry }));
              return;
            }

            var data = r.data || [];
            if (!data.length) {
              body.appendChild(ui.emptyNote('这里还没有内容'));
              return;
            }
            body.appendChild(spec.render(data));
          }).catch(function (e) {
            if (!body.isConnected) return;
            body.setAttribute('aria-busy', 'false');
            body.textContent = '';
            body.appendChild(ui.errorCard(M.errors.make('KUMONE_NETWORK', {
              expected: 'await ' + key,
              state: '加载列表时抛了异常',
              cause: (e && e.message) || String(e),
              next: '重试一次'
            }), { onRetry: retry }));
          });
        }

        load();
        return frag;
      }
    };
  });
})(window.Mobile = window.Mobile || {});
