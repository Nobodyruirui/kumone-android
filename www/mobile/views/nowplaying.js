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

      var cover = ui.el('img', { class: 'm-np-cover', alt: '封面' });
      live.appendChild(cover);

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
      live.appendChild(auxRow);

      var qualityNote = ui.el('div', { class: 'm-np-quality-note' });
      live.appendChild(qualityNote);

      body.appendChild(live);

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

        if (snap.cover) cover.setAttribute('src', snap.cover);
        else cover.removeAttribute('src');
        cover.setAttribute('alt', (snap.trackName || '曲目') + ' 封面');

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
