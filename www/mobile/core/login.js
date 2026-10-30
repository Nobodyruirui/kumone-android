/* =============================================================
 * 移动端渲染层 · 扫码登录状态机
 * -------------------------------------------------------------
 * 扫码登录不是「一个页面」，是**一个状态机 + 一个中断恢复**：
 *
 *   idle → fetching → waiting → scanned → success
 *                          ↓
 *                       expired → (刷新) → fetching
 *                          ↓
 *                        error  → (重试) → fetching
 *
 * 状态机本身**不碰 DOM、不碰计时器**：轮询由外部调用 tick()，
 * 所以它能在 Node 里用假服务逐条断言（见 test/login.test.mjs）。
 *
 * 登录态的读取与清除集中在服务层（service.isLoggedIn / service.logout），
 * 这里不自己写 cookie、也不碰 document.cookie。
 * ============================================================= */
(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Mobile = root.Mobile || {};
    root.Mobile.loginMachine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 每个阶段的中文标签。界面直接用这份文案。 */
  var PHASES = {
    idle: '准备中',
    fetching: '正在获取二维码',
    waiting: '等待扫码',
    scanned: '已扫码，请在手机上确认',
    success: '登录成功',
    expired: '二维码已过期',
    error: '登录失败'
  };

  /** 网易云扫码接口的返回码 → 阶段。 */
  var CHECK_CODES = {
    800: 'expired',
    801: 'waiting',
    802: 'scanned',
    803: 'success'
  };

  var LOGIN_URL_PREFIX = 'https://music.163.com/login?codekey=';

  /**
   * 造一个登录状态机。
   * @param {object} opts
   * @param {object} opts.service 服务层（提供 qrKey / qrImage / qrCheck）
   * @param {function} [opts.onChange] 状态变化回调
   */
  function createMachine(opts) {
    opts = opts || {};
    var service = opts.service;
    var onChange = opts.onChange || function () {};

    if (!service) throw new Error('登录状态机需要一个服务层');

    var state = {
      phase: 'idle',
      unikey: null,
      image: null,
      message: null,
      error: null
    };

    function emit() {
      try { onChange(snapshot()); } catch (_) { /* 订阅者的错不牵连状态机 */ }
    }

    function snapshot() {
      return {
        phase: state.phase,
        label: PHASES[state.phase] || state.phase,
        unikey: state.unikey,
        image: state.image,
        message: state.message,
        error: state.error
      };
    }

    function set(phase, patch) {
      Object.keys(patch || {}).forEach(function (k) { state[k] = patch[k]; });
      state.phase = phase;
      emit();
      return snapshot();
    }

    /**
     * 取二维码：先要 unikey，再渲染成图片。
     * 成功后停在 waiting，等 tick() 去轮询。
     */
    async function start() {
      set('fetching', { error: null, unikey: null, image: null, message: null });

      var key = await service.qrKey();
      if (!key || key.ok !== true) {
        return set('error', { error: key || null, message: '拿不到二维码编号' });
      }
      var unikey = key.data;
      if (!unikey) {
        return set('error', { error: null, message: '二维码编号是空的' });
      }

      var img = await service.qrImage(LOGIN_URL_PREFIX + unikey);
      if (!img || img.ok !== true) {
        return set('error', { error: img || null, message: '二维码渲染失败' });
      }

      return set('waiting', { unikey: unikey, image: img.data, error: null, message: null });
    }

    /**
     * 轮询一次扫码状态。
     * 只有 waiting / scanned / expired 三个阶段需要轮询。
     */
    async function tick() {
      if (state.phase !== 'waiting' && state.phase !== 'scanned') {
        return snapshot();
      }
      if (!state.unikey) return snapshot();

      var r = await service.qrCheck(state.unikey);
      if (!r || r.ok !== true) {
        // 网络抖动不该把整个登录流程判死：留在原阶段，等下一拍
        return set(state.phase, { error: r || null, message: '状态查询失败，正在重试' });
      }

      var body = r.data || {};
      var code = Number(body.code);
      var phase = CHECK_CODES[code];
      if (!phase) {
        return set(state.phase, { message: body.message || '等待扫码' });
      }
      if (phase === 'success') {
        return set('success', { message: body.message || '登录成功', error: null });
      }
      return set(phase, { message: body.message || null, error: null });
    }

    /** 刷新二维码（过期后用）。 */
    function refresh() {
      return start();
    }

    /** 放弃（离开登录页时停掉轮询）。 */
    function stop() {
      return snapshot();
    }

    return {
      start: start,
      tick: tick,
      refresh: refresh,
      stop: stop,
      snapshot: snapshot,
      get phase() { return state.phase; },
      PHASES: PHASES,
      CHECK_CODES: CHECK_CODES
    };
  }

  return {
    createMachine: createMachine,
    PHASES: PHASES,
    CHECK_CODES: CHECK_CODES
  };
});
