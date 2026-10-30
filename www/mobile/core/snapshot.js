/* =============================================================
 * 移动端渲染层 · 模型可读界面（感知层 + 动作层）
 * -------------------------------------------------------------
 * 人读像素，模型读语义。这棵文本树是同一份 DOM 的另一种投影：
 *
 *   Mobile.snapshot()            → 当前界面的语义文本树（只读）
 *   Mobile.act(ref, action, args) → 对某个 ref 执行动作
 *
 * 规则（来自 ego 的界面设计理论，docs/adr/0003）：
 *   1. 语义来自无障碍树与 ARIA，不是自研 DOM 解析；因此 role/name 是契约。
 *   2. 观察是只读的：snapshot 不改变任何状态。
 *   3. ref 短、可粘贴、失效时给的是下一步动作而不是抱怨。
 *   4. 降噪可以折叠结构，但**永远不许删改非空文本**。
 * ============================================================= */
(function (M) {
  'use strict';

  /* ------------------------------------------------------- ref 体系 */

  var counter = 0;
  var ids = new WeakMap();      // element -> '@N'
  var live = new Map();         // '@N'   -> element

  /**
   * 分配或复用 ref。同一元素重复快照时 ref 保持不变。
   * **不往 DOM 写任何东西** —— 观察必须是只读的（见 docs/adr/0003）。
   */
  function refFor(el) {
    var existing = ids.get(el);
    if (existing) return existing;
    counter += 1;
    var id = '@' + counter;
    ids.set(el, id);
    live.set(id, el);
    return id;
  }

  /** 解析 ref；过期时给出"下一步该干什么"，而不是一句抱怨。 */
  function resolve(ref) {
    var id = String(ref || '').trim();
    if (!id.startsWith('@')) id = '@' + id;
    var el = live.get(id);
    if (!el || !el.isConnected) {
      live.delete(id);
      return M.errors.make('KUMONE_STALE_REF', {
        expected: 'Mobile.act("' + id + '", "click")',
        state: '引用 ' + id + ' 已不在当前界面上',
        cause: '界面在快照之后被重建',
        next: '重新取一次快照：Mobile.snapshot()'
      });
    }
    return null;
  }

  /* --------------------------------------------------- 语义抽取 */

  // 标签 → 无障碍角色
  var ROLE = {
    HEADER: 'banner', NAV: 'navigation', MAIN: 'main', SECTION: 'region',
    ASIDE: 'complementary', FOOTER: 'contentinfo', H1: 'heading', H2: 'heading',
    H3: 'heading', UL: 'list', OL: 'list', LI: 'listitem', BUTTON: 'button',
    A: 'link', IMG: 'image', INPUT: 'textbox', SELECT: 'combobox',
    TEXTAREA: 'textbox', FORM: 'form', ARTICLE: 'article', DIALOG: 'dialog'
  };

  // 可交互角色：值得拿到 ref
  var INTERACTIVE = { button: 1, link: 1, textbox: 1, combobox: 1, checkbox: 1, radio: 1, switch: 1, slider: 1 };

  function roleOf(el) {
    var explicit = el.getAttribute('role');
    if (explicit) return explicit;
    return ROLE[el.tagName] || null;
  }

  function isHidden(el) {
    if (el.hasAttribute('hidden')) return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    var style = window.getComputedStyle(el);
    if (!style) return false;
    return style.display === 'none' || style.visibility === 'hidden';
  }

  // 容器角色：名字只能来自 ARIA，不能来自子树文本
  var CONTAINER_ROLE = { main: 1, navigation: 1, region: 1, banner: 1, contentinfo: 1, list: 1, form: 1, article: 1, complementary: 1 };

  // 无障碍名：aria-label > aria-labelledby
  function explicitName(el) {
    var label = el.getAttribute('aria-label');
    if (label) return label.trim();
    var by = el.getAttribute('aria-labelledby');
    if (by) {
      var target = document.getElementById(by);
      if (target) return (target.textContent || '').trim();
    }
    if (el.tagName === 'IMG') return (el.getAttribute('alt') || '').trim();
    return '';
  }

  // 自身的直接文本（不含子树）
  function ownTextOf(el) {
    var t = '';
    for (var j = 0; j < el.childNodes.length; j++) {
      var n = el.childNodes[j];
      if (n.nodeType === 3) {
        var v = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
        if (v) t += v + ' ';
      }
    }
    return t.trim();
  }

  function truncate(s, max) {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  // 用于回执里显示的名字（容器也允许回退到文本，仅用于展示）
  function displayName(el) {
    return truncate(explicitName(el) || ownTextOf(el), 60);
  }

  function isCurrent(el) {
    if (el.getAttribute('aria-current')) return true;
    return el.classList.contains('active') || el.classList.contains('current');
  }

  /**
   * 把一棵 DOM 子树抽成语义节点数组。
   * 折叠规则：无名且无子节点的容器删除；无名且只有一个子节点的容器用子节点替换自身。
   * 红线：任何非空文本都不被删改。
   */
  function extract(el, depth, out) {
    if (isHidden(el)) return null;

    var role = roleOf(el);
    var explicit = explicitName(el);
    var interactive = role && INTERACTIVE[role];
    var children = [];

    var childNodes = el.children || [];
    for (var i = 0; i < childNodes.length; i++) {
      var child = extract(childNodes[i], depth + 1, children);
      if (child) children.push(child);
    }

    var ownText = ownTextOf(el);

    // 名字：容器角色只认 ARIA；其余可用自身文本
    var name = explicit;
    if (!name && role && !CONTAINER_ROLE[role]) name = ownText;
    if (!name && !role && !children.length) name = ownText;

    var isContainer = !role && children.length > 0;
    if (isContainer) {
      if (!children.length) return null;             // 空容器：删除
      if (children.length === 1 && !name) return children[0];  // 单子节点：用子节点替换自身
    }

    if (!role && !name && !children.length) return null;

    var node = { role: role || (name ? 'text' : null), name: truncate(name, 60), children: children };

    if (interactive || node.role === 'text' || (role && name)) {
      node.ref = refFor(el);
    }
    if (isCurrent(el)) node.current = true;
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') node.disabled = true;

    return node;
  }

  /* ------------------------------------------------------- 渲染输出 */

  function renderNode(node, depth, lines) {
    if (!node) return;
    var indent = '  '.repeat(depth);
    var head = node.role || 'node';
    if (node.name) head += ' "' + node.name.replace(/"/g, "'") + '"';
    var meta = [];
    if (node.ref) meta.push('ref=' + node.ref);
    if (node.current) meta.push('current');
    if (node.disabled) meta.push('disabled');
    if (meta.length) head += ' [' + meta.join(', ') + ']';
    lines.push(indent + head);
    (node.children || []).forEach(function (c) { renderNode(c, depth + 1, lines); });
  }

  /**
   * 取当前界面的语义快照。
   * @param {object} opts { scope: 'full' | 'subtree', root: '@N' }
   */
  function snapshot(opts) {
    opts = opts || {};
    // 根取 body：底部导航与迷你播放条挂在 body 上，不在 #m-app 内，
    // 取 #m-app 会让模型看不到它们。
    var root = document.body;

    if (opts.scope === 'subtree' && opts.root) {
      var err = resolve(opts.root);
      if (err) return err;
      var target = live.get('@' + String(opts.root).replace(/^@/, ''));
      var sub = extract(target, 0, []);
      var lines = [];
      renderNode(sub, 0, lines);
      return { ok: true, scope: 'subtree', root: opts.root, tree: lines.join('\n') };
    }

    var children = [];
    var tree = extract(root, 0, children);
    var lines = [];
    // 清理已离开界面的 ref，保持映射有界
    live.forEach(function (el, id) { if (!el.isConnected) live.delete(id); });
    // 上下文头：像 ego 的 snapshot header 一样带上当前状态
    var view = M.state && M.state.view ? M.state.view.type : 'unknown';
    lines.push('[view "' + view + '" | refs live]');
    renderNode(tree, 0, lines);
    return { ok: true, scope: 'full', tree: lines.join('\n') };
  }

  /* ------------------------------------------------------- 动作层 */

  var ACTIONS = {
    click: function (el) { el.click(); },
    scroll: function (el, args) {
      var target = el.closest('#m-main') || el;
      var top = (args && args.top) || 0;
      target.scrollTop = top;
    },
    focus: function (el) { el.focus(); },
    // 往可填写元素里写字。搜索页要能被模型驱动，没有它就只剩「点」这一种动作。
    fill: function (el, args) {
      var tag = (el.tagName || '').toUpperCase();
      var inputType = (el.getAttribute && el.getAttribute('type') || 'text').toLowerCase();
      var editable = tag === 'TEXTAREA' || el.isContentEditable === true ||
        (tag === 'INPUT' && ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].indexOf(inputType) >= 0);
      if (!editable) {
        // 注意：<button> 也有 value 属性，不能拿 'value' in el 当判据
        throw new Error('这个元素不是可填写的输入框');
      }
      el.value = (args && args.text != null) ? String(args.text) : '';
      // 触发 input/change，界面上的联想与结果才会跟着更新
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  /**
   * 对一个 ref 执行动作。
   * 只允许白名单动作；不存在的能力直接报"功能未实现"，不静默忽略。
   */
  function act(ref, action, args) {
    var err = resolve(ref);
    if (err) return err;

    var id = '@' + String(ref).replace(/^@/, '');
    var el = live.get(id);
    var fn = ACTIONS[action];
    if (!fn) {
      return M.errors.make('KUMONE_UNSUPPORTED', {
        expected: 'Mobile.act("' + id + '", "' + (action || 'click') + '")',
        state: '动作 ' + action + ' 不在白名单内',
        cause: '可用动作：' + Object.keys(ACTIONS).join(' / '),
        next: '改用白名单内的动作'
      });
    }
    try {
      fn(el, args || {});
    } catch (e) {
      return M.errors.make('KUMONE_UNSUPPORTED', {
        expected: 'Mobile.act("' + id + '", "' + action + '")',
        state: '动作执行失败',
        cause: (e.message || String(e)) + '；可用动作：' + Object.keys(ACTIONS).join(' / '),
        next: '重新取快照确认元素状态'
      });
    }
    return { ok: true, action: action, ref: id, role: roleOf(el), name: displayName(el) };
  }

  M.snapshot = snapshot;
  M.act = act;
  M.refs = { resolve: resolve, refFor: refFor };
})(window.Mobile = window.Mobile || {});
