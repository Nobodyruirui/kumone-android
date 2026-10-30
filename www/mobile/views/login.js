/* =============================================================
 * 扫码登录视图
 * -------------------------------------------------------------
 * 登录是一个**中断**：从主页的每日推荐、资料库的入口、播放请求中间
 * 都会把用户拉到这里；登录成功后必须把人送回原处。
 *
 * 状态机在 core/login.js（纯逻辑，可 Node 自测），
 * 这一层只负责把状态画出来、把用户动作递回去。
 * ============================================================= */
(function (M) {
  'use strict';

  var ui = M.ui;
  var timer = null;

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  M.views.login = {
    title: '扫码登录',
    render: function (view) {
      stopTimer();

      var frag = document.createDocumentFragment();
      frag.appendChild(ui.el('h1', { class: 'm-display' }, '扫码登录'));
      frag.appendChild(ui.el('p', { class: 'm-section-note' }, '用网易云音乐 App 扫一下'));

      var body = ui.el('div', { class: 'm-block-body' });
      frag.appendChild(body);

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
          // 送回原处：被打断的目标优先（资料库会带 resume:{view:'library'}），
          // 没有目标才退回栈里那个视图
          setTimeout(function () {
            if (M.shell) M.shell.toast('登录成功');
            if (M.actions && M.actions.refreshAccount) M.actions.refreshAccount();
            var resume = (view && view.resume) || null;
            if (resume && resume.view) {
              M.state.history = [];
              M.state.view = { type: resume.view };
              M.render();
            } else {
              M.back();
            }
          }, 600);
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
        if (snap.message) {
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
      timer = setInterval(function () {
        if (!body.isConnected) { stopTimer(); return; }
        machine.tick();
      }, 2000);

      return frag;
    },
    leave: function () { stopTimer(); }
  };
})(window.Mobile = window.Mobile || {});
