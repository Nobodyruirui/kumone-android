/* 步骤 02 原型：展开播放器时，保留正在浏览的那一页搜索结果。 */
(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('baseline') === '1') return;

  const render = Mobile.render;
  let search = null;

  Mobile.render = function (options = {}) {
    const view = Mobile.state.view;
    const main = document.getElementById('m-main');
    const region = document.getElementById('m-view');

    if (options.from?.type === 'search' && view.type === 'nowplaying') {
      search = { view: options.from, region, top: main.scrollTop };
      // 两个页面共用外壳。保留搜索 DOM 让已发出的请求仍能就地回填。
      const playerRegion = region.cloneNode(false);
      region.removeAttribute('id');
      region.hidden = true;
      region.after(playerRegion);
      render();
      main.scrollTop = 0;
      return;
    }

    if (search && view === search.view) {
      region.remove();
      search.region.id = 'm-view';
      search.region.hidden = false;
      Mobile.shell.sync(view, Mobile.views.search);
      main.scrollTop = search.top;
      search = null;
      return;
    }

    if (search && !Mobile.state.history.includes(search.view)) {
      search.region.remove();
      search = null;
    }
    render(options);
  };
})();
