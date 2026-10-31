/* =============================================================
 * 移动端渲染层 · 跨视图动作
 * -------------------------------------------------------------
 * 有些动作会在好几个视图里出现（打开歌单、播放一首歌、扫码登录），
 * 各写一份就会变成"同一个动作两种行为"。这里收敛一处。
 *
 * 这一层只做**编排**：把「导航到某个视图」「把曲目推进播放引擎」
 * 「拉起扫码」三件事统一下来。取数不在这里做。
 * ============================================================= */
(function (M) {
  'use strict';

  /** 打开歌单详情。 */
  function openPlaylist(pl) {
    if (!pl || !pl.id) return;
    M.nav({ type: 'playlist', id: pl.id, name: pl.name || '歌单' });
  }

  /** 打开歌手详情。 */
  function openArtist(a) {
    if (!a || !a.id) return;
    M.nav({ type: 'artist', id: a.id, name: a.name || '歌手' });
  }

  /** 打开专辑详情。 */
  function openAlbum(al) {
    if (!al || !al.id) return;
    M.nav({ type: 'album', id: al.id, name: al.name || '专辑' });
  }

  /**
   * 拉起扫码登录。
   * @param {object} [resume] 被中断的目标：登录成功后要重放的东西
   *        { view: 'library' } 表示「登录完直接去资料库」
   */
  function toLogin(resume) {
    M.nav({ type: 'login', resume: resume || null });
  }

  /**
   * 读账号并写进顶栏账号区。
   * 未登录时传 null，顶栏那一格会清空 —— 不显示假账号。
   *
   * 竞态防护：账号请求是异步的，慢的那次可能晚于新的那次返回。
   * 所以只有**最后发起的**那次能写界面，否则会出现「登录后账号区自己消失了」。
   */
  var accountToken = 0;
  async function refreshAccount() {
    var mine = ++accountToken;
    var r = await M.service.account();
    if (mine !== accountToken) return M.account;   // 有更新的请求在跑，这次结果作废
    var acc = (r && r.ok) ? r.data : null;
    M.account = acc;
    if (M.shell && M.shell.setAccount) M.shell.setAccount(acc);
    return acc;
  }

  /**
   * 退出登录：先问一句，确认后清内核登录态（localStorage 的 MUSIC_U），
   * 再回到未登录态（顶栏账号区清空、界面回到主页）。
   */
  async function confirmLogout() {
    var ok = false;
    if (M.shell && M.shell.confirm) {
      ok = await M.shell.confirm({
        title: '退出登录',
        text: '退出后会清除本机缓存的登录状态，下次查看「我的」内容需要重新扫码。',
        okText: '退出登录',
        cancelText: '再想想'
      });
    }
    if (!ok) return false;

    await M.service.logout();
    await refreshAccount();
    M.state.history = [];
    M.state.view = { type: 'home' };
    M.render();
    if (M.shell && M.shell.toast) M.shell.toast('已退出登录');
    return true;
  }

  /**
   * 播放一组曲目（从第 index 首开始）。
   * 播放失败把契约错误摊成吐司 —— 失败要看得见，不能静默。
   */
  function playTracks(tracks, index) {
    if (!M.player || !tracks || !tracks.length) return Promise.resolve(null);
    return Promise.resolve(M.player.playQueue(tracks, index || 0)).then(function (snap) {
      if (snap && snap.error && M.shell) {
        M.shell.toast(snap.error.title + '：' + (snap.error.next || '换一首试试'));
      }
      return snap;
    });
  }

  /* --------------------------------------------------------- 加入歌单 */

  /** 拿当前账号的 uid（我的歌单要它）。 */
  async function currentUid() {
    var r = await M.service.account();
    return (r && r.ok && r.data) ? r.data.userId : 0;
  }

  /**
   * 「加入歌单」面板：从底部滑上来，列出现有歌单，也能直接新建。
   * 不切页面 —— 用户的上下文（正在看的歌单 / 正在听的歌）不丢。
   *
   * @param {object} track 要加入的曲目（归一化后的）
   */
  function addToPlaylist(track) {
    if (!track || !track.id) return;
    var ui = M.ui;
    var panel = ui.sheet({ title: '加入歌单' });
    panel.setBody(ui.skeleton(2, '加载歌单'));

    currentUid()
      .then(function (uid) { return M.service.myPlaylists(uid); })
      .then(function (r) {
        if (!r || r.ok !== true) {
          panel.setBody(ui.errorCard(r || M.errors.make('KUMONE_NETWORK', {
            cause: '没有拿到歌单列表'
          })));
          return null;
        }
        var list = r.data || [];
        var box = ui.el('div', { class: 'm-sheet-list', role: 'list', 'aria-label': '我的歌单' });

        list.forEach(function (pl) {
          var item = ui.el('button', {
            class: 'm-sheet-item',
            type: 'button',
            'aria-label': '加入歌单 · ' + pl.name
          });
          item.appendChild(ui.cover({
            url: pl.cover, alt: '', className: 'm-sheet-cover', size: 96
          }));
          item.appendChild(ui.el('span', { class: 'm-sheet-item-name' }, pl.name));
          item.addEventListener('click', function () {
            doAdd(pl, track, panel);
          });
          box.appendChild(item);
        });

        // 新建歌单：名字 + 直接加进去
        var create = ui.el('div', { class: 'm-sheet-create' });
        var input = ui.el('input', {
          class: 'm-field',
          type: 'text',
          placeholder: '新歌单名字',
          'aria-label': '新歌单名字'
        });
        var createBtn = ui.button('新建并加入', 'primary', function () {
          var name = String(input.value || '').trim();
          if (!name) {
            if (M.shell) M.shell.toast('先给歌单起个名字');
            input.focus();
            return;
          }
          createBtn.disabled = true;
          createBtn.textContent = '创建中…';
          Promise.resolve(M.service.createPlaylist(name)).then(function (r2) {
            if (!r2 || r2.ok !== true) {
              createBtn.disabled = false;
              createBtn.textContent = '新建并加入';
              if (M.shell) M.shell.toast((r2 && r2.title) || '建歌单失败');
              return;
            }
            doAdd(r2.data, track, panel);
          });
        });
        create.appendChild(input);
        create.appendChild(createBtn);
        box.appendChild(create);

        panel.setBody(box);
        return list;
      })
      .catch(function (e) {
        panel.setBody(ui.errorCard(M.errors.make('KUMONE_NETWORK', {
          expected: 'await service.myPlaylists(uid)',
          state: '拉歌单列表时抛了异常',
          cause: (e && e.message) || String(e),
          next: '关掉面板重试'
        })));
      });
  }

  /** 真的加进去：成功给吐司，失败给错误卡（面板不关，让人能重试）。 */
  function doAdd(pl, track, panel) {
    if (!pl || !pl.id) return;
    Promise.resolve(M.service.addToPlaylist(pl.id, [track.id])).then(function (r) {
      if (!r || r.ok !== true) {
        if (M.shell) M.shell.toast((r && r.title) || '加入失败');
        return;
      }
      if (M.shell) M.shell.toast('已加入《' + (pl.name || '歌单') + '》');
      if (panel) panel.close();
    });
  }

  /**
   * 新建歌单（资料库「我的歌单」页用）。
   * @param {function} [onDone] 建好之后的回调（用来刷新列表）
   */
  function newPlaylist(onDone) {
    var ui = M.ui;
    var panel = ui.sheet({ title: '新建歌单' });
    var box = ui.el('div', { class: 'm-sheet-create' });
    var input = ui.el('input', {
      class: 'm-field',
      type: 'text',
      placeholder: '歌单名字',
      'aria-label': '歌单名字'
    });
    var ok = ui.button('新建', 'primary', function () {
      var name = String(input.value || '').trim();
      if (!name) {
        if (M.shell) M.shell.toast('先给歌单起个名字');
        input.focus();
        return;
      }
      ok.disabled = true;
      ok.textContent = '创建中…';
      Promise.resolve(M.service.createPlaylist(name)).then(function (r) {
        ok.disabled = false;
        ok.textContent = '新建';
        if (!r || r.ok !== true) {
          if (M.shell) M.shell.toast((r && r.title) || '建歌单失败');
          return;
        }
        panel.close();
        if (M.shell) M.shell.toast('已新建《' + name + '》');
        if (typeof onDone === 'function') onDone(r.data);
      });
    });
    box.appendChild(input);
    box.appendChild(ok);
    panel.setBody(box);
    setTimeout(function () { try { input.focus(); } catch (_) {} }, 120);
  }

  M.actions = {
    openPlaylist: openPlaylist,
    openArtist: openArtist,
    openAlbum: openAlbum,
    toLogin: toLogin,
    playTracks: playTracks,
    refreshAccount: refreshAccount,
    confirmLogout: confirmLogout,
    addToPlaylist: addToPlaylist,
    newPlaylist: newPlaylist
  };
})(window.Mobile = window.Mobile || {});
