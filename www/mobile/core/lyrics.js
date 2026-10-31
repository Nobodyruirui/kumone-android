/* =============================================================
 * 移动端渲染层 · 歌词解析
 * -------------------------------------------------------------
 * 网易云给同一首歌三种歌词文本：lrc 整行 / tlyric 翻译 / yrc 逐字。
 * 本模块解析成**统一的行结构**，界面只认一种：
 *   { time, dur, text, words: [{t,d,text}] | null, translation: string | null }
 * 纪律：纯函数（不碰 DOM、不发请求）→ 可在 Node 里逐条断言；逐字优先；
 * 翻译按时间就近对齐（容差 0.4 秒）。
 * 加载方式：浏览器挂到 Mobile.lyrics；Node 直接 require。
 * ============================================================= */
(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Mobile = root.Mobile || {};
    root.Mobile.lyrics = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 翻译行与原文的对齐容差（秒）。 */
  var TRANSLATION_TOLERANCE = 0.4;

  /**
   * 元信息行（作词 / 作曲 / 编曲 …）不是歌词。
   * 逐字歌词里这类行长得很像歌词：`[0,1000](0,1000,0)作词 : 某某`
   * —— 时长不为 0，光看时长拦不住，只能看内容。
   * 整行歌词同理（实测开头常常是「填词：周萌@大创作家」这类行）。
   */
  var META_RE = /^[:：]?\s*(作词|作曲|填词|编曲|制作|制作人|混音|混录|监听|母带|监制|出品|发行|企划|策划|推广|和声|和音|录音|录歌|吉他|贝斯|鼓|键盘|弦乐|配唱|原唱|原曲|改编|翻译|校对|统筹|美术|封面|鸣谢|特别鸣谢|商务|版权|OP|ED|SP|VOCAL)\s*[:：]/i;

  /** 这行是不是元信息。 */
  function isMeta(text) {
    return META_RE.test(String(text || '').trim());
  }

  /**
   * 解析整行歌词（LRC）。一行可有多个时间标签：[00:01.00][00:31.00]同一句
   * @param {string} text
   * @returns {Array<{time:number, text:string}>}
   */
  function parseLrc(text) {
    var lines = [];
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;

      // 一行可能有多个时间标签：[00:01.00][00:05.00]同一句
      var stamps = [];
      var rest = line;
      var m;
      var re = /^\[(\d+):(\d+(?:[.:]\d+)?)\]/;
      while ((m = re.exec(rest))) {
        var min = Number(m[1]);
        var sec = parseFloat(m[2].replace(':', '.'));
        stamps.push(min * 60 + sec);
        rest = rest.slice(m[0].length);
      }
      if (!stamps.length) return;

      var content = rest.trim();
      // 元信息行（作词 / 作曲 / 制作）不当作歌词
      if (!content || isMeta(content)) return;

      stamps.forEach(function (t) {
        lines.push({ time: t, text: content });
      });
    });
    lines.sort(function (a, b) { return a.time - b.time; });
    return lines;
  }

  /**
   * 解析逐字歌词（YRC）。
   * 行格式：[行首ms,行时长ms](词首ms,词时长ms,0)词(词首ms,词时长ms,0)词
   * 注意：文字在时间元组**后面**。
   * @param {string} text
   * @returns {Array<{time:number, dur:number, words:Array, text:string}>}
   */  function parseYrc(text) {
    var lines = [];
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;

      var head = line.match(/^\[(\d+),(\d+)\]/);
      if (!head) return;
      var lineStart = Number(head[1]) / 1000;
      var lineDur = Number(head[2]) / 1000;

      // 按时间元组切分：奇数位是元组，偶数位是元组后面那一个词
      var parts = line.split(/(\(\d+,\d+,\d+\))/);
      var words = [];
      for (var i = 1; i < parts.length; i += 2) {
        var tup = parts[i].match(/\((\d+),(\d+),(\d+)\)/);
        var word = (parts[i + 1] || '').trim();
        if (!tup || !word) continue;
        words.push({ t: Number(tup[1]) / 1000, d: Number(tup[2]) / 1000, text: word });
      }
      if (!words.length) return;

      // 零时长的元信息行（作词 / 作曲）跳过
      if (lineDur === 0 && words.every(function (w) { return w.d === 0; })) return;
      // 时长不为 0 的元信息行也要拦：`[0,1000](0,1000,0)作词 : 某某`
      if (isMeta(words.map(function (w) { return w.text; }).join(''))) return;

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

  /** 找出与给定时间最接近的翻译行。 */
  function translationAt(translations, t) {
    if (!translations || !translations.length) return null;
    var best = null;
    var bestDiff = TRANSLATION_TOLERANCE;
    for (var i = 0; i < translations.length; i++) {
      var d = Math.abs(translations[i].time - t);
      if (d < bestDiff) { bestDiff = d; best = translations[i]; }
    }
    return best ? best.text : null;
  }

  /**
   * 把接口返回的三种文本解析成统一的行结构。
   *
   * @param {object} raw { lrc, tlyric, yrc }
   * @returns {object} { kind: 'word'|'line'|'none', lines: Array }
   */
  function build(raw) {
    raw = raw || {};
    var translations = parseLrc(raw.tlyric);
    var yrc = parseYrc(raw.yrc);

    if (yrc.length) {
      return {
        kind: 'word',
        lines: yrc.map(function (ln) {
          return {
            time: ln.time,
            dur: ln.dur,
            text: ln.text,
            words: ln.words,
            translation: translationAt(translations, ln.time)
          };
        })
      };
    }

    var lrc = parseLrc(raw.lrc);
    if (lrc.length) {
      return {
        kind: 'line',
        lines: lrc.map(function (ln) {
          return {
            time: ln.time,
            dur: 0,
            text: ln.text,
            words: null,
            translation: translationAt(translations, ln.time)
          };
        })
      };
    }

    return { kind: 'none', lines: [] };
  }

  /**
   * 当前播放位置对应的行下标。没有行时返回 -1。
   * @param {Array} lines
   * @param {number} t 秒
   */
  function activeIndex(lines, t) {
    if (!lines || !lines.length) return -1;
    var idx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].time <= t + 0.02) idx = i; else break;
    }
    return idx;
  }

  return {
    parseLrc: parseLrc,
    parseYrc: parseYrc,
    build: build,
    activeIndex: activeIndex,
    TRANSLATION_TOLERANCE: TRANSLATION_TOLERANCE
  };
});
