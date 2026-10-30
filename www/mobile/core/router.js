/* =============================================================
 * 移动端渲染层 · 路由
 * -------------------------------------------------------------
 * 导航栈语义与上游一致：进入下一视图入栈、返回出栈、栈空回到主页。
 * 视图通过 Mobile.views 注册，键为视图类型。
 * ============================================================= */
(function (M) {
  'use strict';

  M.views = M.views || {};

  M.state = {
    view: { type: 'home' },
    history: []
  };

  /**
   * 离开当前视图时的收尾钩子。
   * 视图可以自己声明 leave()：比如扫码登录页要在离开时停掉轮询。
   */
  function leaveCurrent() {
    var cur = M.state.view;
    if (!cur) return;
    var def = M.views[cur.type];
    if (def && typeof def.leave === 'function') {
      try { def.leave(cur); } catch (_) { /* 收尾失败不阻塞导航 */ }
    }
  }

  // 进入下一视图
  M.nav = function (view) {
    if (!view || !view.type) return;
    leaveCurrent();
    M.state.history.push(M.state.view);
    M.state.view = view;
    M.render();
  };

  // 返回上一个视图
  M.back = function () {
    leaveCurrent();
    M.state.view = M.state.history.pop() || { type: 'home' };
    M.render();
  };

  // 底部导航切根视图：已经在这一页就回到顶部，不重复入栈
  M.goTab = function (type) {
    if (M.state.view.type === type) {
      var main = document.getElementById('m-main');
      if (main) main.scrollTop = 0;
      return;
    }

    // 视图可以声明 guard：它先决定「这个视图现在能不能进」。
    // 返回 false 表示「我已经把你带到别处了」—— 例如资料库在未登录时
    // 直接拉起扫码，而不是渲染一个点不动的入口列表。
    var def = M.views[type];
    if (def && typeof def.guard === 'function') {
      Promise.resolve(def.guard()).then(function (allow) {
        if (!allow) return;
        leaveCurrent();
        M.state.history = [];
        M.state.view = { type: type };
        M.render();
      });
      return;
    }

    leaveCurrent();
    M.state.history = [];
    M.state.view = { type: type };
    M.render();
  };

  // 初始视图：支持 #view 深链，便于直接进入某个页面
  M.applyHash = function () {
    var h = (location.hash || '').replace(/^#/, '');
    if (h && M.views[h]) {
      M.state.view = { type: h };
      M.state.history = [];
    }
  };

  M.render = function () {
    var view = M.state.view;
    var def = M.views[view.type] || M.views.home;
    var root = document.getElementById('m-view');
    if (!root) return;
    root.textContent = '';
    var content = def.render(view);
    if (content) root.appendChild(content);
    if (M.shell) M.shell.sync(view, def);
  };
})(window.Mobile = window.Mobile || {});
