/* =============================================================
 * 全屏播放页
 * -------------------------------------------------------------
 * 这一屏是 ADR-0002 的直接兑现：上游把音质与音量放在常驻播放条右侧，
 * 而窄屏规则把它们整个 display:none —— 手机上不是难用，是根本点不到。
 * 所以移动端必须给这两项重新安排落点，落点就是这里。
 *
 * 三条纪律：
 *   1. **隐藏底部导航与迷你条是外壳的事**，视图不自己藏（见 shell.sync）。
 *   2. **拖动进度条必须走 seek()**，不直接改 DOM 模拟状态（ADR-0003）。
 *   3. **降级要看得见**：用户选的音质和实际生效的音质不一样时，两个都要显示。
 * ============================================================= */
(function (M) {
  'use strict';

  var ui = M.ui;
  var unsubscribe = null;
  // 歌词扫光的帧循环（离开播放页要停）
  var lyricRaf = null;
  // 视图是否还活着。
  // 注意：不能用 `body.isConnected` 判断 —— 首次 paint() 是在 render() 里同步调的，
  // 那时片段还没挂进 DOM，isConnected 还是 false，首帧会被静默跳过（界面永远空白）。
  var alive = false;

  var QUALITY_LABEL = {
    standard: '标准',
    exhigh: '极高',
    lossless: '无损'
  };

  var QUALITY_ORDER = ['standard', 'exhigh', 'lossless'];

  function qualityName(q) {
    return QUALITY_LABEL[q] || q || '未知';
  }

  /* ------------------------------------------------------------ 零件 */

  /** 大按钮（上一首 / 播放 / 下一首）。 */
  function controlButton(label, glyph, onClick) {
    var b = ui.el('button', {
      class: 'm-np-btn',
      type: 'button',
      'aria-label': label
    }, glyph);
    b.addEventListener('click', onClick);
    return b;
  }

  /** 滑杆（进度 / 音量）。用 range input，语义上它就是 slider。 */
  function slider(label, min, max, step, value, onInput) {
    var input = ui.el('input', {
      type: 'range',
      class: 'm-np-range',
      role: 'slider',
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(value),
      'aria-label': label
    });
    input.addEventListener('input', function () {
      onInput(Number(input.value));
    });
    return input;
  }

  /* ------------------------------------------------------------ 视图 */

  M.views.nowplaying = {
    title: '正在播放',

    render: function () {
      alive = true;
      var frag = document.createDocumentFragment();

      var top = ui.el('div', { class: 'm-np-top' });
      var collapse = ui.el('button', {
        class: 'm-np-collapse',
        type: 'button',
        'aria-label': '收起'
      }, '收起');
      collapse.addEventListener('click', function () { M.back(); });
      top.appendChild(collapse);
      frag.appendChild(top);

      var body = ui.el('div', { class: 'm-np-body' });
      frag.appendChild(body);

      /* ------------------------------------------------ 空状态 */

      var empty = ui.el('div', { class: 'm-np-empty' });
      empty.appendChild(ui.el('div', { class: 'm-np-empty-title' }, '还没有在放什么'));
      empty.appendChild(ui.el('p', { class: 'm-np-empty-note' }, '去主页或资料库挑一首，这里就会亮起来'));
      var goHome = ui.el('button', {
        class: 'm-btn m-btn-primary',
        type: 'button',
        'aria-label': '去主页挑歌'
      }, '去主页');
      goHome.addEventListener('click', function () {
        M.state.history = [];
        M.state.view = { type: 'home' };
        M.render();
      });
      empty.appendChild(goHome);
      body.appendChild(empty);

      /* ------------------------------------------------ 正常态 */

      var live = ui.el('div', { class: 'm-np-live', hidden: 'hidden' });

      // 舞台：封面与歌词面板叠在一起，点封面切到歌词、再点切回
      var stage = ui.el('div', { class: 'm-np-stage' });

      var coverBtn = ui.el('button', {
        class: 'm-np-cover-btn',
        type: 'button',
        'aria-label': '查看歌词'
      });
      var cover = ui.cover({ url: null, alt: '封面', className: 'm-np-cover', size: 500, eager: true });
      coverBtn.appendChild(cover);
      stage.appendChild(coverBtn);

      var lyricPanel = ui.el('div', { class: 'm-lyrics', role: 'region', 'aria-label': '歌词' });
      stage.appendChild(lyricPanel);

      live.appendChild(stage);

      var title = ui.el('div', { class: 'm-np-title' });
      var artist = ui.el('div', { class: 'm-np-artist' });
      var album = ui.el('div', { class: 'm-np-album' });
      live.appendChild(title);
      live.appendChild(artist);
      live.appendChild(album);

      // 进度
      var timeRow = ui.el('div', { class: 'm-np-time' });
      var posText = ui.el('span', { class: 'm-np-time-now' }, '0:00');
      var lenText = ui.el('span', { class: 'm-np-time-total' }, '0:00');
      var prog = slider('进度', 0, 100, 1, 0, function (v) {
        if (M.player) M.player.seek(v);
      });
      timeRow.appendChild(posText);
      timeRow.appendChild(lenText);
      live.appendChild(timeRow);
      live.appendChild(prog);

      // 主控制
      var row = ui.el('div', { class: 'm-np-controls' });
      var prev = controlButton('上一首', '⏮', function () { if (M.player) M.player.prev(); });
      var play = controlButton('播放', '▶', function () { if (M.player) M.player.toggle(); });
      play.classList.add('m-np-btn-main');
      var next = controlButton('下一首', '⏭', function () { if (M.player) M.player.next(); });
      row.appendChild(prev);
      row.appendChild(play);
      row.appendChild(next);
      live.appendChild(row);

      // 音量（上游在窄屏下把它整个藏了，这里补回落点）
      var volRow = ui.el('div', { class: 'm-np-aux' });
      volRow.appendChild(ui.el('span', { class: 'm-np-aux-label' }, '音量'));
      var vol = slider('音量', 0, 1, 0.01, 0.9, function (v) {
        if (M.player) M.player.setVolume(v);
      });
      volRow.appendChild(vol);
      live.appendChild(volRow);

      // 音质 + 队列
      var auxRow = ui.el('div', { class: 'm-np-aux' });
      var qualityBtn = ui.el('button', {
        class: 'm-btn m-np-quality',
        type: 'button',
        'aria-label': '音质'
      }, '音质');
      qualityBtn.addEventListener('click', function () {
        if (!M.player) return;
        var cur = M.player.state().requestedQuality || 'standard';
        var i = QUALITY_ORDER.indexOf(cur);
        var nextQ = QUALITY_ORDER[(i + 1) % QUALITY_ORDER.length];
        M.player.setQuality(nextQ);
      });
      auxRow.appendChild(qualityBtn);

      var queueBtn = ui.el('button', {
        class: 'm-btn',
        type: 'button',
        'aria-label': '队列'
      }, '队列');
      queueBtn.addEventListener('click', function () {
        M.nav({ type: 'queue' });
      });
      auxRow.appendChild(queueBtn);

      var lyricBtn = ui.el('button', {
        class: 'm-btn m-np-lyric-btn',
        type: 'button',
        'aria-label': '查看歌词',
        'aria-pressed': 'false'
      }, '歌词');
      lyricBtn.addEventListener('click', function () { toggleLyrics(); });
      auxRow.appendChild(lyricBtn);

      // 播放模式：顺序 → 单曲循环 → 列表循环 → 随机
      var REPEAT_LABEL = {
        off: '顺序',
        one: '单曲循环',
        all: '列表循环',
        shuffle: '随机'
      };
      var REPEAT_CYCLE = ['off', 'one', 'all', 'shuffle'];
      var repeatBtn = ui.el('button', {
        class: 'm-btn m-np-repeat-btn',
        type: 'button',
        'aria-label': '播放模式'
      }, '顺序');
      repeatBtn.addEventListener('click', function () {
        if (!M.player) return;
        var cur = M.player.state().repeat || 'off';
        var i = REPEAT_CYCLE.indexOf(cur);
        var nextMode = REPEAT_CYCLE[(i + 1) % REPEAT_CYCLE.length];
        M.player.setRepeat(nextMode);
      });
      auxRow.appendChild(repeatBtn);

      // 加入歌单：正在听的这一首
      var addBtn = ui.el('button', {
        class: 'm-btn',
        type: 'button',
        'aria-label': '加入歌单'
      }, '加入歌单');
      addBtn.addEventListener('click', function () {
        var snap = M.player ? M.player.state() : null;
        if (!snap || !snap.track) {
          if (M.shell) M.shell.toast('现在没有在放什么');
          return;
        }
        M.actions.addToPlaylist(snap.track);
      });
      auxRow.appendChild(addBtn);

      live.appendChild(auxRow);

      var qualityNote = ui.el('div', { class: 'm-np-quality-note' });
      live.appendChild(qualityNote);

      body.appendChild(live);

      /* ------------------------------------------------ 歌词 */

      // 歌词状态：按曲目 id 缓存，切歌才重新取
      var lyricState = {
        trackId: null,
        kind: 'none',
        lines: [],
        activeIndex: -1,
        mode: 'cover',      // cover | lyrics
        loading: false,
        error: null
      };
      var lyricToken = 0;

      function toggleLyrics() {
        lyricState.mode = lyricState.mode === 'cover' ? 'lyrics' : 'cover';
        applyLyricMode();
      }

      function applyLyricMode() {
        var on = lyricState.mode === 'lyrics';
        live.classList.toggle('m-lyrics-mode', on);
        lyricBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        lyricBtn.setAttribute('aria-label', on ? '返回封面' : '查看歌词');
        lyricBtn.textContent = on ? '封面' : '歌词';
        coverBtn.setAttribute('aria-label', on ? '返回封面' : '查看歌词');
        if (on) {
          // 进歌词视图时把当前行滚到中间
          tickLyrics();
          scrollToActive(true);
        }
      }

      /** 取歌词（同一首歌只取一次）。 */
      function loadLyrics(trackId) {
        if (!trackId) {
          lyricState.trackId = null;
          lyricState.lines = [];
          lyricState.kind = 'none';
          renderLyrics();
          return;
        }
        if (lyricState.trackId === trackId) return;
        lyricState.trackId = trackId;
        lyricState.loading = true;
        lyricState.error = null;
        lyricState.lines = [];
        lyricState.kind = 'none';
        renderLyrics();

        var token = ++lyricToken;
        Promise.resolve(M.service && M.service.lyric ? M.service.lyric(trackId) : null)
          .then(function (r) {
            if (token !== lyricToken || !alive) return;
            lyricState.loading = false;
            if (!r || r.ok !== true) {
              lyricState.error = r || { message: '歌词获取失败' };
              renderLyrics();
              return;
            }
            var built = M.lyrics.build(r.data || {});
            lyricState.kind = built.kind;
            lyricState.lines = built.lines;
            lyricState.activeIndex = -1;
            renderLyrics();
          })
          .catch(function () {
            if (token !== lyricToken || !alive) return;
            lyricState.loading = false;
            lyricState.error = { message: '歌词获取失败' };
            renderLyrics();
          });
      }

      /** 把歌词画出来。 */
      function renderLyrics() {
        lyricPanel.textContent = '';

        if (lyricState.loading) {
          lyricPanel.appendChild(ui.el('div', { class: 'm-lyrics-note' }, '正在加载歌词…'));
          return;
        }
        if (lyricState.error) {
          lyricPanel.appendChild(ui.el('div', { class: 'm-lyrics-note' }, '歌词加载失败'));
          return;
        }
        if (!lyricState.lines.length) {
          lyricPanel.appendChild(ui.el('div', { class: 'm-lyrics-note' }, '暂无歌词'));
          return;
        }

        lyricState.lines.forEach(function (ln, i) {
          var row = ui.el('div', { class: 'm-lyric-line' });
          row.setAttribute('data-time', String(ln.time));
          row.setAttribute('data-index', String(i));

          if (ln.words && ln.words.length) {
            var wrap = ui.el('span', { class: 'm-lyric-words' });
            ln.words.forEach(function (w) {
              var s = ui.el('span', { class: 'm-lyric-word' }, w.text);
              s.setAttribute('data-t', String(w.t));
              s.setAttribute('data-d', String(w.d));
              wrap.appendChild(s);
            });
            row.appendChild(wrap);
          } else {
            row.appendChild(ui.el('span', { class: 'm-lyric-text' }, ln.text));
          }

          if (ln.translation) {
            row.appendChild(ui.el('div', { class: 'm-lyric-tr' }, ln.translation));
          }
          lyricPanel.appendChild(row);
        });
      }

      /** 当前行滚到中间（only when asked）。 */
      function scrollToActive(force) {
        if (lyricState.activeIndex < 0) return;
        var row = lyricPanel.querySelector('.m-lyric-line[data-index="' + lyricState.activeIndex + '"]');
        if (!row || !row.scrollIntoView) return;
        try {
          row.scrollIntoView({ block: 'center', behavior: force ? 'auto' : 'smooth' });
        } catch (_) {
          row.scrollIntoView(false);
        }
      }

      /**
       * 每帧刷新歌词：当前行高亮 + 逐字扫光。
       * 逐字用「行内进度」实现：已唱部分实色、未唱部分压暗。
       */
      function tickLyrics() {
        if (!alive || !M.player) return;
        // 歌词视图不在屏幕上时不做任何逐帧计算（省电、也不跟转场抢 CPU）
        if (lyricState.mode !== 'lyrics') return;
        if (!lyricState.lines.length) return;
        var snap = M.player.state();
        var t = snap ? (snap.position || 0) : 0;
        var idx = M.lyrics.activeIndex(lyricState.lines, t);

        if (idx !== lyricState.activeIndex) {
          var prev = lyricPanel.querySelector('.m-lyric-line.is-current');
          if (prev) prev.classList.remove('is-current');
          lyricState.activeIndex = idx;
          var row = idx >= 0
            ? lyricPanel.querySelector('.m-lyric-line[data-index="' + idx + '"]')
            : null;
          if (row) row.classList.add('is-current');
          if (idx >= 0) scrollToActive(false);
        }

        // 逐字扫光：只动当前行的词
        var cur = lyricPanel.querySelector('.m-lyric-line.is-current');
        if (!cur) return;
        var words = cur.querySelectorAll('.m-lyric-word');
        if (!words.length) return;
        for (var i = 0; i < words.length; i++) {
          var el = words[i];
          var wt = Number(el.getAttribute('data-t'));
          var wd = Number(el.getAttribute('data-d'));
          var p = wd > 0 ? (t - wt) / wd : (t >= wt ? 1 : 0);
          p = Math.max(0, Math.min(1, p));
          el.style.setProperty('--p', (p * 100).toFixed(1) + '%');
        }
      }

      var lyricRafLocal = null;
      function loopLyrics() {
        tickLyrics();
        lyricRafLocal = requestAnimationFrame(loopLyrics);
      }
      if (lyricRaf) { cancelAnimationFrame(lyricRaf); lyricRaf = null; }
      lyricRaf = lyricRafLocal;

      coverBtn.addEventListener('click', function () { toggleLyrics(); });
      applyLyricMode();
      loopLyrics();

      /* ------------------------------------------------ 刷新 */

      var dragging = false;
      prog.addEventListener('pointerdown', function () { dragging = true; });
      prog.addEventListener('pointerup', function () { dragging = false; });

      function paint(snap) {
        if (!alive) return;
        snap = snap || (M.player ? M.player.state() : null);
        if (!snap) return;

        var has = !!snap.track;
        empty.hidden = has;
        live.hidden = !has;
        if (!has) return;

        ui.setCover(cover, snap.cover, 500);
        cover.setAttribute('alt', (snap.trackName || '曲目') + ' 封面');

        // 换歌了就把歌词换掉（同一首歌只取一次）
        loadLyrics(snap.track && snap.track.id);

        title.textContent = snap.trackName || '';
        artist.textContent = snap.artist || '';
        album.textContent = snap.album || '';

        var dur = Math.max(0, Math.round(snap.duration || 0));
        var pos = Math.max(0, Math.round(snap.position || 0));
        posText.textContent = ui.formatDuration(pos * 1000);
        lenText.textContent = ui.formatDuration(dur * 1000);
        if (!dragging) {
          prog.max = String(Math.max(1, dur));
          prog.value = String(Math.min(pos, dur));
          prog.setAttribute('aria-valuetext',
            ui.formatDuration(pos * 1000) + ' / ' + ui.formatDuration(dur * 1000));
        }

        play.setAttribute('aria-label', snap.playing ? '暂停' : '播放');
        play.textContent = snap.playing ? '❚❚' : '▶';

        vol.value = String(snap.volume != null ? snap.volume : 0.9);

        // 音质：选的和实际生效的都摆出来（降级要看得见）
        var req = snap.requestedQuality;
        var eff = snap.quality;
        qualityBtn.textContent = '音质 · ' + qualityName(eff || req);
        if (req && eff && req !== eff) {
          qualityNote.textContent = '你选了「' + qualityName(req) + '」，实际放的是「' +
            qualityName(eff) + '」';
        } else {
          qualityNote.textContent = '';
        }

        // 播放模式：顺序 / 单曲循环 / 列表循环 / 随机
        var rm = snap.repeat || 'off';
        repeatBtn.textContent = REPEAT_LABEL[rm] || '顺序';
        repeatBtn.setAttribute('aria-label', '播放模式 · ' + (REPEAT_LABEL[rm] || '顺序'));
        repeatBtn.classList.toggle('is-on', rm !== 'off');
      }

      // 订阅播放引擎的状态变化：界面跟着刷新，不手动回来
      if (unsubscribe) { try { unsubscribe(); } catch (_) {} }
      unsubscribe = (M.player && M.player.subscribe)
        ? M.player.subscribe(paint)
        : null;

      paint();

      return frag;
    },

    leave: function () {
      alive = false;
      if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
      if (lyricRaf) { try { cancelAnimationFrame(lyricRaf); } catch (_) {} lyricRaf = null; }
    }
  };

  /* ------------------------------------------------------------ 队列 */

  M.views.queue = {
    title: '播放队列',

    render: function () {
      alive = true;
      var frag = document.createDocumentFragment();
      frag.appendChild(ui.el('h1', { class: 'm-display' }, '播放队列'));
      frag.appendChild(ui.el('p', { class: 'm-section-note' }, 'queue'));

      var body = ui.el('div', { class: 'm-block-body' });
      frag.appendChild(body);

      function paint() {
        if (!alive) return;
        body.textContent = '';
        if (!M.player) {
          body.appendChild(ui.emptyNote('没有可显示的队列'));
          return;
        }
        var snap = M.player.state();
        var items = M.player.queueItems();

        if (!items.length) {
          body.appendChild(ui.emptyNote('队列是空的'));
          return;
        }

        // 下一首播放（插播）单独一栏
        var nextList = snap.playNextLength || 0;
        if (nextList) {
          body.appendChild(ui.el('div', { class: 'm-np-note' }, '下一首播放 · ' + nextList + ' 首'));
        }

        var ul = ui.el('ul', { class: 'm-list', role: 'list', 'aria-label': '播放队列' });
        items.forEach(function (t, i) {
          ul.appendChild(ui.trackRow({
            track: t,
            index: i,
            onClick: function () { M.player.playQueue(items, i); }
          }));
        });
        body.appendChild(ul);

        body.appendChild(ui.el('div', { class: 'm-more' },
          '点任意一首即可切到那首播放'));
      }

      if (unsubscribe) { try { unsubscribe(); } catch (_) {} }
      unsubscribe = (M.player && M.player.subscribe)
        ? M.player.subscribe(paint)
        : null;
      paint();

      return frag;
    },

    leave: function () {
      alive = false;
      if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
    }
  };
})(window.Mobile = window.Mobile || {});
