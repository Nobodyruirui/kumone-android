/* =============================================================
 * 移动端渲染层 · 播放引擎
 * -------------------------------------------------------------
 * 移动端自持播放能力（上游 app.js 的顶层就绑 DOM，无法在移动 DOM 上复用），
 * 但复用内核提供的播放能力：取播放地址（内核加密请求）、音源解锁、播放上报。
 *
 * 引擎只做状态机，不碰界面：
 *   - 队列 / 下一首播放 / 播放模式（顺序·列表·单曲循环）
 *   - 音质降级链（请求音质不可用 → 标准音质）
 *   - 进度持久化（队列 + 位置，重启后接着放）
 *   - MediaSession（系统媒体键与通知栏控制）
 *   - 对外只暴露一个 state()，界面与模型都从它读播放状态
 *
 * 失败一律走服务层的契约错误（按码分支），不按文案分支。
 *
 * 加载方式：浏览器挂到 Mobile.player；Node 直接 require（自测注入假音频元素）。
 * ============================================================= */
(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./errors.js'));
  } else {
    root.Mobile = root.Mobile || {};
    var api = factory(root.Mobile.errors);
    root.Mobile.player = api.createPlayer({
      service: root.Mobile.service,
      audio: new Audio(),
      store: api.makeStore(),
      mediaSession: typeof navigator !== 'undefined' ? navigator.mediaSession : null,
      onChange: function (snap) {
        var shell = root.Mobile.shell;
        if (!shell) return;
        if (shell.setMini) shell.setMini(snap.track);
        if (shell.setMiniPlaying) shell.setMiniPlaying(!!snap.playing);
        if (shell.setMiniProgress) {
          shell.setMiniProgress(snap.duration ? snap.position / snap.duration : 0);
        }
      }
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (errors) {
  'use strict';

  /** localStorage 薄封装；不可用时退化成内存（隐私模式 / Node）。 */
  function makeStore() {
    var mem = {};
    var hasLS = (function () {
      try { return typeof localStorage !== 'undefined' && !!localStorage; }
      catch (_) { return false; }
    })();
    return {
      get: function (key, fallback) {
        try {
          if (!hasLS) return mem[key] == null ? fallback : mem[key];
          var v = localStorage.getItem('kumone.' + key);
          return v == null ? fallback : JSON.parse(v);
        } catch (_) { return fallback; }
      },
      set: function (key, value) {
        try {
          if (!hasLS) { mem[key] = value; return; }
          localStorage.setItem('kumone.' + key, JSON.stringify(value));
        } catch (_) { mem[key] = value; }
      }
    };
  }

  /** 音质降级链：先要想要的，不行就退到标准音质。 */
  var QUALITY_FALLBACK = ['exhigh', 'lossless', 'standard'];

  /** 播放模式：off（顺序）| all（列表循环）| one（单曲循环）| shuffle（随机）。 */
  var REPEAT_MODES = ['off', 'all', 'one', 'shuffle'];

  /**
   * 造一个播放引擎。
   * @param {object} opts
   * @param {object} opts.service 服务层（提供 songUrl）
   * @param {object} opts.audio 音频元素（浏览器 new Audio() / Node 假对象）
   * @param {object} [opts.store] 持久化
   * @param {object} [opts.mediaSession] navigator.mediaSession
   * @param {function} [opts.onChange] 状态变化回调
   */
  function createPlayer(opts) {
    opts = opts || {};
    var service = opts.service;
    var audio = opts.audio;
    var store = opts.store || makeStore();
    var mediaSession = opts.mediaSession || null;
    var onChange = opts.onChange || function () {};
    var subscribers = [onChange];

    if (!audio) throw new Error('播放引擎需要一个音频元素');
    if (!service || typeof service.songUrl !== 'function') {
      throw new Error('播放引擎需要一个带 songUrl(id, level) 的服务层');
    }

    var state = {
      queue: [],            // [{ track, sourceID }]
      index: -1,
      playNextList: [],     // 「下一首播放」插播队列
      repeat: store.get('mobile.repeat', 'off'),   // off | all | one | shuffle
      quality: store.get('mobile.quality', 'lossless'),
      volume: store.get('mobile.volume', 0.9),
      history: store.get('mobile.history', []),   // 本机播放历史（最近在前）
      generation: 0,        // 竞态守卫：只有最后一次取址的结果算数
      consecutiveFailures: 0,
      servedQuality: null,  // 实际下发的音质（可能与请求不同）
      restoreTime: null,    // 重启后恢复的位置
      lastError: null,
      unblockEnabled: opts.unblock !== false   // 第三方音源兜底开关
    };

    audio.volume = state.volume;

    /* ------------------------------------------------------ 事件订阅 */

    /**
     * 订阅状态变化。返回退订函数。
     * 事件载荷是纯数据快照，**不含任何 DOM 引用**。
     */
    function subscribe(fn) {
      if (typeof fn !== 'function') return function () {};
      subscribers.push(fn);
      return function () {
        var i = subscribers.indexOf(fn);
        if (i >= 0) subscribers.splice(i, 1);
      };
    }

    function emit() {
      var snap = snapshot();
      subscribers.slice().forEach(function (fn) {
        try { fn(snap); } catch (_) { /* 订阅者自己的错不该影响引擎 */ }
      });
    }

    /* ---------------------------------------------------------- 读状态 */

    function currentEntry() {
      return state.queue[state.index] || null;
    }

    /** 归一化后的曲目里，艺人是数组；播放状态对外要的是可展示字符串。 */
    function artistNamesOf(track) {
      if (!track) return null;
      if (track.artistNames) return track.artistNames;
      if (!track.artists || !track.artists.length) return null;
      return track.artists.map(function (a) { return a.name; }).join(' / ');
    }

    function albumNameOf(track) {
      if (!track) return null;
      return (track.album && track.album.name) || track.albumName || null;
    }

    function coverOf(track) {
      if (!track) return null;
      return (track.album && track.album.picUrl) || track.cover || null;
    }

    /**
     * 对外唯一的播放状态读数。界面与模型都从这里读，不去翻内部字段。
     * @returns {object} { playing, track, trackName, artist, position, duration, quality, ... }
     */
    function snapshot() {
      var entry = currentEntry();
      var track = entry ? entry.track : null;
      return {
        playing: !!(audio && !audio.paused && track),
        track: track,
        trackName: track ? track.name : null,
        artist: artistNamesOf(track),
        album: albumNameOf(track),
        cover: coverOf(track),
        position: audio ? (audio.currentTime || 0) : 0,
        duration: (audio && audio.duration && isFinite(audio.duration)) ? audio.duration : (track ? (track.durationMS || 0) / 1000 : 0),
        quality: state.servedQuality,
        requestedQuality: state.quality,
        volume: state.volume,
        repeat: state.repeat,
        queueLength: state.queue.length,
        index: state.index,
        playNextLength: state.playNextList.length,
        error: state.lastError
      };
    }

    /* ---------------------------------------------------------- 队列 */

    /**
     * 推入队列（追加，不替换）。命名动词：状态转移只能走这些动词。
     * @param {Array} tracks 归一化后的曲目
     * @param {object} [options] { play: true } 是否立刻开始播放
     */
    async function queue(tracks, options) {
      var opts = options || {};
      var items = (tracks || []).filter(Boolean).map(function (t) {
        return { track: t, sourceID: 0 };
      });
      if (!items.length) {
        state.lastError = errors.make('KUMONE_EMPTY_RESULT', {
          expected: 'await queue(tracks)',
          state: '没有可推入的曲目',
          cause: '传入的曲目列表为空',
          next: '先取到数据再推入队列'
        });
        emit();
        return snapshot();
      }
      var wasEmpty = state.queue.length === 0;
      state.queue = state.queue.concat(items);
      if (wasEmpty) state.index = 0;
      if (opts.play) {
        await loadCurrent(true);
      } else {
        emit();
      }
      return snapshot();
    }

    /** 只读地拿当前队列（拷贝，外部改不到内部状态）。 */
    function queueItems() {
      return state.queue.map(function (q) { return q.track; });
    }

    /**
     * 用一份曲目替换当前队列并开始播放。
     * @param {Array} tracks 归一化后的曲目
     * @param {number} [index] 起始下标
     * @param {number} [sourceID] 来源标识（上报用）
     */
    async function playQueue(tracks, index, sourceID) {
      sourceID = sourceID || 0;
      state.queue = (tracks || []).filter(Boolean).map(function (t) {
        return { track: t, sourceID: sourceID };
      });
      state.index = state.queue.length
        ? Math.max(0, Math.min(index || 0, state.queue.length - 1))
        : -1;
      state.consecutiveFailures = 0;
      state.playNextList = [];
      await loadCurrent(true);
      return snapshot();
    }

    /** 「下一首播放」：插到当前曲目之后；已在插播队列则移到队尾。 */
    function addPlayNext(track) {
      if (!track) return { ok: false, code: 'KUMONE_EMPTY_RESULT' };
      state.playNextList = state.playNextList.filter(function (t) { return t.id !== track.id; });
      state.playNextList.push(track);
      return { ok: true, data: snapshot() };
    }

    /** 队列里替换当前曲目（插播已用掉后同步队列视图）。 */
    function clearPlayNext() {
      state.playNextList = [];
    }

    /* ---------------------------------------------------------- 切歌 */

    /**
     * 前进一首。
     * @param {boolean} [userInitiated] 用户主动点「下一首」时为 true
     */
    async function next(userInitiated) {
      if (!state.queue.length && !state.playNextList.length) return snapshot();

      // 单曲循环：非用户主动时重播当前曲目
      if (state.repeat === 'one' && !userInitiated && !state.playNextList.length) {
        if (audio) { audio.currentTime = 0; if (audio.play) audio.play(); }
        return snapshot();
      }
      // 插播队列优先
      if (state.playNextList.length) {
        var track = state.playNextList.shift();
        state.queue.splice(state.index + 1, 0, { track: track, sourceID: 0 });
        state.index += 1;
        await loadCurrent(true);
        return snapshot();
      }
      // 随机：换一首，且尽量不连着同一首
      if (state.repeat === 'shuffle' && state.queue.length > 1) {
        var pick = state.index;
        if (state.queue.length > 2) {
          while (pick === state.index) pick = Math.floor(Math.random() * state.queue.length);
        } else {
          pick = state.index === 0 ? 1 : 0;
        }
        state.index = pick;
        await loadCurrent(true);
        return snapshot();
      }
      if (state.index < state.queue.length - 1) {
        state.index += 1;
        await loadCurrent(true);
        return snapshot();
      }
      if (state.repeat === 'all') {
        state.index = 0;
        await loadCurrent(true);
        return snapshot();
      }
      if (audio && audio.pause) audio.pause();
      return snapshot();
    }

    /** 后退一首。 */
    async function prev() {
      if (!state.queue.length) return snapshot();
      if (state.index > 0) {
        state.index -= 1;
        await loadCurrent(true);
        return snapshot();
      }
      if (state.repeat === 'all') {
        state.index = state.queue.length - 1;
        await loadCurrent(true);
        return snapshot();
      }
      if (audio) audio.currentTime = 0;
      return snapshot();
    }

    /* ---------------------------------------------------------- 装载 */

    async function loadCurrent(autoplay) {
      var entry = currentEntry();
      if (!entry) return snapshot();
      var generation = ++state.generation;
      persist();
      emit();
      return resolveAndPlay(entry.track, generation, autoplay !== false);
    }

    /**
     * 取播放地址并播放。音质降级：请求音质 → 依次回退 → 都没有就报契约错误。
     */
    async function resolveAndPlay(track, generation, autoplay) {
      var levels = QUALITY_FALLBACK.slice();
      // 把当前请求音质放在最前面
      if (state.quality && levels.indexOf(state.quality) < 0) levels.unshift(state.quality);
      else if (state.quality) levels.splice(levels.indexOf(state.quality), 1), levels.unshift(state.quality);

      var last = null;
      var trial = false;
      for (var i = 0; i < levels.length; i++) {
        var res = await service.songUrl(track.id, levels[i]);
        if (generation !== state.generation) return snapshot();   // 已被更新的请求取代
        if (res && res.ok && res.data && res.data.url) {
          last = res;
          trial = !!(res.data.freeTrialInfo);
          break;
        }
        last = res;
        if (res && res.code === 'KUMONE_NEED_LOGIN') break;       // 登录中断不该被降级掩盖
      }

      // 路径二：换来源（第三方音源兜底）。与音质降级是两条不同的路径。
      if ((!last || !last.ok || trial) && state.unblockEnabled &&
          typeof service.unblock === 'function' && (!last || last.code !== 'KUMONE_NEED_LOGIN')) {
        var un = await service.unblock({
          id: track.id,
          name: track.name,
          artists: track.artists,
          durationMS: track.durationMS
        });
        if (generation !== state.generation) return snapshot();
        if (un && un.ok && un.data && un.data.url) {
          last = { ok: true, data: { url: un.data.url, level: null, source: un.data.source } };
          trial = false;
        } else if (!last || !last.ok) {
          last = un || { ok: false, code: 'KUMONE_UNBLOCK_FAILED' };
        }
      }

      if (!last || !last.ok) {
        state.lastError = last && last.code
          ? last
          : errors.make('KUMONE_NO_ACTIVE_PLAYER', {
              expected: 'await playQueue(tracks)',
              state: '没有取到可播放的地址',
              cause: (last && last.message) || '未知',
              next: '换一首，或检查登录状态与音源解锁开关'
            });
        state.consecutiveFailures += 1;
        emit();
        return snapshot();
      }

      state.lastError = null;
      state.consecutiveFailures = 0;
      state.servedQuality = last.data.level || levels[levels.length - 1];
      recordHistory(track);
      if (audio) {
        audio.src = last.data.url;
        if (state.restoreTime != null && state.restoreTime > 0) {
          state.restoreTime = null;
          try { audio.currentTime = state.restoreTime; } catch (_) {}
        }
        if (autoplay && audio.play) {
          try { await audio.play(); } catch (_) {}
        }
      }
      updateMediaSession(track, last.data);
      emit();
      return snapshot();
    }

    /* -------------------------------------------------------- 播放历史 */

    var HISTORY_MAX = 50;

    /**
     * 记一笔「本机播过什么」。
     * 这是**本机**历史，和服务端的「听歌排行」是两回事 ——
     * 排行榜是网易云按周统计的，这里是这台设备上真正放过的曲目。
     */
    function recordHistory(track) {
      if (!track || !track.id) return;
      var list = (state.history || []).filter(function (t) {
        return t && t.id !== track.id;
      });
      list.unshift({
        id: track.id,
        name: track.name || '',
        artists: track.artists || [],
        album: track.album || { id: 0, name: '', picUrl: null },
        durationMS: track.durationMS || 0,
        fee: track.fee || 0,
        mv: track.mv || 0
      });
      state.history = list.slice(0, HISTORY_MAX);
      store.set('mobile.history', state.history);
    }

    /** 只读读数：本机播放历史（最近在前）。 */
    function history() {
      return (state.history || []).slice();
    }

    /** 清空本机播放历史。 */
    function clearHistory() {
      state.history = [];
      store.set('mobile.history', []);
      emit();
      return snapshot();
    }

    /* ------------------------------------------------------ 播放控制 */
    async function play() {
      if (!currentEntry()) {
        state.lastError = errors.make('KUMONE_NO_ACTIVE_PLAYER', {
          expected: 'await play()',
          state: '队列里没有可播放的曲目',
          cause: '当前队列为空',
          next: '先 queue(tracks) 或 playQueue(tracks)'
        });
        emit();
        return snapshot();
      }
      if (audio && audio.play) { try { await audio.play(); } catch (_) {} }
      emit();
      return snapshot();
    }

    function pause() {
      if (audio && audio.pause) audio.pause();
      emit();
      return snapshot();
    }

    function toggle() {
      if (audio && audio.paused) return play();
      return pause();
    }

    /** 跳转到指定秒数。 */
    function seek(seconds) {
      if (!audio) return snapshot();
      var t = Math.max(0, Number(seconds) || 0);
      try { audio.currentTime = t; } catch (_) {}
      persist();
      emit();
      return snapshot();
    }

    /** 设置音量（0~1）。 */
    function setVolume(v) {
      var vol = Math.max(0, Math.min(1, Number(v)));
      state.volume = vol;
      if (audio) audio.volume = vol;
      store.set('mobile.volume', vol);
      emit();
      return snapshot();
    }

    /** 设置播放模式：off（顺序）| all（列表循环）| one（单曲循环）| shuffle（随机）。 */
    function setRepeat(mode) {
      if (REPEAT_MODES.indexOf(mode) < 0) {
        state.lastError = errors.make('KUMONE_UNSUPPORTED', {
          expected: "setRepeat('off' | 'all' | 'one' | 'shuffle')",
          state: '收到不支持的播放模式：' + mode,
          cause: '模式不在白名单内',
          next: '改成 ' + REPEAT_MODES.join(' / ') + ' 之一'
        });
        emit();
        return snapshot();
      }
      state.repeat = mode;
      store.set('mobile.repeat', mode);
      emit();
      return snapshot();
    }

    /** 设置音质（下次取址生效）。 */
    function setQuality(level) {
      state.quality = level;
      store.set('mobile.quality', level);
      return snapshot();
    }

    /* ------------------------------------------------------ 持久化 */

    function persist() {
      if (!state.queue.length) { store.set('mobile.playback', null); return; }
      store.set('mobile.playback', {
        queue: state.queue.map(function (q) { return q.track; }),
        index: state.index,
        time: audio ? (audio.currentTime || 0) : 0,
        playNext: state.playNextList
      });
    }

    /** 恢复上次播放（不自动播，等用户点）。 */
    function restore() {
      var saved = store.get('mobile.playback', null);
      if (!saved || !Array.isArray(saved.queue) || !saved.queue.length) return snapshot();
      state.queue = saved.queue.filter(Boolean).map(function (t) { return { track: t, sourceID: 0 }; });
      state.index = Math.max(0, Math.min(saved.index || 0, state.queue.length - 1));
      state.playNextList = (saved.playNext || []).filter(Boolean);
      state.restoreTime = saved.time > 5 ? saved.time : null;
      emit();
      return snapshot();
    }

    /* -------------------------------------------------- MediaSession */

    function updateMediaSession(track, data) {
      if (!mediaSession) return;
      try {
        mediaSession.metadata = new MediaMetadata({
          title: track.name || '',
          artist: artistNamesOf(track) || '',
          album: albumNameOf(track) || '',
          artwork: (function () { var c = coverOf(track); return c ? [{ src: c, sizes: '512x512', type: 'image/jpeg' }] : []; })()
        });
      } catch (_) {}
      var set = function (action, handler) {
        try { mediaSession.setActionHandler(action, handler); } catch (_) {}
      };
      set('play', function () { play(); });
      set('pause', function () { pause(); });
      set('previoustrack', function () { prev(); });
      set('nexttrack', function () { next(true); });
      set('seekbackward', function (d) { seek((audio ? audio.currentTime : 0) - (d && d.seekOffset || 10)); });
      set('seekforward', function (d) { seek((audio ? audio.currentTime : 0) + (d && d.seekOffset || 10)); });
    }

    /* --------------------------------------------------- 音频事件接线 */

    if (audio && typeof audio.addEventListener === 'function') {
      audio.addEventListener('ended', function () { next(false); });
      audio.addEventListener('timeupdate', function () { emit(); });
      audio.addEventListener('play', function () { emit(); });
      audio.addEventListener('pause', function () { emit(); });
    }

    return {
      snapshot: snapshot,
      state: snapshot,
      subscribe: subscribe,
      playQueue: playQueue,
      queue: queue,               // 命名动词：推入队列
      queueItems: queueItems,     // 只读读数
      addPlayNext: addPlayNext,
      clearPlayNext: clearPlayNext,
      play: play,
      pause: pause,
      toggle: toggle,
      next: next,
      prev: prev,
      seek: seek,
      setVolume: setVolume,
      setRepeat: setRepeat,
      setQuality: setQuality,
      persist: persist,
      restore: restore,
      history: history,
      clearHistory: clearHistory,
      currentEntry: currentEntry,
      index: function () { return state.index; }
    };
  }

  return {
    createPlayer: createPlayer,
    makeStore: makeStore,
    QUALITY_FALLBACK: QUALITY_FALLBACK,
    REPEAT_MODES: REPEAT_MODES
  };
});
