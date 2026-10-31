/* =============================================================
 * 登录视图
 * -------------------------------------------------------------
 * 登录是一个**中断**：从主页的每日推荐、资料库的入口、播放请求中间
 * 都会把用户拉到这里；登录成功后必须把人送回原处。
 *
 * 两种登录方式放在**一个视图的两个 Tab** 里：
 *   账号登录（默认）—— 手机号 + 密码
 *   扫码登录（备选）—— 网易云音乐 App 扫一下
 *
 * 纪律：
 *   1. 密码只在这一次请求里出现：不落盘、不写日志、不进错误消息。
 *   2. 失败按**错误码**分支，不按文案分支。
 *   3. 扫码那套状态机（core/login.js）原样保留，只降级成备选 Tab。
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
    // 送回原处：被打断的目标优先（资料库会带 resume:{view:'library'}），
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
      frag.appendChild(ui.el('p', { class: 'm-section-note' }, '账号密码或扫码，二选一'));

      /* ---------------------------------------------- Tab 切换 */

      var tabs = ui.el('div', { class: 'm-tabs', role: 'tablist', 'aria-label': '登录方式' });
      var tabAccount = ui.el('button', {
        class: 'm-tab-btn',
        type: 'button',
        role: 'tab',
        'aria-label': '账号登录',
        'aria-selected': 'true'
      }, '账号登录');
      var tabScan = ui.el('button', {
        class: 'm-tab-btn',
        type: 'button',
        role: 'tab',
        'aria-label': '扫码登录',
        'aria-selected': 'false'
      }, '扫码登录');
      tabs.appendChild(tabAccount);
      tabs.appendChild(tabScan);
      frag.appendChild(tabs);

      var panel = ui.el('div', { class: 'm-login-panel' });
      frag.appendChild(panel);

      var current = 'account';

      function select(which) {
        current = which;
        tabAccount.setAttribute('aria-selected', which === 'account' ? 'true' : 'false');
        tabScan.setAttribute('aria-selected', which === 'scan' ? 'true' : 'false');
        tabAccount.classList.toggle('is-active', which === 'account');
        tabScan.classList.toggle('is-active', which === 'scan');
        panel.textContent = '';
        if (which === 'account') paintAccount();
        else paintScan();
      }

      tabAccount.addEventListener('click', function () { select('account'); });
      tabScan.addEventListener('click', function () { select('scan'); });

      /* ---------------------------------------------- 账号登录 */

      function paintAccount() {
        var body = ui.el('div', { class: 'm-block-body' });
        panel.appendChild(body);

        var phone = ui.el('input', {
          class: 'm-field',
          type: 'tel',
          inputmode: 'numeric',
          autocomplete: 'username',
          placeholder: '手机号',
          'aria-label': '手机号'
        });
        var pwd = ui.el('input', {
          class: 'm-field',
          type: 'password',
          autocomplete: 'current-password',
          placeholder: '密码',
          'aria-label': '密码'
        });
        body.appendChild(phone);
        body.appendChild(pwd);

        body.appendChild(ui.el('p', { class: 'm-login-note' },
          '密码只用于这一次登录，不会被保存'));

        var actions = ui.el('div', { class: 'm-err-actions' });
        var submit = ui.el('button', {
          class: 'm-btn m-btn-primary',
          type: 'button',
          'aria-label': '登录'
        }, '登录');
        actions.appendChild(submit);
        body.appendChild(actions);

        var status = ui.el('div', { class: 'm-login-status' });
        body.appendChild(status);

        function fail(err) {
          status.textContent = '';
          body.appendChild(ui.errorCard(err, null));
        }

        function run() {
          var ph = String(phone.value || '').trim();
          var pw = String(pwd.value || '');
          if (!ph || !pw) {
            fail(M.errors.make('KUMONE_LOGIN_FAILED', {
              expected: 'await service.loginByPassword(phone, password)',
              state: '手机号或密码还没填',
              cause: ph ? '密码是空的' : '手机号是空的',
              next: '把手机号与密码都填上再点登录'
            }));
            return;
          }

          submit.disabled = true;
          status.textContent = '正在登录…';
          Promise.resolve(M.service.loginByPassword(ph, pw)).then(function (r) {
            submit.disabled = false;
            if (r && r.ok === true) {
              status.textContent = '登录成功';
              // 密码用完即弃：不留在内存里的表单里
              pwd.value = '';
              setTimeout(function () { onLoggedIn(view); }, 400);
              return;
            }
            status.textContent = '';
            fail(r || M.errors.make('KUMONE_LOGIN_FAILED', {
              expected: 'await service.loginByPassword(phone, password)',
              state: '没有拿到结果',
              cause: '未知原因',
              next: '重试，或改用扫码登录'
            }));
          });
        }

        submit.addEventListener('click', run);
        pwd.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') run();
        });
        phone.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { pwd.focus(); }
        });
      }

      /* ---------------------------------------------- 扫码登录 */

      function paintScan() {
        var body = ui.el('div', { class: 'm-block-body' });
        panel.appendChild(body);

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
            setTimeout(function () { onLoggedIn(view); }, 600);
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
        stopTimer();
        timer = setInterval(function () {
          if (!body.isConnected) { stopTimer(); return; }
          machine.tick();
        }, 2000);
      }

      select('account');

      return frag;
    },
    leave: function () { stopTimer(); }
  };
})(window.Mobile = window.Mobile || {});
