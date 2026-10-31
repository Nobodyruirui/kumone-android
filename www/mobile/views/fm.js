/* =============================================================
 * 广播（私人 FM）
 * -------------------------------------------------------------
 * FM 是「一直放下去」的形态：给一首，播完再要下一首。
 * 所以这一屏的核心不是列表，是**一个当前曲目 + 两个动作**：
 *
 *   下一首    换一首（重新向服务端要）
 *   不喜欢    扔掉这首（fmTrash），然后换
 *
 * 语义与上游一致：未登录时提示登录，登录后可听。
 * 角色色用「自动」（蓝）—— 它是服务端自动推的，不是我的、也不是策展的。
 * ============================================================= */
(function (M) {
  'use strict';

  var ui = M.ui;

  var FM_ROLE = 'auto';

  M.views.fm = {
    title: '广播',

    render: function () {
      var frag = document.createDocumentFragment();
      frag.appendChild(ui.el('h1', { class: 'm-display' }, '广播'));
      frag.appendChild(ui.el('p', { class: 'm-section-note' }, 'continuous radio'));

      var body = ui.el('div', { class: 'm-block-body' });
      frag.appendChild(body);

      var current = [];   // 当前这一批
      var index = 0;      // 当前播到第几首

      function loading() {
        body.textContent = '';
        body.setAttribute('aria-busy', 'true');
        body.appendChild(ui.skeleton(2, '正在获取广播'));
      }

      function paintError(err) {
        body.textContent = '';
        body.setAttribute('aria-busy', 'false');
        if (ui.LOGIN_CODES[err.code]) {
          body.appendChild(ui.loginCard({
            note: '私人 FM 需要登录后才有内容',
            onLogin: function () { M.actions.toLogin({ view: 'fm' }); }
          }));
          return;
        }
        body.appendChild(ui.errorCard(err, { onRetry: load }));
      }

      /** 取一批 FM。 */
      function load() {
        loading();
        Promise.resolve(M.service.personalFM()).then(function (r) {
          if (!body.isConnected) return;
          body.setAttribute('aria-busy', 'false');
          if (!r || r.ok !== true) {
            paintError(r || M.errors.make('KUMONE_NETWORK', { cause: '服务层没有返回结果' }));
            return;
          }
          current = r.data || [];
          index = 0;
          if (!current.length) {
            body.textContent = '';
            body.appendChild(ui.emptyNote('FM 暂时没有内容，稍后再试试'));
            return;
          }
          paint();
        }).catch(function (e) {
          if (!body.isConnected) return;
          paintError(M.errors.make('KUMONE_NETWORK', {
            expected: 'await service.personalFM()',
            state: '获取广播时抛了异常',
            cause: (e && e.message) || String(e),
            next: '重试一次'
          }));
        });
      }

      function paint() {
        body.textContent = '';
        var track = current[index];
        if (!track) return;

        // 当前曲目的大卡
        var card = ui.el('div', { class: 'm-card m-fm-card', role: 'group', 'aria-label': '当前广播' });
        card.setAttribute('data-role', FM_ROLE);
        var cover = ui.cover({
          url: track.album && track.album.picUrl,
          alt: (track.name || '曲目') + ' 封面',
          className: 'm-fm-cover',
          size: 300,
          eager: true
        });
        card.appendChild(cover);
        var info = ui.el('div', { class: 'm-fm-info' });
        info.appendChild(ui.el('div', { class: 'm-fm-name' }, track.name || ''));
        var who = ui.artistNames(track);
        if (who) info.appendChild(ui.el('div', { class: 'm-fm-artist' }, who));
        if (track.album && track.album.name) {
          info.appendChild(ui.el('div', { class: 'm-tile-sub' }, track.album.name));
        }
        card.appendChild(info);
        body.appendChild(card);

        // 两个动作
        var actions = ui.el('div', { class: 'm-fm-actions' });
        var nextBtn = ui.el('button', {
          class: 'm-btn m-btn-primary',
          type: 'button',
          'aria-label': '下一首'
        }, '下一首');
        nextBtn.addEventListener('click', function () { load(); });
        actions.appendChild(nextBtn);

        var trashBtn = ui.el('button', {
          class: 'm-btn',
          type: 'button',
          'aria-label': '不喜欢这首'
        }, '不喜欢');
        trashBtn.addEventListener('click', function () {
          Promise.resolve(M.service.fmTrash(track.id)).then(function (r) {
            if (M.shell) M.shell.toast(r && r.ok ? '已扔进垃圾桶' : '没能扔掉');
            load();
          });
        });
        actions.appendChild(trashBtn);
        body.appendChild(actions);

        // 这一批的其余曲目
        if (current.length > 1) {
          body.appendChild(ui.el('div', { class: 'm-fm-note' }, '接下来'));
          var list = ui.el('ul', { class: 'm-list', role: 'list', 'aria-label': '广播曲目' });
          current.forEach(function (t, i) {
            list.appendChild(ui.trackRow({
              track: t,
              index: i,
              onClick: function () {
                index = i;
                M.actions.playTracks(current, i);
                paint();
              }
            }));
          });
          body.appendChild(list);
        }
      }

      load();

      return frag;
    }
  };
})(window.Mobile = window.Mobile || {});
