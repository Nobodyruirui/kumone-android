/* 从原型的搜索页开始。所有输入、滚动和点击均通过本次快照的语义目标。 */
(() => {
  'use strict';

  const page = { role: 'region', name: '当前页面' };
  const mini = { role: 'region', name: '迷你播放条' };
  const results = { role: 'list', name: '搜索结果' };
  const queue = { role: 'list', name: '播放队列' };
  const keyword = '潮汐';
  const title = '沿岸公路';
  const artist = '潮间带';
  const row = '播放 ' + title + ' · ' + artist;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function nodes() {
    return KumoneLearnings.locator.parseTree(Mobile.snapshot().tree);
  }

  function unique(role, name, scope, tree = nodes()) {
    const matches = KumoneLearnings.locator.findMatches(tree, { roles: [role], name, scope });
    assert(matches.length === 1, role + '「' + name + '」匹配到 ' + matches.length + ' 个目标');
    return matches[0];
  }

  function act(node, action, args) {
    const receipt = Mobile.act(node.ref, action, args);
    assert(receipt.ok, receipt.message);
  }

  function subtree(scope) {
    const node = unique(scope.role, scope.name);
    return Mobile.snapshot({ scope: 'subtree', root: node.ref }).tree;
  }

  function songs(scope) {
    return KumoneLearnings.locator.scopeRange(nodes(), scope)
      .filter(node => node.role === 'button' && node.name.startsWith('播放 '))
      .map(node => node.name);
  }

  async function until(label, test) {
    const deadline = performance.now() + 5000;
    do {
      if (test()) return;
      await delay(40);
    } while (performance.now() < deadline);
    throw new Error('等待超时：' + label);
  }

  // 路由先同步视图名，再异步移除旧页。动作只落在已完成转场的页面上。
  async function settled(view) {
    await until(view, () => window.Mobile?.state?.view?.type === view &&
      document.getElementById('m-view')?.childElementCount > 0 &&
      !document.getElementById('m-view-prev')?.classList.contains('is-active'));
  }

  async function run(report) {
    await settled('search');
    const main = document.getElementById('m-main');
    act(unique('textbox', '搜索关键词', page), 'fill', { text: keyword });
    await until('固定搜索联想', () => nodes().some(node =>
      node.role === 'button' && node.name === '单曲 天光'));
    act(unique('button', '搜索', page), 'click');
    await until('16 首搜索结果', () => songs(results).length === 16);
    const originalSongs = songs(results);
    const target = unique('button', row, results);
    act(target, 'focus');
    act(target, 'scroll', { top: 420 });
    report.scrollBefore = main.scrollTop;
    assert(report.scrollBefore > 0, '搜索页需要非零滚动位置');

    const focus = document.activeElement;
    const player = JSON.stringify(Mobile.player.state());
    const requests = KumoneFixture.requestCount();
    const first = Mobile.snapshot().tree;
    const second = Mobile.snapshot().tree;
    assert(first === second, '重复观察改变了语义树或控件 ref');
    assert(document.activeElement === focus && main.scrollTop === report.scrollBefore &&
      JSON.stringify(Mobile.player.state()) === player && KumoneFixture.requestCount() === requests,
      '观察改变了焦点、滚动、播放状态或请求计数');
    report.steps.push('搜索到 16 首；重复快照一致，焦点、位置、播放状态和请求数稳定');

    act(unique('button', row, results), 'click');
    await until('所选曲目开始播放', () => {
      const state = Mobile.player.state();
      return state.trackName === title && state.playing;
    });
    const playingMini = nodes();
    unique('text', title, mini, playingMini);
    unique('text', artist, mini, playingMini);
    unique('image', title + ' 封面', mini, playingMini);
    unique('button', '暂停', mini, playingMini);
    report.snapshots.mini = subtree(mini);
    // 记录真正离开页面时的位置，防止点歌本身改变浏览位置而漏检。
    assert(main.scrollTop === report.scrollBefore, '点播改变了搜索位置');
    act(unique('button', '打开播放页', mini), 'click');
    await settled('nowplaying');
    const full = nodes();
    unique('text', title, page, full);
    unique('text', artist, page, full);
    unique('image', title + ' 封面', page, full);
    act(unique('button', '暂停', page, full), 'click');
    await until('暂停', () => !Mobile.player.state().playing);
    unique('button', '播放', page);
    report.snapshots.paused = subtree(page);
    report.steps.push('迷你条与全屏均显示沿岸公路、潮间带和封面；暂停后按钮变为播放');

    const collapse = unique('button', '收起', page);
    const unsupported = Mobile.act(collapse.ref, 'unknown-action');
    report.unsupported = { code: unsupported.code, next: unsupported.next };
    assert(!unsupported.ok && unsupported.code === 'KUMONE_UNSUPPORTED' && unsupported.next,
      '未知动作缺少预期的错误码或恢复提示');
    act(unique('button', '队列', page), 'click');
    await settled('queue');
    const queuedSongs = songs(queue);
    assert(JSON.stringify(queuedSongs) === JSON.stringify(originalSongs) &&
      queuedSongs[7] === row && queuedSongs[8] === '播放 雾灯 · ' + artist,
      '队列与原结果或下一首不符');
    const stale = Mobile.act(collapse.ref, 'click');
    report.stale = { code: stale.code, next: stale.next };
    assert(!stale.ok && stale.code === 'KUMONE_STALE_REF' && stale.next,
      '已离开全屏播放页的 ref 缺少预期的错误码或恢复提示');
    act(unique('button', '返回'), 'click');
    await settled('nowplaying');
    report.steps.push('16 首队列顺序一致，下一首为雾灯；旧 ref 失效，重取快照可返回');
    act(unique('button', '收起', page), 'click');
    await settled('search');
    unique('button', '播放', mini);
    report.queryAfter = document.getElementById('m-view').querySelector('input[type="search"]')?.value;
    report.songCountAfter = songs(results).length;
    report.scrollAfter = main.scrollTop;
    assert(report.queryAfter === keyword && JSON.stringify(songs(results)) === JSON.stringify(originalSongs),
      '返回后的关键词或结果顺序发生变化');
    assert(Mobile.player.state().trackName === title && !Mobile.player.state().playing,
      '返回后的曲目或暂停状态发生变化');
    assert(Math.abs(report.scrollBefore - report.scrollAfter) <= 1,
      '返回后搜索位置变化：' + report.scrollBefore + ' → ' + report.scrollAfter + ' px');
    report.steps.push('收起后保留关键词、全部结果及顺序、暂停状态和原滚动位置');
  }

  let active;
  const check = window.KumonePrototypeCheck = {
    run() {
      if (active) return active;
      const report = { status: 'PENDING', viewport: [innerWidth, innerHeight], steps: [], snapshots: {} };
      check.result = report;
      document.documentElement.dataset.result = report.status;
      active = run(report).then(() => { report.status = 'PASS'; }, error => {
        report.status = 'FAIL';
        report.error = error.message;
      }).then(() => {
        document.documentElement.dataset.result = report.status;
        active = null;
        return report;
      });
      return active;
    }
  };

  if (new URLSearchParams(location.search).get('check') === '1') check.run();
})();
