/* 占位页：广播 / 搜索 本轮不实装（见 spec 的 Out of Scope）。 */
(function (M) {
  'use strict';

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else n.setAttribute(k, attrs[k]);
      });
    }
    if (html != null) n.innerHTML = html;
    return n;
  }

  function coming(label, note, role) {
    return {
      title: label,
      render: function () {
        var frag = document.createDocumentFragment();
        frag.appendChild(el('h1', { class: 'm-display' }, label));
        frag.appendChild(el('p', { class: 'm-section-note' }, note));
        frag.appendChild(el('div', { class: 'm-empty' }, '「' + label + '」将在后续版本开放'));
        return frag;
      }
    };
  }

  M.views.fm = coming('广播', 'continuous radio', 'auto');
  M.views.search = coming('搜索', 'find anything', 'neutral');
})(window.Mobile = window.Mobile || {});
