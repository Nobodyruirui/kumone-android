/* =============================================================
 * 移动端渲染层 · 入口
 * -------------------------------------------------------------
 * 加载顺序：内核层（bridge 及其依赖） → 移动端外壳 → 路由 → 视图 → 启动。
 * 上游原版渲染层不参与加载（见 ADR-0001）。
 * ============================================================= */
(function (M) {
  'use strict';

  function boot() {
    M.shell.boot();
    M.applyHash();
    M.render();
    // 边缘左滑返回
    if (M.gesture && M.gesture.attach) M.gesture.attach();
    // 顶栏账号区：读一次账号（未登录就是空的）
    if (M.actions && M.actions.refreshAccount) M.actions.refreshAccount();
  }

  /**
   * 系统返回键（Android 硬件键 / 系统边缘返回手势）走同一条路：
   * 有返回历史就返回上一页，没有就退出 App。
   * @returns {boolean} 是否由界面处理了这次返回
   */
  M.systemBack = function () {
    if (M.state && M.state.history && M.state.history.length) {
      M.back();
      return true;
    }
    // 没有可返回的层级：交回原生去关掉 App
    try {
      var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
      var back = plugins.Back || plugins.KumoneBack;
      if (back && typeof back.exit === 'function') {
        back.exit();
        return false;
      }
    } catch (_) { /* 没有原生桥就退化成什么都不做 */ }
    return false;
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.Mobile = window.Mobile || {});
