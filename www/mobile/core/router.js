/* 移动路由：浏览历史持有页面实例，转场只借用页面做展示。 */
(function (M) {
  'use strict';

  M.views = M.views || {};
  M.state = { view: { type: 'home' }, history: [] };

  // 同类型的两次搜索可以有不同的查询和滚动位置，按栈中的实例保存。
  var pages = new Map();
  var motion = null;
  var navVersion = 0;

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function moveContents(from, to) {
    while (from.firstChild) to.appendChild(from.firstChild);
  }

  function cacheBox() {
    var box = document.getElementById('m-view-cache');
    if (!box) {
      box = document.createElement('div');
      box.id = 'm-view-cache';
      box.hidden = true;
      box.inert = true;
      box.setAttribute('aria-hidden', 'true');
      document.getElementById('m-main').appendChild(box);
    }
    return box;
  }

  function leaveCurrent() {
    var view = M.state.view;
    var def = M.views[view.type];
    if (def && def.leave) def.leave(view);
  }

  // 顶栏吸附在滚动容器内。记录内容相对可见区域的偏移，预览上一页时才不会跳回顶端。
  function capture(view, root, main) {
    var header = document.getElementById('m-header');
    var top = Math.max(main.getBoundingClientRect().top, header ? header.getBoundingClientRect().bottom : 0);
    var page = {
      view: view,
      holder: document.createElement('div'),
      scroll: main.scrollTop,
      top: top,
      contentTop: root.getBoundingClientRect().top - top
    };
    page.holder.style.padding = getComputedStyle(root).padding;
    moveContents(root, page.holder);
    cacheBox().appendChild(page.holder);
    if (M.views[view.type] && M.views[view.type].cacheable && M.state.history.includes(view)) {
      pages.set(view, page);
    }
    return page;
  }

  function refresh(root) {
    for (var i = 0; i < root.children.length; i++) {
      if (root.children[i].__refresh) {
        root.children[i].__refresh();
        break;
      }
    }
  }

  function release(page) {
    if (pages.get(page.view) === page) cacheBox().appendChild(page.holder);
    else page.holder.remove();
  }

  function stopMotion() {
    var active = motion;
    if (!active) return;
    motion = null;
    clearTimeout(active.timer);
    if (active.animation) active.animation.cancel();
    active.root.classList.remove('m-moving');
    active.root.style.removeProperty('--m-motion-height');
    active.root.style.transform = '';
    if (active.layer) {
      active.layer.classList.remove('is-active', 'is-front');
      active.page.holder.style.transform = '';
      release(active.page);
    }
  }

  function showLayer(root, page, front) {
    var layer = document.getElementById('m-view-prev');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'm-view-prev';
      layer.inert = true;
      layer.setAttribute('aria-hidden', 'true');
      document.getElementById('m-main').appendChild(layer);
    }
    layer.classList.toggle('is-front', front);
    layer.style.top = page.top + 'px';
    page.holder.style.transform = 'translateY(' + page.contentTop + 'px)';
    layer.appendChild(page.holder);
    layer.classList.add('is-active');
    root.classList.add('m-moving');
    motion = { root: root, layer: layer, page: page, dx: 0 };
    return motion;
  }

  function slide(element, axis, from, to, duration, done) {
    var active = motion;
    function finish() {
      if (motion !== active) return;
      stopMotion();
      if (done) done();
    }
    if (reducedMotion() || !element.animate || from === to) {
      finish();
      return;
    }
    var frames = [from, to].map(function (value) {
      return { transform: 'translate' + axis + '(' + value + 'px)' };
    });
    active.animation = element.animate(frames, {
      duration: duration, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both'
    });
    active.animation.onfinish = finish;
    // WebView 进入后台时可能不派发 finish；下一次导航也会同步回收这层。
    active.timer = setTimeout(finish, duration + 60);
  }

  M.render = function (opts) {
    opts = opts || {};
    var root = document.getElementById('m-view');
    var main = document.getElementById('m-main');
    if (!root || !main) return;
    stopMotion();
    var view = M.state.view;
    var def = M.views[view.type] || M.views.home;
    var from = opts.from;
    var direction = opts.direction || 'none';
    var leaving = from ? capture(from, root, main) : null;
    var cached = opts.reuse !== false && pages.get(view);
    if (cached) pages.delete(view);
    pages.forEach(function (page, key) {
      if (!M.state.history.includes(key)) {
        page.holder.remove();
        pages.delete(key);
      }
    });

    var scroll = main.scrollTop;
    root.textContent = '';
    if (cached) {
      moveContents(cached.holder, root);
      cached.holder.remove();
    } else {
      var content = def.render(view);
      if (content) root.appendChild(content);
    }
    if (M.shell) M.shell.sync(view, def);
    main.scrollTop = cached ? cached.scroll : direction === 'none' && !from ? scroll : 0;
    if (cached) refresh(root);

    // 根导航直接切换。点按只移动新内容，上一页立即入缓存。
    if (!leaving || opts.instant || opts.skipGhost || reducedMotion() ||
        (direction !== 'forward' && direction !== 'back')) {
      if (leaving) release(leaving);
      if (opts.done) opts.done();
      return;
    }
    if (direction === 'back' && opts.swipeOffset > 0) {
      var width = main.clientWidth;
      var start = Math.min(opts.swipeOffset, width);
      var active = showLayer(root, leaving, true);
      slide(active.layer, 'X', start, width, Math.max(80, 205 * (1 - start / width)), opts.done);
      return;
    }
    release(leaving);
    var offset = from.type === 'nowplaying' || view.type === 'nowplaying' ? 24 : 12;
    motion = { root: root };
    slide(root, 'Y', direction === 'back' ? -offset : offset, 0, 190, opts.done);
  };

  M.nav = function (view) {
    if (!view || !view.type) return;
    navVersion++;
    var from = M.state.view;
    leaveCurrent();
    M.state.history.push(from);
    M.state.view = view;
    M.render({ direction: 'forward', from: from });
  };

  M.back = function (opts) {
    opts = opts || {};
    navVersion++;
    var from = M.state.view;
    leaveCurrent();
    M.state.view = M.state.history.pop() || { type: 'home' };
    M.render({
      direction: opts.direction || 'back', from: from,
      reuse: opts.reuse, skipGhost: opts.skipGhost, swipeOffset: opts.swipeOffset, done: opts.done
    });
  };

  M.goTab = function (type) {
    var version = ++navVersion;
    if (M.state.view.type === type && !M.state.history.length) {
      stopMotion();
      var main = document.getElementById('m-main');
      if (main) main.scrollTop = 0;
      return;
    }
    function enter() {
      if (version !== navVersion) return;
      leaveCurrent();
      M.state.history = [];
      M.state.view = { type: type };
      M.render({ direction: 'fade', reuse: false });
    }
    var def = M.views[type];
    if (def && typeof def.guard === 'function') {
      Promise.resolve(def.guard()).then(function (allow) { if (allow) enter(); });
    } else enter();
  };

  M.applyHash = function () {
    var h = (location.hash || '').replace(/^#/, '');
    if (h && M.views[h]) {
      M.state.view = { type: h };
      M.state.history = [];
    }
  };

  M.slidePrepare = function () {
    stopMotion();
    var previous = pages.get(M.state.history[M.state.history.length - 1]);
    if (!previous || reducedMotion()) return false;
    var root = document.getElementById('m-view');
    var main = document.getElementById('m-main');
    var height = main.getBoundingClientRect().bottom - root.getBoundingClientRect().top;
    root.style.setProperty('--m-motion-height', Math.ceil(height) + 'px');
    var active = showLayer(root, previous, false);
    active.gesturePreview = true;
    active.dragging = true;
    return true;
  };

  M.slideFollow = function (dx) {
    if (!motion || !motion.dragging) return;
    motion.dx = Math.max(0, Math.min(dx, document.getElementById('m-main').clientWidth));
    motion.root.style.transform = 'translateX(' + motion.dx + 'px)';
  };

  M.slideBack = function () {
    if (!motion || !motion.dragging) return;
    motion.dragging = false;
    slide(motion.root, 'X', motion.dx, 0, 150);
  };

  M.slideRestorePrev = function () {
    if (motion && motion.gesturePreview) stopMotion();
  };

  M.slideOutRight = function (done) {
    if (!motion || !motion.dragging) M.slidePrepare();
    if (!motion) {
      if (done) done();
      return;
    }
    motion.dragging = false;
    slide(motion.root, 'X', motion.dx, document.getElementById('m-main').clientWidth, 185, done);
  };

  M.slideCommitBack = function (done) {
    var dx = motion && motion.dragging ? motion.dx : 0;
    if (M.state.history.length) M.back({ swipeOffset: dx, done: done });
    else {
      stopMotion();
      if (done) done();
    }
  };
})(window.Mobile = window.Mobile || {});
