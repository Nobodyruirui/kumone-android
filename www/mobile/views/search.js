/* =============================================================
 * 搜索
 * -------------------------------------------------------------
 * 搜索是「输入 → 联想 → 出结果」三段，每段都要能被模型驱动：
 *
 *   输入框   role=textbox，模型可以 act(ref, 'fill', {text}) 写字
 *   搜索按钮 role=button，模型可以 act(ref, 'click')
 *   类型切换 role=button，按 role+name 就能定位
 *
 * 联想里的单曲当作新的搜索词，专辑 / 歌手 / 歌单直接进对应详情
 * （与上游语义一致）。
 * ============================================================= */
(function (M) {
  'use strict';

  var ui = M.ui;

  // 类型：接口 type 值 ↔ 界面文案
  var TYPES = [
    { type: 1, label: '单曲' },
    { type: 10, label: '专辑' },
    { type: 100, label: '歌手' },
    { type: 1000, label: '歌单' }
  ];

  M.views.search = {
    title: '搜索',

    render: function (view) {
      var frag = document.createDocumentFragment();
      frag.appendChild(ui.el('h1', { class: 'm-display' }, '搜索'));
      frag.appendChild(ui.el('p', { class: 'm-section-note' }, 'find anything'));

      // 注意：view.type 是**视图类型**（'search'），不是搜索类型 ——
      // 搜索类型要用自己的字段名 searchType，否则会把 type 传成字符串。
      var keyword = (view && view.keyword) || '';
      var type = (view && view.searchType) || 1;

      /* -------------------------------------------------------- 搜索栏 */

      var bar = ui.el('div', { class: 'm-search-bar' });
      var input = ui.el('input', {
        type: 'search',
        class: 'm-search-input',
        role: 'textbox',
        'aria-label': '搜索关键词',
        placeholder: '搜歌名、歌手、专辑'
      });
      input.value = keyword;

      var goBtn = ui.el('button', {
        class: 'm-btn m-btn-primary',
        type: 'button',
        'aria-label': '搜索'
      }, '搜索');
      bar.appendChild(input);
      bar.appendChild(goBtn);
      frag.appendChild(bar);

      /* ------------------------------------------------------ 联想区 */

      var suggestBox = ui.el('div', { class: 'm-suggest' });
      frag.appendChild(suggestBox);

      /* ------------------------------------------------------ 类型切换 */

      var tabs = ui.el('div', { class: 'm-tabs', role: 'group', 'aria-label': '搜索类型' });
      TYPES.forEach(function (t) {
        var b = ui.el('button', {
          class: 'm-tab-chip' + (t.type === type ? ' current' : ''),
          type: 'button',
          'aria-label': '搜索类型 ' + t.label,
          'aria-current': t.type === type ? 'true' : null
        }, t.label);
        b.addEventListener('click', function () {
          type = t.type;
          Array.prototype.forEach.call(tabs.querySelectorAll('.m-tab-chip'), function (x) {
            x.classList.remove('current');
            x.removeAttribute('aria-current');
          });
          b.classList.add('current');
          b.setAttribute('aria-current', 'true');
          if (keyword) doSearch(keyword);
        });
        tabs.appendChild(b);
      });
      frag.appendChild(tabs);

      /* ------------------------------------------------------ 结果区 */

      var body = ui.el('div', { class: 'm-block-body' });
      frag.appendChild(body);

      /* -------------------------------------------------------- 逻辑 */

      var suggestTimer = null;

      function clearSuggest() {
        suggestBox.textContent = '';
        suggestBox.hidden = true;
      }

      function showSuggest(data) {
        suggestBox.textContent = '';
        var items = [];
        (data.songs || []).slice(0, 5).forEach(function (s) {
          items.push({ kind: '单曲', name: s.name, keyword: s.name });
        });
        (data.artists || []).slice(0, 3).forEach(function (a) {
          items.push({ kind: '歌手', name: a.name, artist: a });
        });
        (data.albums || []).slice(0, 3).forEach(function (a) {
          items.push({ kind: '专辑', name: a.name, album: a });
        });
        (data.playlists || []).slice(0, 3).forEach(function (p) {
          items.push({ kind: '歌单', name: p.name, playlist: p });
        });

        if (!items.length) { clearSuggest(); return; }

        suggestBox.hidden = false;
        var row = ui.el('div', { class: 'm-suggest-row' });
        items.forEach(function (it) {
          var b = ui.el('button', {
            class: 'm-suggest-chip',
            type: 'button',
            'aria-label': it.kind + ' ' + it.name
          });
          b.appendChild(ui.el('span', { class: 'm-suggest-kind' }, it.kind));
          b.appendChild(ui.el('span', { class: 'm-suggest-name' }, it.name));
          b.addEventListener('click', function () {
            if (it.artist) { M.actions.openArtist(it.artist); return; }
            if (it.album) { M.actions.openAlbum(it.album); return; }
            if (it.playlist) { M.actions.openPlaylist(it.playlist); return; }
            input.value = it.keyword;
            doSearch(it.keyword);
          });
          row.appendChild(b);
        });
        suggestBox.appendChild(row);
      }

      function onInput() {
        var kw = (input.value || '').trim();
        if (suggestTimer) clearTimeout(suggestTimer);
        if (!kw) { clearSuggest(); return; }
        suggestTimer = setTimeout(function () {
          Promise.resolve(M.service.searchSuggest(kw)).then(function (r) {
            if (!r || r.ok !== true) { clearSuggest(); return; }
            showSuggest(r.data || {});
          });
        }, 300);
      }

      function doSearch(kw) {
        kw = (kw || '').trim();
        if (!kw) {
          body.textContent = '';
          body.appendChild(ui.emptyNote('输入点什么再搜'));
          return;
        }
        keyword = kw;
        clearSuggest();
        body.textContent = '';
        body.setAttribute('aria-busy', 'true');
        body.appendChild(ui.skeleton(3, '搜索中'));

        Promise.resolve(M.service.search(kw, type, 30, 0)).then(function (r) {
          if (!body.isConnected) return;
          body.setAttribute('aria-busy', 'false');
          body.textContent = '';

          if (!r || r.ok !== true) {
            var err = r || M.errors.make('KUMONE_NETWORK', { cause: '服务层没有返回结果' });
            body.appendChild(ui.errorCard(err, { onRetry: function () { doSearch(kw); } }));
            return;
          }

          var data = r.data || {};
          var counts = data.counts || {};

          if (type === 1) {
            var songs = data.songs || [];
            if (!songs.length) { body.appendChild(ui.emptyNote('没有找到「' + kw + '」')); return; }
            body.appendChild(ui.el('div', { class: 'm-result-note' }, '单曲 ' + (counts.songs || songs.length) + ' 首'));
            var ul = ui.el('ul', { class: 'm-list', role: 'list', 'aria-label': '搜索结果' });
            songs.forEach(function (t, i) {
              ul.appendChild(ui.trackRow({
                track: t,
                index: i,
                onClick: function () { M.actions.playTracks(songs, i); }
              }));
            });
            body.appendChild(ul);
            return;
          }

          if (type === 10) {
            var albums = data.albums || [];
            if (!albums.length) { body.appendChild(ui.emptyNote('没有找到「' + kw + '」')); return; }
            body.appendChild(ui.el('div', { class: 'm-result-note' }, '专辑 ' + (counts.albums || albums.length) + ' 张'));
            body.appendChild(grid(albums, '专辑', function (al) { M.actions.openAlbum(al); }));
            return;
          }

          if (type === 100) {
            var artists = data.artists || [];
            if (!artists.length) { body.appendChild(ui.emptyNote('没有找到「' + kw + '」')); return; }
            body.appendChild(ui.el('div', { class: 'm-result-note' }, '歌手 ' + (counts.artists || artists.length) + ' 位'));
            body.appendChild(grid(artists, '歌手', function (a) { M.actions.openArtist(a); }));
            return;
          }

          var playlists = data.playlists || [];
          if (!playlists.length) { body.appendChild(ui.emptyNote('没有找到「' + kw + '」')); return; }
          body.appendChild(ui.el('div', { class: 'm-result-note' }, '歌单 ' + (counts.playlists || playlists.length) + ' 个'));
          body.appendChild(grid(playlists, '歌单', function (p) { M.actions.openPlaylist(p); }));
        }).catch(function (e) {
          if (!body.isConnected) return;
          body.setAttribute('aria-busy', 'false');
          body.textContent = '';
          body.appendChild(ui.errorCard(M.errors.make('KUMONE_NETWORK', {
            expected: 'await service.search()',
            state: '搜索时抛了异常',
            cause: (e && e.message) || String(e),
            next: '重试一次'
          }), { onRetry: function () { doSearch(kw); } }));
        });
      }

      /** 封面卡网格（专辑 / 歌手 / 歌单共用）。 */
      function grid(list, kind, onClick) {
        var g = ui.el('div', { class: 'm-grid', role: 'list', 'aria-label': '搜索结果' });
        list.forEach(function (item) {
          var li = ui.el('div', { class: 'm-grid-item', role: 'listitem' });
          li.appendChild(ui.tile({
            name: item.name,
            sub: item.artistName || (item.creator && item.creator.nickname) ||
                 (item.alias && item.alias.length ? item.alias[0] : null),
            cover: item.cover || item.pic,
            ariaLabel: kind + ' ' + item.name,
            onClick: function () { onClick(item); }
          }));
          g.appendChild(li);
        });
        return g;
      }

      /* -------------------------------------------------------- 接线 */

      input.addEventListener('input', onInput);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); doSearch(input.value); }
      });
      goBtn.addEventListener('click', function () { doSearch(input.value); });

      // 大家都在搜：默认词做成可点的提示
      Promise.resolve(M.service.searchDefaultKeyword()).then(function (r) {
        if (!r || r.ok !== true || !r.data) return;
        var chip = ui.el('button', {
          class: 'm-suggest-chip',
          type: 'button',
          'aria-label': '热搜 ' + r.data
        });
        chip.appendChild(ui.el('span', { class: 'm-suggest-kind' }, '大家都在搜'));
        chip.appendChild(ui.el('span', { class: 'm-suggest-name' }, r.data));
        chip.addEventListener('click', function () {
          input.value = r.data;
          doSearch(r.data);
        });
        suggestBox.hidden = false;
        suggestBox.appendChild(ui.el('div', { class: 'm-suggest-row' }, chip));
      });

      if (keyword) doSearch(keyword);
      else {
        body.textContent = '';
        body.appendChild(ui.emptyNote('输入点什么再搜'));
      }

      return frag;
    }
  };
})(window.Mobile = window.Mobile || {});
