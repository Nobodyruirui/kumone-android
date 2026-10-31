/* =============================================================
 * 移动端渲染层 · 路由
 * -------------------------------------------------------------
 * 导航栈语义与上游一致：进入下一视图入栈、返回出栈、栈空回到主页。
 * 视图通过 Mobile.views 注册，键为视图类型。
 *
 * 转场（这一层负责，视图不碰）：
 *   前进 —— 新页面从右边进来，旧页面往左淡出
 *   返回 —— 旧页面往右出去，上一页从左边进来
 *   两者方向相反，手感一致；用户拖边缘时由手势层接管。
 * ============================================================= */
(function (M) {
  'use strict';

  M.views = M.views || {};

  M.state = {
    view: { type: 'home' },
    history: []
  };

  // 用户在系统里开了「减弱动效」就别做转场
  var REDUCED = false;
  try {
    REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (_) { REDUCED = false; }

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

  /* ------------------------------------------------------------ 转场 */

  /** 上一层容器：转场时旧内容搬到这里。 */
  function ghostLayer() {
    var prev = document.getElementById('m-view-prev');
    if (prev) return prev;
    var main = document.getElementById('m-main');
    if (!main) return null;
    prev = document.createElement('div');
    prev.id = 'm-view-prev';
    prev.setAttribute('aria-hidden', 'true');
    main.appendChild(prev);
    return prev;
  }

  /**
   * 「下一帧」—— 但**不只靠 requestAnimationFrame**。
   *
   * 为什么：rAF 在 WebView 被节流（切后台、无头环境、某些省电模式）时**不触发**，
   * 一旦转场把「构建新内容」押在 rAF 上，页面就会永远停在空白。
   * 所以两个都挂上，谁先来算谁的。
   */
  function nextFrame(fn) {
    var done = false;
    function once() {
      if (done) return;
      done = true;
      fn();
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(once);
    setTimeout(once, 24);
  }

  /**
   * 做一次转场：旧内容交给上一层，新内容按方向滑进来。
   *
   * 时序是关键：**动画先起、内容下一帧再填**。
   * 早先是把新页面同步建好再开始动画 —— 页面越重（歌单 100 首）第一帧越卡，
   * 用户看到的就是「顿一下才动」。
   *
   * @param {string} direction forward | back | fade
   * @param {function} build 构造新内容的回调
   * @param {object} [opts] { skipGhost: 旧内容已经处理掉了，别再搬 }
   */
  function transition(direction, build, opts) {
    opts = opts || {};
    var root = document.getElementById('m-view');
    var main = document.getElementById('m-main');
    if (!root || !main || REDUCED || opts.instant) {
      build();
      return;
    }

    var prev = null;
    if (opts.skipGhost) {
      root.textContent = '';
    } else {
      prev = ghostLayer();
      if (prev) {
        while (root.firstChild) prev.appendChild(root.firstChild);
        prev.classList.add('is-active');
        prev.style.transition = 'none';
        prev.style.transform = 'translate3d(0,0,0)';
        prev.style.opacity = '1';
      }
    }

    // 方向：前进从右边进、返回从左边进；旧页面各自往反方向走
    var enterFrom = '0px';
    var exitTo = '0px';
    if (direction === 'forward') { enterFrom = '26px'; exitTo = '-14px'; }
    else if (direction === 'back') { enterFrom = '-26px'; exitTo = '26px'; }

    // 初始状态（不带过渡），随后由 requestAnimationFrame 启动动画
    root.style.transition = 'none';
    root.style.transform = 'translate3d(' + enterFrom + ',0,0)';
    root.style.opacity = '0';
    root.style.willChange = 'transform, opacity';

    function start() {
      root.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1), opacity .24s ease';
      root.style.transform = 'translate3d(0,0,0)';
      root.style.opacity = '1';

      if (prev) {
        prev.style.willChange = 'transform, opacity';
        prev.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1), opacity .24s ease';
        prev.style.transform = 'translate3d(' + exitTo + ',0,0)';
        prev.style.opacity = '0';
      }

      // 内容下一帧填：动画已经在跑了，DOM 构建与图片解码不再拖住第一帧
      nextFrame(function () {
        try {
          build();
        } catch (e) {
          // 别把错误吞掉：转场照常结束，但错误要冒出来（否则界面就是一片空白，没线索）
          setTimeout(function () { throw e; }, 0);
        }
        if (prev) {
          setTimeout(function () {
            prev.textContent = '';
            prev.classList.remove('is-active');
            prev.style.transition = '';
            prev.style.transform = '';
            prev.style.opacity = '';
            prev.style.willChange = '';
          }, 340);
        }
        setTimeout(function () { root.style.willChange = ''; }, 360);
      });
    }

    nextFrame(start);
  }

  // 进入下一视图
  M.nav = function (view) {
    if (!view || !view.type) return;
    leaveCurrent();
    M.state.history.push(M.state.view);
    M.state.view = view;
    M.render({ direction: 'forward' });
  };

  /**
   * 返回上一个视图。
   * @param {object} [opts] { direction: 'back'|'none', skipGhost: 旧内容已处理 }
   */
  M.back = function (opts) {
    opts = opts || {};
    leaveCurrent();
    M.state.view = M.state.history.pop() || { type: 'home' };
    M.render({ direction: opts.direction || 'back', skipGhost: opts.skipGhost });
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
        M.render({ direction: 'fade' });
      });
      return;
    }

    leaveCurrent();
    M.state.history = [];
    M.state.view = { type: type };
    M.render({ direction: 'fade' });
  };

  // 初始视图：支持 #view 深链，便于直接进入某个页面
  M.applyHash = function () {
    var h = (location.hash || '').replace(/^#/, '');
    if (h && M.views[h]) {
      M.state.view = { type: h };
      M.state.history = [];
    }
  };

  /**
   * 渲染当前视图。
   * @param {object} [opts] { direction: 'forward'|'back'|'fade'|'none', skipGhost, instant }
   */
  M.render = function (opts) {
    opts = opts || {};
    var view = M.state.view;
    var def = M.views[view.type] || M.views.home;
    var root = document.getElementById('m-view');
    if (!root) return;

    var build = function () {
      root.textContent = '';
      var content = def.render(view);
      if (content) root.appendChild(content);
    };

    var direction = opts.direction || 'none';
    if (direction === 'none') {
      build();
      if (M.shell) M.shell.sync(view, def);
      return;
    }
    // 外壳（标题 / 返回键 / 导航高亮）**立刻**跟上 —— 它不依赖页面内容；
    // 只有重的内容延后一帧，这样点下去马上就有反馈。
    if (M.shell) M.shell.sync(view, def);
    transition(direction, build, opts);
  };

  /** 手势层用：把当前内容整体推到右边并淡出（拖到头时的收尾）。 */
  M.slideOutRight = function (done) {
    var root = document.getElementById('m-view');
    if (!root) { if (done) done(); return; }
    root.style.willChange = 'transform, opacity';
    root.style.transition = 'transform .22s cubic-bezier(.32,.72,0,1), opacity .18s ease';
    root.style.transform = 'translate3d(' + (window.innerWidth || 390) + 'px,0,0)';
    root.style.opacity = '0';
    setTimeout(function () { if (done) done(); }, 210);
  };

  /** 手势层用：把内容弹回原位（滑得不够）。 */
  M.slideBack = function () {
    var root = document.getElementById('m-view');
    if (!root) return;
    root.style.willChange = 'transform, opacity';
    root.style.transition = 'transform .22s cubic-bezier(.32,.72,0,1), opacity .18s ease';
    root.style.transform = 'translate3d(0,0,0)';
    root.style.opacity = '1';
    setTimeout(function () {
      root.style.transition = '';
      root.style.transform = '';
      root.style.opacity = '';
      root.style.willChange = '';
    }, 240);
  };

  /** 拖动过程中跟随手指。 */
  M.slideFollow = function (dx) {
    var root = document.getElementById('m-view');
    if (!root) return;
    root.style.willChange = 'transform';
    root.style.transition = 'none';
    root.style.transform = 'translate3d(' + dx + 'px,0,0)';
    root.style.opacity = String(Math.max(0.5, 1 - dx / 700));
  };
})(window.Mobile = window.Mobile || {});
