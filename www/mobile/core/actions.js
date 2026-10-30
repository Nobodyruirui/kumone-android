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

  M.actions = {
    openPlaylist: openPlaylist,
    openArtist: openArtist,
    openAlbum: openAlbum,
    toLogin: toLogin,
    playTracks: playTracks,
    refreshAccount: refreshAccount,
    confirmLogout: confirmLogout
  };
})(window.Mobile = window.Mobile || {});
