/* =============================================================
 * 知识包 · 网易云 · 定位器内核（tools/locator.js）
 * -------------------------------------------------------------
 * 稳定定位的唯一合法形式是 role + name。
 *   - 不用快照里的短标识：界面一重建就失效
 *   - 不用像素坐标：分辨率一变就错
 *   - 不用 DOM id 选择器：id 属于实现细节，不属于界面契约
 *
 * 语义来源是 Mobile.snapshot() 的无障碍文本树（与 core/snapshot.js 同一投影），
 * 所以定位到的节点自带这一次快照里的短标识，可以直接交给动作层。
 *
 * 本文件是知识包的内部构件（helper），不是对外工具；
 * 它同时提供 Node 与浏览器两种加载方式，因为校验器要在 Node 里真的 require 它。
 * ============================================================= */
(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    // Node：校验器要真的 require 这份模块
    module.exports = factory();
  } else {
    // 浏览器：挂到全局，工具模块按 manifest 的 loadOrder 取用
    root.KumoneLearnings = root.KumoneLearnings || {};
    var api = factory();
    root.KumoneLearnings.locator = api;
    root.KumoneLearnings.netease = root.KumoneLearnings.netease || {};
    root.KumoneLearnings.netease.locator = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------- 错误契约 */

  // 与 core/errors.js 同构的码表。工具在 Node 侧自持一份，不依赖浏览器全局。
  var TITLES = {
    KUMONE_EMPTY_RESULT: '没有结果',
    KUMONE_NOT_FOUND: '对象不存在',
    KUMONE_AMBIGUOUS_TARGET: '目标不唯一',
    KUMONE_UNSUPPORTED: '功能未实现',
    KUMONE_STALE_REF: '引用已过期'
  };

  /** 构造一个契约错误（五要素：期望签名 / 当前状态 / 候选 / 阻塞原因 / 下一步）。 */
  function fail(code, parts) {
    parts = parts || {};
    var title = TITLES[code] || '失败';
    var lines = [title];
    if (parts.expected) lines.push('Expected: ' + parts.expected);
    if (parts.state) lines.push('State: ' + parts.state);
    if (parts.candidates && parts.candidates.length) {
      lines.push('Candidates: ' + parts.candidates.slice(0, 3).join(' | '));
    }
    if (parts.cause) lines.push('Blocked by: ' + parts.cause);
    if (parts.next) lines.push('Next: ' + parts.next);
    return {
      ok: false,
      code: code,
      kind: 'permanent',
      title: title,
      message: lines.join('\n'),
      expected: parts.expected || null,
      state: parts.state || null,
      candidates: parts.candidates || null,
      cause: parts.cause || null,
      next: parts.next || null
    };
  }

  /** 构造一个成功结果。 */
  function ok(data) {
    var r = { ok: true };
    if (data) {
      Object.keys(data).forEach(function (k) { r[k] = data[k]; });
    }
    return r;
  }

  /* ------------------------------------------------------- 环境探测 */

  /** 取当前环境里的 Mobile 模型接口（浏览器有，Node 校验器环境没有）。 */
  function mobile() {
    var g = typeof globalThis !== 'undefined' ? globalThis : null;
    return (g && g.Mobile) ? g.Mobile : null;
  }

  /** 当前视图类型（home / library / playlist ...）。 */
  function currentView() {
    var M = mobile();
    if (!M || !M.state || !M.state.view) return null;
    return M.state.view.type || null;
  }

  /* ------------------------------------------------------- 语义树解析 */

  var META_RE = /\s+\[([^\]]*)\]\s*$/;
  var HEAD_RE = /^(\s*)([a-z][a-z0-9-]*)(?:\s+"([\s\S]*)")?$/;
  var REF_IN_META = /ref=([^,\s\]]+)/;

  /**
   * 把无障碍文本树解析成扁平的节点表。
   * 每行形如 `button "播放" [ref=<快照标识>, current]`，这里只取语义部分与快照标识。
   */
  function parseTree(tree) {
    var out = [];
    var lines = String(tree || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      if (!raw.trim()) continue;

      var meta = null;
      var mm = META_RE.exec(raw);
      if (mm) {
        meta = mm[1];
        raw = raw.slice(0, mm.index);
      }

      var hm = HEAD_RE.exec(raw.replace(/\s+$/, ''));
      if (!hm) continue;   // 例如快照头部那行上下文，不是一个节点

      var node = {
        role: hm[2],
        name: hm[3] == null ? '' : hm[3],
        depth: hm[1].length,
        line: i + 1,
        ref: null,
        current: false,
        disabled: false
      };

      if (meta) {
        var rm = REF_IN_META.exec(meta);
        if (rm) node.ref = rm[1];
        if (/current/.test(meta)) node.current = true;
        if (/disabled/.test(meta)) node.disabled = true;
      }
      out.push(node);
    }
    return out;
  }

  /** 取某节点的子孙节点（按缩进层级判定）。 */
  function descendants(nodes, node) {
    var out = [];
    if (!node) return out;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n === node) continue;
      if (n.line <= node.line) continue;
      if (n.depth <= node.depth) break;
      out.push(n);
    }
    return out;
  }

  /** 取某节点所属区块的无障碍名（最近的祖先 region）。 */
  function sectionOf(nodes, node) {
    if (!node) return null;
    for (var i = nodes.length - 1; i >= 0; i--) {
      var n = nodes[i];
      if (n.line >= node.line) continue;
      if (n.depth >= node.depth) continue;
      if (n.role === 'region' || n.role === 'navigation') return n.name || null;
    }
    return null;
  }

  /* ------------------------------------------------------- 匹配 */

  function nameMatches(haystack, needle, mode) {
    var a = String(haystack == null ? '' : haystack);
    var b = String(needle == null ? '' : needle);
    if (!b) return false;
    if (mode === 'contains') return a.indexOf(b) >= 0;
    return a === b;
  }

  /** 把节点表限定在某个区块内（区块节点本身不计入结果）。 */
  function scopeRange(nodes, scope) {
    if (!scope) return nodes.slice();
    var out = [];
    var depth = -1;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (depth < 0) {
        if (n.role === scope.role && nameMatches(n.name, scope.name, 'exact')) depth = n.depth;
        continue;
      }
      if (n.depth <= depth) break;
      out.push(n);
    }
    return out;
  }

  /**
   * 按 role + name 匹配节点。
   * @param {Array} nodes  parseTree 的结果
   * @param {object} spec  { roles, name, match, scope }
   */
  function findMatches(nodes, spec) {
    spec = spec || {};
    var pool = scopeRange(nodes || [], spec.scope);
    var roles = spec.roles && spec.roles.length ? spec.roles : null;
    var mode = spec.match || 'exact';
    var out = [];
    for (var i = 0; i < pool.length; i++) {
      var n = pool[i];
      if (roles && roles.indexOf(n.role) < 0) continue;
      if (!nameMatches(n.name, spec.name, mode)) continue;
      out.push(n);
    }
    return out;
  }

  /** 列出候选名称，用于歧义与未命中时的提示。 */
  function candidateNames(nodes, limit) {
    var out = [];
    var roles = ['listitem', 'link', 'button', 'heading', 'text'];
    for (var i = 0; i < (nodes || []).length && out.length < (limit || 5); i++) {
      var n = nodes[i];
      if (roles.indexOf(n.role) < 0) continue;
      if (!n.name) continue;
      out.push(n.role + ' "' + n.name + '"');
    }
    return out;
  }

  /* ------------------------------------------------------- 快照与动作 */

  /** 取一次语义快照的文本树；取不到返回 null。 */
  async function snapshotTree() {
    var M = mobile();
    if (!M || typeof M.snapshot !== 'function') return null;
    var res = M.snapshot();
    if (!res || res.ok === false) return null;
    if (typeof res.tree !== 'string') return null;
    return res.tree;
  }

  /**
   * 对一个已经按 role+name 命中的节点执行动作。
   * 动作层自己会返回契约错误（例如界面在快照之后被重建），这里原样透出。
   */
  async function act(node, action, args) {
    var M = mobile();
    if (!M || typeof M.act !== 'function') {
      return fail('KUMONE_UNSUPPORTED', {
        expected: 'await act(node, "' + (action || 'click') + '")',
        state: '当前环境没有 Mobile 动作层',
        cause: 'window.Mobile 不存在',
        next: '在应用内调用；Node 里只做加载自检'
      });
    }
    if (!node || !node.ref) {
      return fail('KUMONE_STALE_REF', {
        expected: 'await act(node, "' + (action || 'click') + '")',
        state: '命中的节点没有快照标识',
        cause: '节点可能不是可交互元素',
        next: '重新取一次快照再匹配'
      });
    }
    var res = M.act(node.ref, action || 'click', args || {});
    if (res && res.ok === false) return res;
    return ok({ action: action || 'click', role: node.role, name: node.name });
  }

  return {
    fail: fail,
    ok: ok,
    mobile: mobile,
    currentView: currentView,
    parseTree: parseTree,
    descendants: descendants,
    sectionOf: sectionOf,
    scopeRange: scopeRange,
    findMatches: findMatches,
    candidateNames: candidateNames,
    snapshotTree: snapshotTree,
    act: act
  };
});
