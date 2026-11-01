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

  /* ------------------------------------------------------ 页面缓存 */

  /**
   * 离开的页面不销毁：停放在缓存里，回来时**直接还原**。
   *
   * 为什么要有（真机实证）：
   *   不还原的话，返回会重新拉数据 —— 页面先退回骨架屏
   *   （详情页是 4 个大白方块的网格），再慢慢出内容。
   *   用户看到的是「左滑一下冒出来几个白色方块」。
   *
   * 只有**没有生命周期副作用**的页面才进缓存（视图自己声明 cacheable）。
   * 有订阅 / 有轮询的页面（播放页、扫码页）不缓存：还原时不会重新订阅，
   * 页面会僵在那儿不动 —— 那比闪一下骨架屏更糟。
   */
  var keepAlive = new Map();

  /** 视图实例的键：同一个页面重复进要命中同一条缓存。 */
  function viewKey(view) {
    if (!view) return '';
    return [view.type, view.id == null ? '' : view.id, view.name || ''].join('|');
  }

  /** 视图自己说「我可以被缓存」。 */
  function cacheable(view) {
    var def = view && M.views[view.type];
    return !!(def && def.cacheable);
  }

  /** 缓存容器：停放的页面放在这里，**保持 connected** —— */
  /** 请求回来还能回填，图片还能继续加载。 */
  function cacheBox() {
    var box = document.getElementById('m-view-cache');
    if (box) return box;
    var main = document.getElementById('m-main');
    if (!main) return null;
    box = document.createElement('div');
    box.id = 'm-view-cache';
    box.setAttribute('aria-hidden', 'true');
    main.appendChild(box);
    return box;
  }

  /** 停放一个页面。 */
  function park(key, nodes) {
    if (!key || !nodes || !nodes.length) return;
    var box = cacheBox();
    if (!box) return;
    var holder = document.createElement('div');
    holder.className = 'm-page-cache';
    nodes.forEach(function (n) { holder.appendChild(n); });
    box.appendChild(holder);
    keepAlive.set(key, { holder: holder, nodes: nodes });
  }

  /** 取回一个停放的页面（还原用）。调用方负责把节点搬走并清掉 holder。 */
  function unpark(key) {
    var hit = keepAlive.get(key);
    if (!hit) return null;
    keepAlive.delete(key);
    return hit;
  }

  /** 丢掉一条缓存（重建页面时用：旧的已经没用了）。 */
  function dropCache(key) {
    var hit = keepAlive.get(key);
    if (!hit) return;
    keepAlive.delete(key);
    if (hit.holder && hit.holder.parentNode) hit.holder.parentNode.removeChild(hit.holder);
  }

  /**
   * 缓存页面还原后，调用它挂的刷新钩子：**后台**重新拉一遍数据。
   * 页面先显示旧内容，数据到了再就地更新 —— 用户既不看到骨架屏，也不看��过期的。
   */
  function refreshCached(nodes) {
    for (var i = 0; i < (nodes || []).length; i++) {
      var n = nodes[i];
      if (n && typeof n.__refresh === 'function') {
        try { n.__refresh(); } catch (_) { /* 刷新失败不影响已显示的内容 */ }
        return;
      }
    }
  }

  /** 全清（切一级页面时：历史栈被清空，缓存里的页面也回不去了）。 */
  function clearKeepAlive() {
    keepAlive.forEach(function (hit) {
      if (hit.holder && hit.holder.parentNode) hit.holder.parentNode.removeChild(hit.holder);
    });
    keepAlive.clear();
  }

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
   * 但**有缓存的页面必须同步还原**：动画期间页面要是空的（骨架屏 / 未加载的封面块），
   * 用户看到的就是「半成品页面叠在旧页面上」—— 真机录屏里的白方块就是这么来的。
   *
   * 没有缓存时（第一次进这个页面）：先把内容建出来，**等它就绪**再起动画 ——
   * 否则动画期间给用户看的还是骨架屏。最多等 600ms，免得网络慢时卡住。
   *
   * @param {string} direction forward | back | fade
   * @param {function} build 构造新内容的回调
   * @param {object} [opts] { skipGhost, instant, from }
   *   from —— 正在离开的视图；它会被停放进缓存（见上面的「页面缓存」）。
   * @param {object} [cached] 已经取出来的缓存页面（有它就同步还原，不等下一帧）
   */
  function transition(direction, build, opts, cached) {
    opts = opts || {};
    var root = document.getElementById('m-view');
    var main = document.getElementById('m-main');
    if (!root || !main || REDUCED || opts.instant) {
      build();
      return;
    }

    var prev = null;
    // 正在离开的页面的节点（先把它们从 root 里摘出来）
    var leaving = [];
    while (root.firstChild) {
      var node = root.firstChild;
      leaving.push(node);
      root.removeChild(node);
    }
    // 只有「可缓存」的视图才停放；播放页 / 扫码页每次重建
    var parkKey = cacheable(opts.from) ? viewKey(opts.from) : '';

    if (opts.skipGhost) {
      // 旧内容已经处理掉了（手势接管过），别再搬
      root.textContent = '';
      if (parkKey) park(parkKey, leaving);
      // 手势期间「上一层」容器里放着上一页：搬回缓存，别把它连页一起扔了
      rehomePrevHolder();
    } else {
      prev = ghostLayer();
      if (prev) {
        leaving.forEach(function (n) { prev.appendChild(n); });
        prev.classList.add('is-active');
        prev.style.transition = 'none';
        prev.style.transform = 'translate3d(0,0,0)';
        prev.style.opacity = '1';
      }
    }

    // 方向：前进从右边进、返回从左边进。
    // 位移要**够大**才读得出「换页」：26px 的微移看着像「啪」一下跳变，很突兀。
    // 旧页面同时往反方向**视差**挪一点 —— 两层错开，才有「一层压在另一层上」的感觉。
    var enterFrom = '0px';
    var exitTo = '0px';
    if (direction === 'forward') { enterFrom = '38%'; exitTo = '-14%'; }
    else if (direction === 'back') { enterFrom = '-38%'; exitTo = '14%'; }

    // 初始状态（不带过渡），随后由 requestAnimationFrame 启动动画
    root.style.transition = 'none';
    root.style.transform = 'translate3d(' + enterFrom + ',0,0)';
    // **不淡入**。整页做 opacity 动画时，里面那些白卡片会变成半透明的
    // 「白方块」在灰底上飘 —— 真机报的就是这个（见下方 M.slideFollow 的注释）。
    root.style.opacity = '1';
    root.style.willChange = 'transform';

    // 转场期间新页面是一张**不透明的整屏面板**，从右边压过来。
    // 不这样的话它是透明的：旧页面的字会从新页面的字缝里透出来，
    // 两页文字撞在一起 —— 看着特别怪（真机反馈「过渡很奇怪」）。
    root.style.background = 'var(--canvas)';
    root.style.minHeight = (main.clientHeight || 0) + 'px';

    function start() {
      root.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1)';
      root.style.transform = 'translate3d(0,0,0)';

      if (prev) {
        prev.style.willChange = 'transform';
        prev.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1)';
        prev.style.transform = 'translate3d(' + exitTo + ',0,0)';
        // 旧页面**不淡出**：淡出会让里面的白卡片变成半透明的「白方块」，
        // 而且两层一起淡会显得糊。靠视差分层就够了。
        prev.style.opacity = '1';
      }

      if (prev) {
        setTimeout(function () {
          // 旧页面停放进缓存（保持 connected），再清空上一层容器
          if (parkKey) park(parkKey, leaving);
          prev.textContent = '';
          prev.classList.remove('is-active');
          prev.style.transition = '';
          prev.style.transform = '';
          prev.style.opacity = '';
          prev.style.willChange = '';
        }, 340);
      }
      setTimeout(function () {
        root.style.willChange = '';
        root.style.background = '';
        root.style.minHeight = '';
      }, 360);
    }

    // 用户/系统开了「减少动态效果」：不做位移，只给一个很短的交叉淡入。
    // **硬切（直接换页）反而是最突兀的一种** —— 两层一起淡虽然不动位置，但读得懂。
    if (REDUCED) {
      // 少动画：不做位移（把偏移撤掉），只交叉淡入
      root.style.transform = 'translate3d(0,0,0)';
      root.style.willChange = '';
      root.style.background = '';
      root.style.minHeight = '';
      root.style.transition = 'opacity .18s ease';
      root.style.opacity = '0';
      if (prev) {
        prev.style.transition = 'opacity .18s ease';
        prev.style.opacity = '1';
      }
      if (cached && cached.nodes) {
        cached.nodes.forEach(function (n) { root.appendChild(n); });
        if (cached.holder && cached.holder.parentNode) {
          cached.holder.parentNode.removeChild(cached.holder);
        }
        refreshCached(cached.nodes);
      } else {
        try { build(); } catch (e) { setTimeout(function () { throw e; }, 0); }
      }
      nextFrame(function () {
        root.style.opacity = '1';
        if (prev) prev.style.opacity = '0';
        setTimeout(function () {
          if (parkKey) park(parkKey, leaving);
          root.style.transition = '';
          root.style.opacity = '';
          if (prev) {
            prev.textContent = '';
            prev.classList.remove('is-active');
            prev.style.transition = '';
            prev.style.transform = '';
            prev.style.opacity = '';
            prev.style.willChange = '';
          }
        }, 220);
      });
      return;
    }

    // 有缓存：内容已经就绪，**同步还原**后直接起动画（并在后台刷新数据）。
    // 不还原的话动画期间页面是空的（骨架屏 / 没加载出来的封面块），
    // 用户看到的就是「半成品页面叠在旧页面上」—— 真机录屏里的白方块就是这么来的。
    if (cached && cached.nodes) {
      cached.nodes.forEach(function (n) { root.appendChild(n); });
      if (cached.holder && cached.holder.parentNode) {
        cached.holder.parentNode.removeChild(cached.holder);
      }
      refreshCached(cached.nodes);
      nextFrame(start);
      return;
    }

    // 没有缓存（第一次进这个页面）：**立刻起动画**。
    // 不要等数据 —— 等下去点下去就是「卡一下才动」，那才叫突兀。
    // 内容在动画里就地长出来（占位 → 真内容），这是移动端最常见的做法。
    nextFrame(start);
    nextFrame(function () {
      try {
        build();
      } catch (e) {
        setTimeout(function () { throw e; }, 0);
      }
    });
  }

  // 进入下一视图
  M.nav = function (view) {
    if (!view || !view.type) return;
    leaveCurrent();
    var from = M.state.view;
    M.state.history.push(from);
    M.state.view = view;
    M.render({ direction: 'forward', from: from });
  };

  /**
   * 返回上一个视图。
   * @param {object} [opts] { direction: 'back'|'none', skipGhost: 旧内容已处理 }
   */
  M.back = function (opts) {
    opts = opts || {};
    leaveCurrent();
    var from = M.state.view;
    M.state.view = M.state.history.pop() || { type: 'home' };
    M.render({ direction: opts.direction || 'back', skipGhost: opts.skipGhost, from: from });
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
        clearKeepAlive();
        M.render({ direction: 'fade', reuse: false });
      });
      return;
    }

    leaveCurrent();
    M.state.history = [];
    M.state.view = { type: type };
    // 换一级页面：历史栈清空了，缓存里的页面也回不去了 —— 一起清掉
    clearKeepAlive();
    M.render({ direction: 'fade', reuse: false });
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
   * @param {object} [opts] { direction: 'forward'|'back'|'fade'|'none', skipGhost, instant, from, reuse }
   */
  M.render = function (opts) {
    opts = opts || {};
    var view = M.state.view;
    var def = M.views[view.type] || M.views.home;
    var root = document.getElementById('m-view');
    if (!root) return;

    var direction = opts.direction || 'none';

    // 只有**转场**才复用缓存；M.render()（重画当前页）必须重建，
    // 否则「故意换个假服务再重画」这类场景会拿到旧页面。
    var reuse = direction !== 'none' && opts.reuse !== false && cacheable(view);
    var key = cacheable(view) ? viewKey(view) : '';
    var cached = reuse ? unpark(key) : null;
    if (key && !cached) dropCache(key);

    var build = function () {
      if (cached) return;          // 已经在 transition 里同步还原了
      root.textContent = '';
      var content = def.render(view);
      if (content) root.appendChild(content);
    };

    if (direction === 'none') {
      build();
      if (M.shell) M.shell.sync(view, def);
      return;
    }
    // 外壳（标题 / 返回键 / 导航高亮）**立刻**跟上 —— 它不依赖页面内容；
    // 只有重的内容延后一帧，这样点下去马上就有反馈。
    if (M.shell) M.shell.sync(view, def);
    transition(direction, build, opts, cached);
  };

  /** 手势层用：把当前内容整体推到右边（拖到头时的收尾）。 */
  M.slideOutRight = function (done) {
    var root = document.getElementById('m-view');
    if (!root) { if (done) done(); return; }
    root.style.willChange = 'transform';
    root.style.transition = 'transform .22s cubic-bezier(.32,.72,0,1)';
    root.style.transform = 'translate3d(' + (window.innerWidth || 390) + 'px,0,0)';
    // 不淡出：整页淡出时白卡片会变成半透明的白块在灰底上飘
    root.style.opacity = '1';
    setTimeout(function () { if (done) done(); }, 210);
  };

  /** 手势层用：把内容弹回原位（滑得不够）。 */
  M.slideBack = function () {
    var root = document.getElementById('m-view');
    if (!root) return;
    root.style.willChange = 'transform';
    root.style.transition = 'transform .22s cubic-bezier(.32,.72,0,1)';
    root.style.transform = 'translate3d(0,0,0)';
    root.style.opacity = '1';
    // 底下那一页的视差也弹回去
    var prev = document.getElementById('m-view-prev');
    if (prev && prev.classList.contains('is-active')) {
      prev.style.transition = 'transform .22s cubic-bezier(.32,.72,0,1)';
      prev.style.transform = 'translate3d(0,0,0)';
    }
    setTimeout(function () {
      root.style.transition = '';
      root.style.transform = '';
      root.style.opacity = '';
      root.style.willChange = '';
      if (prev) {
        prev.style.transition = '';
        prev.style.transform = '';
      }
    }, 240);
  };

  /**
   * 拖动过程中跟随手指。
   *
   * **只跟位移，不跟透明度。**
   * 以前这里带一点透明度衰减（dx 越大越淡），于是整页的白卡片在灰底上
   * 变成一片半透明的「白色方块」—— 真机报「左滑出现白色方块」就是它。
   */
  M.slideFollow = function (dx) {
    var root = document.getElementById('m-view');
    if (!root) return;
    root.style.willChange = 'transform';
    root.style.transition = 'none';
    root.style.transform = 'translate3d(' + dx + 'px,0,0)';
    root.style.opacity = '1';
    // 底下那一页**慢一点**跟着挪（视差）：两层错开才像「一层滑开另一层」，
    // 一起走就成了整块平移，没有层次感。
    var prev = document.getElementById('m-view-prev');
    if (prev && prev.classList.contains('is-active')) {
      prev.style.transform = 'translate3d(' + (dx * 0.3) + 'px,0,0)';
    }
  };

  /**
   * 手势开始：把**上一页**（如果有缓存）放到「上一层」容器里。
   *
   * 有了它，拖动时底下就是上一页 —— 原生的返回手势就是这个手感：
   * 当前页滑走，上一页原地等着。顺带也解决了「返回时页面先退回骨架屏」。
   */
  M.slidePrepare = function () {
    var target = M.state.history[M.state.history.length - 1];
    if (!target) return false;
    var key = cacheable(target) ? viewKey(target) : '';
    var hit = key ? keepAlive.get(key) : null;
    if (!hit || !hit.holder) return false;
    var prev = ghostLayer();
    if (!prev) return false;
    prev.textContent = '';
    // 整块搬过去（节点不搬家，还原时再搬回来）
    prev.appendChild(hit.holder);
    prev.classList.add('is-active');
    prev.style.transition = 'none';
    prev.style.transform = 'translate3d(0,0,0)';
    prev.style.opacity = '1';
    // 拖动期间当前页面也要是**不透明**的：否则旧页面的字会从它的字缝里透出来
    var root = document.getElementById('m-view');
    var main = document.getElementById('m-main');
    if (root) {
      root.style.background = 'var(--canvas)';
      root.style.minHeight = (main && main.clientHeight ? main.clientHeight : 0) + 'px';
    }
    return true;
  };

  /** 手势结束（没滑够）：把上一页的容器搬回缓存，清空上一层。 */
  M.slideRestorePrev = function () {
    rehomePrevHolder();
    var root = document.getElementById('m-view');
    if (root) {
      root.style.background = '';
      root.style.minHeight = '';
    }
  };

  /** 把「上一层」容器里的东西搬回缓存容器（不销毁）。 */
  function rehomePrevHolder() {
    var prev = document.getElementById('m-view-prev');
    if (!prev) return;
    var holder = prev.firstElementChild;
    if (holder) {
      var box = cacheBox();
      if (box) box.appendChild(holder);
    }
    prev.textContent = '';
    prev.classList.remove('is-active');
    prev.style.transition = '';
    prev.style.transform = '';
    prev.style.opacity = '';
    prev.style.willChange = '';
  }
})(window.Mobile = window.Mobile || {});
