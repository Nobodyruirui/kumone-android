/* =============================================================
 * 知识包 · 网易云 · 歌单定位工具（tools/playlist.js）
 * -------------------------------------------------------------
 * 能力：按名称打开一个歌单。
 * 定位走 role+name：先在语义树里命中，再把命中的节点交给动作层。
 * 本文件不出现任何临时引用，也不使用 DOM id 选择器做定位。
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
    ns.openPlaylistByName = api.openPlaylistByName;
    ns.listPlaylists = api.listPlaylists;
    ns.playlist = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (locator) {
  'use strict';

  // 歌单类元素在语义树里可能承担的角色
  var CARD_ROLES = ['listitem', 'link', 'button'];

  /**
   * 按名称打开一个歌单。
   * @param {string} name 歌单名称（与语义树里的无障碍名精确匹配）
   * @param {object} options 可选：{ scope: '为你推荐' } 限定区块
   * @returns {Promise<object>} 结构化结果
   */
  async function openPlaylistByName(name, options) {
    var opts = options || {};
    var target = typeof name === 'string' ? name.trim() : '';
    var expected = 'await openPlaylistByName("' + (target || '歌单名称') + '")';

    if (!target) {
      return locator.fail('KUMONE_EMPTY_RESULT', {
        expected: expected,
        state: '没有给出歌单名称',
        cause: '参数 name 为空',
        next: '传入歌单名称；先用 listPlaylists() 看看当前界面上有哪些候选'
      });
    }

    var tree = await locator.snapshotTree();
    if (!tree) {
      return locator.fail('KUMONE_UNSUPPORTED', {
        expected: expected,
        state: '取不到语义快照',
        cause: '当前环境没有 Mobile 感知层',
        next: '在应用内调用；Node 里只做加载自检'
      });
    }

    var nodes = locator.parseTree(tree);
    // 主页上的歌单卡的无障碍名是「歌单 <名字>」（类型前缀让模型一眼看出这是歌单），
    // 而调用方给的通常是光秃秃的歌单名 —— 两种写法都试一遍。
    var spec = { roles: CARD_ROLES, name: target, match: 'exact' };
    if (opts.scope) spec.scope = { role: 'region', name: opts.scope };

    var hits = locator.findMatches(nodes, spec);
    if (!hits.length) {
      var prefixed = { roles: CARD_ROLES, name: '歌单 ' + target, match: 'exact' };
      if (opts.scope) prefixed.scope = { role: 'region', name: opts.scope };
      hits = locator.findMatches(nodes, prefixed);
    }

    if (!hits.length) {
      return locator.fail('KUMONE_NOT_FOUND', {
        expected: expected,
        state: '当前界面上没有名为「' + target + '」的歌单',
        candidates: locator.candidateNames(nodes, 5),
        cause: '语义树里按 role+name 没有命中',
        next: '先切到含歌单的区块再重试；或用 listPlaylists() 列出候选'
      });
    }

    if (hits.length > 1) {
      return locator.fail('KUMONE_AMBIGUOUS_TARGET', {
        expected: expected,
        state: '命中 ' + hits.length + ' 个同名元素',
        candidates: hits.map(function (h) { return h.role + ' "' + h.name + '"'; }),
        cause: 'role+name 匹配到多个目标',
        next: '用 options.scope 限定区块，或换一个更具体的名称'
      });
    }

    var hit = hits[0];
    var acted = await locator.act(hit, 'click');
    if (!acted.ok) return acted;

    return locator.ok({
      name: target,
      role: hit.role,
      section: locator.sectionOf(nodes, hit),
      view: locator.currentView(),
      action: 'click'
    });
  }

  /**
   * 列出当前界面上可点的歌单/卡片类元素（role+name 视角）。
   * @param {object} options 可选：{ scope: '为你推荐' } 限定区块
   */
  async function listPlaylists(options) {
    var opts = options || {};
    var expected = 'await listPlaylists()';

    var tree = await locator.snapshotTree();
    if (!tree) {
      return locator.fail('KUMONE_UNSUPPORTED', {
        expected: expected,
        state: '取不到语义快照',
        cause: '当前环境没有 Mobile 感知层',
        next: '在应用内调用；Node 里只做加载自检'
      });
    }

    var nodes = locator.parseTree(tree);
    var scope = opts.scope ? { role: 'region', name: opts.scope } : null;
    var pool = locator.scopeRange(nodes, scope);

    var items = [];
    for (var i = 0; i < pool.length; i++) {
      var n = pool[i];
      if (CARD_ROLES.indexOf(n.role) < 0) continue;
      if (!n.name) continue;
      items.push({ name: n.name, role: n.role, section: locator.sectionOf(nodes, n) });
    }

    return locator.ok({ items: items, count: items.length, view: locator.currentView() });
  }

  return {
    openPlaylistByName: openPlaylistByName,
    listPlaylists: listPlaylists
  };
});
