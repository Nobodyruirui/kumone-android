/* =============================================================
 * Kumone for Android — Apple Music 风格皮肤层 · 逐字歌词模块
 * -------------------------------------------------------------
 * 单独成文件，方便按需开关（index.html 里注释掉即可回退）。
 *
 * 原理：
 *   1. 给 /song/lyric 请求加 yv=-1，拿到「逐字歌词」yrc
 *      —— 实测见 test/yrc-probe.js：不带 yv=-1 响应里没有 yrc 字段
 *   2. 解析 yrc：行格式 [行首ms,行时长ms](词首ms,词时长ms,0)词(词首ms,词时长ms,0)词
 *      注意文字在时间元组「后面」
 *   3. 把行级歌词重绘成逐词 span，用 rAF 按播放进度做卡拉OK扫光
 *
 * 没有逐字歌词的歌曲（老歌居多）自动回退到上游的整行高亮，不影响使用。
 * ============================================================= */
(function () {
  'use strict';
  if (window.__appleLyrics) return;
  window.__appleLyrics = true;

  var yrcCache = {};          // { trackId: yrcText }
  var current = { lines: [], trackId: null };

  function patchLyricForYrc() {
    var API = window.KumoneAPI;
    if (!API || !API.client || API.__yrcPatched) return;
    API.__yrcPatched = true;

    API.lyric = function (id) {
      return API.client.weapi('/song/lyric', {
        id: id, lv: -1, kv: -1, tv: -1, rv: -1, yv: -1
      }).then(function (text) {
        var obj = JSON.parse(text);
        if (!obj || obj.code !== 200) throw new Error('歌词获取失败');
        if (obj.yrc && obj.yrc.lyric) yrcCache[String(id)] = obj.yrc.lyric;
        return obj;
      });
    };
  }

  /// 解析 yrc 文本 → [{ time, dur, words:[{t,d,text}], text }]
  function parseYrc(raw) {
    var lines = [];
    String(raw || '').split('\n').forEach(function (line) {
      var head = line.match(/^\[(\d+),(\d+)\]/);
      if (!head) return;
      var lineStart = Number(head[1]) / 1000;
      var lineDur = Number(head[2]) / 1000;

      // 按时间元组切分：奇数位是元组，偶数位是元组后面那一个词
      var parts = line.split(/(\(\d+,\d+,\d+\))/);
      var words = [];
      for (var i = 1; i < parts.length; i += 2) {
        var tup = parts[i].match(/\((\d+),(\d+),(\d+)\)/);
        var text = (parts[i + 1] || '').trim();
        if (!tup || !text) continue;
        words.push({ t: Number(tup[1]) / 1000, d: Number(tup[2]) / 1000, text: text });
      }
      if (!words.length) return;
      // 跳过「作词：xxx / 作曲：xxx」这类零时长元信息行
      if (lineDur === 0 && words.every(function (w) { return w.d === 0; })) return;

      lines.push({
        time: lineStart,
        dur: lineDur,
        words: words,
        text: words.map(function (w) { return w.text; }).join('')
      });
    });
    lines.sort(function (a, b) { return a.time - b.time; });
    return lines;
  }

  function nowTrackId() {
    try {
      var p = (typeof player !== "undefined") ? player : null;
      if (!p || !p.queue || p.index < 0) return null;
      var e = p.queue[p.index];
      return e && e.track ? e.track.id : null;
    } catch (_e) { return null; }
  }

  /// 拿到当前这首歌的逐字歌词行；没有就返回 null
  function yrcLinesForCurrent() {
    var id = nowTrackId();
    if (id == null) return null;
    var raw = yrcCache[String(id)];
    if (!raw) return null;
    var lines = parseYrc(raw);
    return lines.length ? lines : null;
  }

  /// 把行级歌词 DOM 重绘成逐词 span
  function paint(container) {
    if (!container) return;
    var lines = current.lines;
    if (!lines.length) return;

    var frag = document.createDocumentFragment();
    lines.forEach(function (ln) {
      var row = document.createElement('div');
      row.className = 'lyrics-line apple-word-line';
      row.setAttribute('data-time', String(ln.time));

      var wrap = document.createElement('div');
      wrap.className = 'w-wrap';
      ln.words.forEach(function (w) {
        var s = document.createElement('span');
        s.className = 'w';
        s.setAttribute('data-t', String(w.t));
        s.setAttribute('data-d', String(w.d));
        s.textContent = w.text;
        wrap.appendChild(s);
      });
      row.appendChild(wrap);

      var trans = translationFor(ln.time);
      if (trans) {
        var tl = document.createElement('div');
        tl.className = 'tl';
        tl.textContent = trans;
        row.appendChild(tl);
      }
      frag.appendChild(row);
    });

    container.textContent = '';
    container.appendChild(frag);
  }

  /// 翻译行：上游 player.lyrics 里按时间对齐，取不到就不显示
  function translationFor(t) {
    try {
      var p = (typeof player !== "undefined") ? player : null;
      if (!p || !p.lyrics) return null;
      var best = null, bestDiff = 0.35;
      for (var i = 0; i < p.lyrics.length; i++) {
        var d = Math.abs(p.lyrics[i].time - t);
        if (d < bestDiff) { bestDiff = d; best = p.lyrics[i]; }
      }
      return best ? (best.tl || null) : null;
    } catch (_e) { return null; }
  }

  /// 当前播放位置对应的行索引
  function activeIndex(t) {
    var lines = current.lines;
    var idx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].time <= t + 0.02) idx = i; else break;
    }
    return idx;
  }

  /// 卡拉OK 扫光：当前行用渐变遮罩，已唱部分纯白、未唱部分压暗
  function tick() {
    var t = 0;
    try { var a = (typeof audio !== "undefined") ? audio : null; t = a ? a.currentTime : 0; } catch (_e) {}

    var rows = document.querySelectorAll('.apple-word-line');
    if (!rows.length) return;

    var idx = activeIndex(t);
    var lines = current.lines;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var isCur = (i === idx);
      if (isCur) {
        if (!row.classList.contains('current')) {
          // 整行高亮交给上游 .current 逻辑，这里只管词
          row.classList.add('apple-current');
        }
        var ln = lines[i];
        var p = ln && ln.dur > 0 ? (t - ln.time) / ln.dur : 0;
        p = Math.max(0, Math.min(1, p));
        row.style.setProperty('--p', (p * 100).toFixed(2) + '%');
      } else {
        row.classList.remove('apple-current');
        row.style.removeProperty('--p');
      }
    }
  }

  /// 在所有歌词容器里重绘逐词歌词
  function refresh() {
    var lines = yrcLinesForCurrent();
    if (!lines) {
      // 没逐字歌词：清掉自己的痕迹，交给上游整行高亮
      current.lines = [];
      document.querySelectorAll('.apple-word-line').forEach(function (n) {
        n.classList.remove('apple-word-line', 'apple-current');
        n.style.removeProperty('--p');
      });
      return;
    }
    current.lines = lines;
    paint(document.querySelector('.np-lyrics'));
    var panel = document.querySelector('#panel-content');
    if (panel && panel.querySelector('.lyrics-line')) paint(panel);
  }

  /* ------------------------------- 挂钩：歌词加载完 / 视图重绘后 */

  function hook() {
    var origLoad = window.loadLyrics;
    if (typeof origLoad === 'function' && !origLoad.__appleHooked) {
      var wrapped = function () {
        return origLoad.apply(this, arguments).then(function (r) {
          refresh();
          return r;
        }, function (e) {
          refresh();
          throw e;
        });
      };
      wrapped.__appleHooked = true;
      window.loadLyrics = wrapped;
    }
  }

  function boot() {
    patchLyricForYrc();
    hook();

    // 播放中持续刷新扫光
    (function loop() {
      tick();
      requestAnimationFrame(loop);
    })();

    // 视图重绘后重新上色（上游 render 会清空 #view）
    var origRender = window.render;
    if (typeof origRender === 'function' && !origRender.__appleHooked) {
      var wrapped = function () {
        var r = origRender.apply(this, arguments);
        setTimeout(refresh, 0);
        return r;
      };
      wrapped.__appleHooked = true;
      window.render = wrapped;
    }

    // 切歌时清缓存对应的当前行
    document.addEventListener('visibilitychange', function () { tick(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.AppleLyrics = {
    refresh: refresh,
    parseYrc: parseYrc,
    yrcCache: yrcCache,
    get lines() { return current.lines; }
  };
})();
