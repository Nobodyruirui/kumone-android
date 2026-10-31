/* =============================================================
 * 移动端渲染层 · 边缘左滑返回
 * -------------------------------------------------------------
 * 从屏幕左边缘往右滑 = 返回上一级：
 *
 *   1. 跟手 —— 内容跟着手指走，不是「滑一下才动」
 *   2. 判定 —— 滑过阈值（距离或速度）才返回，否则弹回原位
 *   3. 方向 —— 与转场动画同向：返回时上一页从左边进来
 *
 * 边界：
 *   · 没有返回历史时不启用（栈空时返回等于退出 App，那是硬件键的事）
 *   · 全屏播放页不启用（它有自己的「收起」）
 *   · 横向歌单区与滑杆不抢手势
 *
 * 用 touch 事件而不是 pointer 事件：只有非 passive 的 touchmove
 * 才能 preventDefault 掉页面滚动，pointer 事件拦不住滚动。
 * ============================================================= */
(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory(function () { return globalThis.Mobile; });
  } else {
    root.Mobile = root.Mobile || {};
    root.Mobile.gesture = factory(function () { return root.Mobile; });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (getMobile) {
  'use strict';

  /** 边缘触发带宽（px）：从最左边这么多像素内起手才算。 */
  var EDGE = 46;
  /** 判定为「返回」的距离比例（相对屏宽）。 */
  var RATIO = 0.26;
  /** 判定为「返回」的速度（px/ms）。 */
  var VELOCITY = 0.45;
  /** 起手后位移超过这个值才判定方向（小于它算误触）。 */
  var SLOP = 8;

  var drag = null;

  function canGoBack() {
    var M = getMobile();
    return !!(M && M.state && M.state.history && M.state.history.length);
  }

  /** 这些元素上不抢手势：它们自己会滚。 */
  function blocked(target) {
    if (!target || !target.closest) return false;
    if (target.closest('.m-rail')) return true;
    if (target.closest('input[type="range"]')) return true;
    if (target.closest('.m-lyrics')) return true;
    return false;
  }

  function onTouchStart(e) {
    if (!canGoBack()) return;
    if (document.body && document.body.classList.contains('m-np')) return;  // 全屏播放页有自己的收起
    var t = e.touches && e.touches[0];
    if (!t) return;
    if (t.clientX > EDGE) return;
    if (blocked(e.target)) return;
    drag = {
      x0: t.clientX,
      y0: t.clientY,
      dx: 0,
      t0: Date.now(),
      active: false
    };
  }

  function onTouchMove(e) {
    if (!drag) return;
    var M = getMobile();
    var t = e.touches && e.touches[0];
    if (!t) return;
    var dx = t.clientX - drag.x0;
    var dy = t.clientY - drag.y0;

    if (!drag.active) {
      if (Math.abs(dx) < SLOP) return;                      // 位移不够，先攒着
      if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; }  // 纵向手势：交给页面滚动
      drag.active = true;
    }
    if (e.cancelable) e.preventDefault();
    drag.dx = Math.max(0, dx);
    if (M && M.slideFollow) M.slideFollow(drag.dx);
  }

  function onTouchEnd() {
    if (!drag) return;
    var M = getMobile();
    var d = drag;
    drag = null;
    if (!d.active || !M) return;

    var w = (typeof window !== 'undefined' && window.innerWidth) || 390;
    var dt = Math.max(1, Date.now() - d.t0);
    var v = d.dx / dt;

    if (d.dx > w * RATIO || (v > VELOCITY && d.dx > 30)) {
      // 够远了：把当前页推出去，然后换成上一页（从左边进来）
      if (M.slideOutRight) {
        M.slideOutRight(function () {
          if (M.back) M.back({ direction: 'back', skipGhost: true });
        });
      } else if (M.back) {
        M.back({ direction: 'back' });
      }
      return;
    }

    // 不够远：弹回原位
    if (M.slideBack) M.slideBack();
  }

  /** 装上手势。 */
  function attach() {
    var main = document.getElementById('m-main');
    if (!main || main.__kumoneGesture) return;
    main.__kumoneGesture = true;
    main.addEventListener('touchstart', onTouchStart, { passive: true });
    main.addEventListener('touchmove', onTouchMove, { passive: false });
    main.addEventListener('touchend', onTouchEnd, { passive: true });
    main.addEventListener('touchcancel', onTouchEnd, { passive: true });
  }

  /** 摘掉手势（测试与卸载用）。 */
  function detach() {
    var main = document.getElementById('m-main');
    if (!main || !main.__kumoneGesture) return;
    main.__kumoneGesture = false;
    main.removeEventListener('touchstart', onTouchStart);
    main.removeEventListener('touchmove', onTouchMove);
    main.removeEventListener('touchend', onTouchEnd);
    main.removeEventListener('touchcancel', onTouchEnd);
  }

  return {
    attach: attach,
    detach: detach,
    EDGE: EDGE,
    RATIO: RATIO,
    VELOCITY: VELOCITY
  };
});
