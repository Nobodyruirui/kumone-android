/* =============================================================
 * 桌面浏览器里的网络改道（只给试用/预览用，不进 App 打包）
 * -------------------------------------------------------------
 * 为什么需要它：
 *   桌面浏览器里，页面直接向 music.163.com 发请求会被 CORS 拦掉
 *   （安卓 App 走 Capacitor 原生 HTTP 桥，本来就没这问题）。
 *   以前只能靠启动浏览器时加 --disable-web-security 绕过去，
 *   那就绑死在某一个浏览器上。
 *
 * 做法：
 *   把 window.fetch 包一层 —— 只有发往网易云的请求改走本地中继，
 *   其余请求原样放行。中继补上 Referer / User-Agent 再转发。
 *
 * 关键点：
 *   **内核层零改动**。内核还是那个 fetch，只是出口换了个门。
 *   所以这个脚本只能注入到页面里（父页面给 iframe 注入），
 *   不能塞进 www/ 里的产品代码。
 *
 * 用法（注入到目标页面）：
 *   targetWindow.KUMONE_RELAY_BASE = 'http://127.0.0.1:8111';
 *   然后加载本脚本（见 tools/inject-relay.js）
 * ============================================================= */
(function () {
  'use strict';

  var base = window.KUMONE_RELAY_BASE || '';
  if (!base) return;
  if (window.__kumoneRelayInstalled) return;
  window.__kumoneRelayInstalled = true;

  var orig = window.fetch;
  var NETEASE = /^https?:\/\/([\w-]+\.)*163\.com(\/|$)/i;

  window.fetch = function (input, init) {
    var url = '';
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
    } catch (_) { url = ''; }
    if (NETEASE.test(url)) {
      return orig.call(this, base + '/proxy?url=' + encodeURIComponent(url), init);
    }
    return orig.apply(this, arguments);
  };
})();
