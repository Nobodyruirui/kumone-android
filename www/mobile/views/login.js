/* =============================================================
 * 登录视图：**只保留扫码登录**
 * -------------------------------------------------------------
 * 登录是**中断**：从主页的每日推荐、「收藏」、资料库的入口、播放请求中间
 * 都会把用户拉到这里；登录成功后必须把人送回原处。
 *
 * **为什么只有扫码**（2026-11-04 决定，见 docs/adr/0005-只保留扫码登录.md）：
 *   网易云现在只活着 `/login/cellphone` 这一条密码通道（邮箱端点已 404），
 *   而密码登录会反复踩风控 —— 服务端回 `509 密码错误超过限制`，
 *   一次输错就可能把账号锁一阵子。扫码则完全不需要把密码交给本 App。
 *
 * 纪律：
 *   1. 密码这条路径整条移除：界面、服务层、内核门面都没有账号/密码输入框。
 *   2. 扫码状态机（core/login.js）原样保留，它本来就是为扫码写的。
 *   3. 登录成功后按 resume 送回被打断的地方。
 * ============================================================= */
(function (M) {
  'use strict';

  var ui = M.ui;
  var timer = null;

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  /** 登录成功后的收尾：刷新账号区，并回到被打断的地方。 */
  function onLoggedIn(view) {
    if (M.shell) M.shell.toast('登录成功');
    if (M.actions && M.actions.refreshAccount) M.actions.refreshAccount();
    // 送回原处：被打断的目标优先（「收藏」会带 resume:{view:'favorites'}），
    // 没有目标才退回栈里那个视图
    var resume = (view && view.resume) || null;
    if (resume && resume.view) {
      M.state.history = [];
      M.state.view = { type: resume.view };
      M.render();
    } else {
      M.back();
    }
  }

  M.views.login = {
    title: '登录',
    render: function (view) {
      stopTimer();

      var frag = document.createDocumentFragment();
      frag.appendChild(ui.el('h1', { class: 'm-display' }, '登录'));
      frag.appendChild(ui.el('p', { class: 'm-section-note' }, '用网易云音乐 App 扫码登录'));

      var panel = ui.el('div', { class: 'm-login-panel' });
      frag.appendChild(panel);

      // 先问一次登录态：已登录就显示「当前账号 + 退出登录」，
      // 别让用户对着一个已登录的账号再扫一次码。
      Promise.resolve(M.service.isLoggedIn()).then(function (loggedIn) {
        if (!panel.isConnected) return;
        panel.textContent = '';
        if (loggedIn) paintSignedIn(panel);
        else paintScan(panel);
      });

      return frag;
    },
    leave: function () { stopTimer(); }
  };

  /* ---------------------------------------------- 已登录：账号 + 退出 */

  function paintSignedIn(body) {
    Promise.resolve(M.service.account()).then(function (r) {
      if (!body.isConnected) return;
      var acc = (r && r.ok && r.data) ? r.data : null;
      var who = acc && acc.nickname ? acc.nickname : '当前账号';

      var card = ui.el('div', { class: 'm-card m-login-card', role: 'group', 'aria-label': '当前账号' });
      card.appendChild(ui.el('div', { class: 'm-login-ok' }, '已登录：' + who));
      card.appendChild(ui.el('div', { class: 'm-login-note' },
        '退出登录只清除本机缓存的登录状态'));
      body.appendChild(card);

      var actions = ui.el('div', { class: 'm-err-actions' });
      actions.appendChild(ui.button('退出登录', '', function () {
        if (M.actions && M.actions.confirmLogout) M.actions.confirmLogout();
      }));
      actions.appendChild(ui.button('切换账号', 'primary', function () {
        Promise.resolve(M.service.logout()).then(function () {
          if (M.actions && M.actions.refreshAccount) M.actions.refreshAccount();
          if (!body.isConnected) return;
          body.textContent = '';
          // 换账号 = 退出后重新扫码
          paintScan(body);
        });
      }));
      body.appendChild(actions);
    });
  }

  /* ---------------------------------------------- 扫码登录 */

  function paintScan(body) {
    var machine = M.loginMachine.createMachine({
      service: M.service,
      onChange: function (snap) { paint(snap); }
    });

    function paint(snap) {
      if (!body.isConnected) return;
      body.textContent = '';

      if (snap.phase === 'fetching' || snap.phase === 'idle') {
        body.appendChild(ui.skeleton(1, '正在获取二维码'));
        body.appendChild(ui.el('p', { class: 'm-login-status' }, snap.label));
        return;
      }

      if (snap.phase === 'error') {
        var err = snap.error || M.errors.make('KUMONE_NETWORK', {
          expected: 'await service.qrKey()',
          state: '取二维码失败',
          cause: snap.message || '未知原因',
          next: '检查网络后重试'
        });
        body.appendChild(ui.errorCard(err, {
          onRetry: function () { machine.refresh(); }
        }));
        return;
      }

      if (snap.phase === 'success') {
        body.appendChild(ui.el('div', { class: 'm-login-status m-login-ok' }, '登录成功'));
        Promise.resolve(M.service.account()).then(function (acc) {
          if (!acc || acc.ok !== true) return;
          if (acc.data && acc.data.nickname) {
            body.appendChild(ui.el('div', { class: 'm-login-account' },
              '已登录：' + acc.data.nickname));
          }
        });
        setTimeout(function () { onLoggedIn(M.state.view); }, 600);
        return;
      }

      // waiting / scanned / expired：二维码 + 状态
      var box = ui.el('div', { class: 'm-login-qr' });
      if (snap.image) {
        var img = ui.el('img', { class: 'm-login-code', alt: '登录二维码' });
        img.setAttribute('src', snap.image);
        if (snap.phase === 'expired') img.setAttribute('aria-disabled', 'true');
        box.appendChild(img);
      }
      body.appendChild(box);

      body.appendChild(ui.el('div', { class: 'm-login-status' }, snap.label));
      // 服务端常常把同一句话再回一遍（801 就带 message「等待扫码」）——
      // 跟标签一样就别重复显示，否则页面上会出现两个「等待扫码」。
      if (snap.message && snap.message !== snap.label) {
        body.appendChild(ui.el('div', { class: 'm-login-note' }, snap.message));
      }

      if (snap.phase === 'expired') {
        var actions = ui.el('div', { class: 'm-err-actions' });
        actions.appendChild(ui.button('刷新二维码', 'primary', function () { machine.refresh(); }));
        body.appendChild(actions);
      }
    }

    machine.start();

    // 轮询：只在这个视图活着的时候转
    stopTimer();
    timer = setInterval(function () {
      if (!body.isConnected) { stopTimer(); return; }
      machine.tick();
    }, 2000);
  }
})(window.Mobile = window.Mobile || {});
