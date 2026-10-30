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
    // 顶栏账号区：读一次账号（未登录就是空的）
    if (M.actions && M.actions.refreshAccount) M.actions.refreshAccount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.Mobile = window.Mobile || {});
