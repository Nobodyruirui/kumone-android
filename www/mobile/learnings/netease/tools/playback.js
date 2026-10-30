/* =============================================================
 * 知识包 · 网易云 · 播放状态工具（tools/playback.js）
 * -------------------------------------------------------------
 * 能力：读当前播放状态摘要（播放中 / 曲目 / 歌手 / 进度）。
 * 定位走 role+name：迷你播放条是 region「迷你播放条」，
 * 播放按钮的无障碍名在暂停时是「播放」、在播放时是「暂停」。
 * 优先读 ADR-0003 §4 的 player.state() 契约，读不到再降级到迷你播放条语义。
 * ============================================================= */
(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    // Node：必须是 CJS 可 require 的形式，校验器会真的加载它
    module.exports = factory(require('./locator.js'));
  } else {
    // 浏览器：按 manifest 的 loadOrder，先加载 tools/locator.js
    root.KumoneLearnings = root.KumoneLearnings || {};
    var ns = root.KumoneLearnings.netease = root.KumoneLearnings.netease || {};
    var loc = ns.locator || root.KumoneLearnings.locator;
    if (!loc) throw new Error('知识包 netease：必须先加载 tools/locator.js');
    var api = factory(loc);
    ns.currentPlayback = api.currentPlayback;
    ns.togglePlayback = api.togglePlayback;
    ns.playback = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (locator) {
  'use strict';

  var BAR = '迷你播放条';
  var IDLE = '未在播放';

  /** 把 player.state() 的返回值规整成本工具的字段。 */
  function fromPlayerState(st, view) {
    return locator.ok({
      source: 'player.state',
      playing: st.playing == null ? null : !!st.playing,
      trackName: st.trackName || st.name || null,
      artist: st.artist || null,
      position: typeof st.position === 'number' ? st.position : null,
      duration: typeof st.duration === 'number' ? st.duration : null,
      view: view
    });
  }

  /** 从迷你播放条的无障碍语义里读播放状态（player.state() 不可用时的降级路径）。 */
  function fromMiniBar(nodes, view) {
    var region = locator.findMatches(nodes, { roles: ['region'], name: BAR, match: 'exact' })[0];
    if (!region) {
      return locator.fail('KUMONE_NOT_FOUND', {
        expected: 'await currentPlayback()',
        state: '当前界面上没有迷你播放条',
        cause: '没有找到 region「' + BAR + '」',
        next: '确认应用外壳已启动；这个区块常驻在底部'
      });
    }

    var kids = locator.descendants(nodes, region);
    var cover = null;
    var texts = [];
    var button = null;

    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.role === 'image' && /封面$/.test(n.name)) {
        cover = n.name.replace(/\s*封面$/, '');
      } else if (n.role === 'text' && n.name) {
        texts.push(n.name);
      } else if (n.role === 'button' && (n.name === '播放' || n.name === '暂停')) {
        button = n;
      }
    }

    var title = cover || (texts.length ? texts[0] : null);
    var artist = null;
    for (var j = 0; j < texts.length; j++) {
      if (texts[j] !== title) { artist = texts[j]; break; }
    }

    var playing = button ? (button.name === '暂停') : null;
    if (title === IDLE) {
      title = null;
      artist = null;
      playing = playing == null ? false : playing;
    }

    return locator.ok({
      source: 'mini-bar',
      playing: playing,
      trackName: title,
      artist: artist,
      position: null,
      duration: null,
      view: view,
      detail: '进度来自 player.state()；迷你播放条只承载曲目与播放开关'
    });
  }

  /**
   * 读当前播放状态摘要。
   * @returns {Promise<object>} { ok, playing, trackName, artist, position, duration, source, view }
   */
  async function currentPlayback() {
    var M = locator.mobile();
    if (!M) {
      return locator.fail('KUMONE_UNSUPPORTED', {
        expected: 'await currentPlayback()',
        state: '当前环境没有 Mobile 模型接口',
        cause: 'window.Mobile 不存在',
        next: '在应用内调用；Node 里只做加载自检'
      });
    }

    var view = locator.currentView();

    // 首选：player.state()（ADR-0003 §4 的状态查询契约）
    if (M.player && typeof M.player.state === 'function') {
      var st = null;
      try {
        st = await M.player.state();
      } catch (e) {
        st = null;
      }
      if (st && typeof st === 'object') return fromPlayerState(st, view);
    }

    // 降级：迷你播放条的无障碍语义
    var tree = await locator.snapshotTree();
    if (!tree) {
      return locator.fail('KUMONE_UNSUPPORTED', {
        expected: 'await currentPlayback()',
        state: '取不到语义快照',
        cause: '当前环境没有 Mobile 感知层',
        next: '在应用内调用；Node 里只做加载自检'
      });
    }
    return fromMiniBar(locator.parseTree(tree), view);
  }

  /**
   * 播放/暂停切换：点迷你播放条里的播放开关。
   * @returns {Promise<object>}
   */
  async function togglePlayback() {
    var tree = await locator.snapshotTree();
    if (!tree) {
      return locator.fail('KUMONE_UNSUPPORTED', {
        expected: 'await togglePlayback()',
        state: '取不到语义快照',
        cause: '当前环境没有 Mobile 感知层',
        next: '在应用内调用；Node 里只做加载自检'
      });
    }

    var nodes = locator.parseTree(tree);
    var region = locator.findMatches(nodes, { roles: ['region'], name: BAR, match: 'exact' })[0];
    if (!region) {
      return locator.fail('KUMONE_NOT_FOUND', {
        expected: 'await togglePlayback()',
        state: '当前界面上没有迷你播放条',
        cause: '没有找到 region「' + BAR + '」',
        next: '确认应用外壳已启动；这个区块常驻在底部'
      });
    }

    var kids = locator.descendants(nodes, region);
    var button = null;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].role === 'button' && (kids[i].name === '播放' || kids[i].name === '暂停')) {
        button = kids[i];
        break;
      }
    }

    if (!button) {
      return locator.fail('KUMONE_NOT_FOUND', {
        expected: 'await togglePlayback()',
        state: '迷你播放条里没有播放开关',
        cause: '没有找到 button「播放」或 button「暂停」',
        next: '确认外壳渲染了播放按钮'
      });
    }

    var acted = await locator.act(button, 'click');
    if (!acted.ok) return acted;

    return locator.ok({
      action: 'click',
      name: button.name,
      wasPlaying: button.name === '暂停',
      nowPlaying: button.name === '播放',
      view: locator.currentView()
    });
  }

  return {
    currentPlayback: currentPlayback,
    togglePlayback: togglePlayback
  };
});
