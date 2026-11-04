// Transport layer for NetEase Cloud Music — browser build.
// Ported from lib/client.js (Node). Cookie jar persists to localStorage.
// On Android (Capacitor) requests run through Capacitor.Http to bypass CORS;
// in a plain browser it falls back to fetch (for local testing / PWA).
/* global window, CryptoJS, module, localStorage */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root, require('./crypto'));
  } else {
    root.KumoneClient = factory(root, (root.KumoneClientCrypto || root.KumoneCrypto));
  }
})(typeof self !== 'undefined' ? self : this, function (root, ncrypto) {
  'use strict';

  var USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
  var STORE_KEY = 'kumone.cookies';

  /**
   * 开发期直连代理（桌面浏览器验收用）。
   *
   * 网易云的 weapi **不返回 Access-Control-Allow-Origin**，所以浏览器里的
   * fetch 会被 CORS 拦掉。安卓上靠自研的原生 HTTP 桥绕开；桌面浏览器里
   * 用 tools/relay.mjs 这个本地代理顶替（代理自己带 cookie）。
   *
   * 开关：页面地址加 `?relay=1`。默认关着，不影响安卓与正式构建。
   */
  function relayBase() {
    try {
      if (typeof location !== 'undefined' && /[?&]relay=1(&|$)/.test(location.search || '')) {
        return 'http://127.0.0.1:8123';
      }
    } catch (_e) {}
    return '';
  }

  /**
   * 请求地址：走代理时拼代理地址，否则直连上游域名。
   * @param {string} host 上游域名（代理按这个头转发）
   * @param {string} prefix 路径前缀（/weapi、/eapi）
   * @param {string} path 业务路径
   */
  function endpoint(host, prefix, path) {
    var relay = relayBase();
    if (!relay) return 'https://' + host + prefix + path;
    return relay + prefix + path;
  }

  function getStore() {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  }

  function loadCookies() {
    var s = getStore();
    if (!s) return {};
    try { return JSON.parse(s.getItem(STORE_KEY) || '{}'); } catch (_e) { return {}; }
  }

  function saveCookies(c) {
    var s = getStore();
    if (!s) return;
    try { s.setItem(STORE_KEY, JSON.stringify(c)); } catch (_e) {}
  }

  function encodeForm(obj) {
    return Object.keys(obj)
      .map(function (k) { return k + '=' + encodeURIComponent(obj[k]); })
      .join('&');
  }

  function parseCookieString(raw) {
    var parsed = {};
    String(raw || '').split(';;').forEach(function (cookie) {
      var pair = cookie.split(';')[0];
      var eq = pair.indexOf('=');
      if (eq <= 0) return;
      var name = pair.slice(0, eq).trim();
      var value = pair.slice(eq + 1).trim();
      if (name && value && value !== '""') parsed[name] = value;
    });
    return parsed;
  }

  function extractSetCookies(response) {
    var parsed = {};
    var raws = [];
    try {
      if (typeof response.headers.getSetCookie === 'function') raws = response.headers.getSetCookie();
      else if (response.headers.get) { var v = response.headers.get('set-cookie'); if (v) raws = [v]; }
    } catch (_e) {}
    raws.forEach(function (raw) { Object.assign(parsed, parseCookieString(raw)); });
    return parsed;
  }

  function NeteaseClient() {
    this.cookies = loadCookies();
  }

  NeteaseClient.prototype.isLoggedIn = function () {
    return Boolean(this.cookies['MUSIC_U']);
  };

  NeteaseClient.prototype.persist = function () {
    saveCookies(this.cookies);
  };

  NeteaseClient.prototype.setCookies = function (newCookies) {
    Object.assign(this.cookies, newCookies);
    this.persist();
  };

  NeteaseClient.prototype.ingestCookieString = function (raw) {
    var parsed = parseCookieString(raw);
    if (Object.keys(parsed).length) this.setCookies(parsed);
  };

  NeteaseClient.prototype.clearAuthCookies = function () {
    delete this.cookies['MUSIC_U'];
    delete this.cookies['__csrf'];
    this.persist();
  };

  NeteaseClient.prototype.cookieHeader = function (extra) {
    var all = Object.assign({}, this.cookies);
    for (var k in (extra || {})) if (all[k] === undefined) all[k] = extra[k];
    var parts = Object.keys(all).map(function (k) { return k + '=' + all[k]; });
    return parts.join('; ');
  };

  NeteaseClient.prototype.absorbSetCookies = function (response) {
    var parsed = extractSetCookies(response);
    if (Object.keys(parsed).length) this.setCookies(parsed);
  };

  /// Perform an HTTP request. Returns a Promise resolving to raw text.
  NeteaseClient.prototype.perform = function (url, form, upstreamHost) {
    var self = this;
    var body = encodeForm(form);
    var headers = {
      'User-Agent': USER_AGENT,
      'Referer': 'https://music.163.com',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': this.cookieHeader({ os: 'pc', appver: '3.1.17' }),
    };
    // 走本地代理时，告诉代理上游是谁（代理只绑 127.0.0.1，是开发工具）
    if (relayBase() && upstreamHost) headers['X-Kumone-Upstream'] = upstreamHost;

    // Android / Capacitor path: native HTTP bridge bypasses CORS.
    if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      var nativeHttp = null;
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.HTTPClient) nativeHttp = window.Capacitor.Plugins.HTTPClient;
      else if (window.CapacitorHttp) nativeHttp = window.CapacitorHttp;
      else if (window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) nativeHttp = window.Capacitor.Plugins.CapacitorHttp;
      if (nativeHttp && typeof nativeHttp.post === 'function') {
        return nativeHttp.post({ url: url, headers: headers, data: body, connectTimeout: 15000, readTimeout: 15000 })
          .then(function (res) {
            try {
              var setCookie = res && res.headers && (res.headers['set-cookie'] || res.headers['Set-Cookie']);
              if (setCookie) self.ingestCookieString(setCookie);
            } catch (_e) {}
            if (res && res.status && res.status >= 400) {
              var e = new Error('网络错误 (' + res.status + ')');
              e.httpStatus = res.status;
              throw e;
            }
            return (res && typeof res.data === 'string') ? res.data : String((res && res.data) || '');
          });
      }
      // 没有 CapacitorHttp 的 JS 封装时（这个项目就是），**fetch 才是主力**：
      // Capacitor 7 的原生桥在开启 `plugins.CapacitorHttp.enabled` 之后会
      // 把 window.fetch 换成原生实现 —— 于是下面这个 fetch 走的是原生 HTTP，
      // `Cookie` 请求头会被原样送到网易云（浏览器里那个头是会被丢掉的）。
    }

    // Plain browser path (used for local testing / PWA).
    //
    // 两个要点：
    //   1. `credentials: 'include'` —— 否则跨源请求既不存也不发网易云下发的
    //      MUSIC_U，登录态带不过去（实测浏览器路径必须靠它 + 浏览器 cookie 罐）。
    //   2. 超时用 AbortController 手搓：`AbortSignal.timeout()` 在被原生桥
    //      接管 fetch 时不生效，会让请求永远挂着。
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () { try { controller.abort(); } catch (_e) {} }, 15000);
    }
    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: body,
      credentials: 'include',
      signal: controller ? controller.signal : undefined,
    }).then(function (res) {
      self.absorbSetCookies(res);
      if (!res.ok) {
        var e = new Error('网络错误 (' + res.status + ')');
        e.httpStatus = res.status;
        throw e;
      }
      return res.text();
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  };

  NeteaseClient.prototype.weapi = function (path, payload) {
    payload = payload || {};
    var body = Object.assign({}, payload, { csrf_token: this.cookies['__csrf'] || '' });
    var form = ncrypto.weapi(JSON.stringify(body));
    var fullPath = path;
    var csrf = this.cookies['__csrf'];
    if (csrf) fullPath += (fullPath.indexOf('?') !== -1 ? '&' : '?') + 'csrf_token=' + csrf;
    return this.perform(endpoint('music.163.com', '/weapi', fullPath), form, 'music.163.com');
  };

  NeteaseClient.prototype.eapi = function (path, payload) {
    payload = payload || {};
    var apiPath = '/api' + path;
    var header = {
      os: 'pc',
      appver: '3.1.17',
      osver: 'Version 14.0 (Build 23A344)',
      deviceId: 'kumone',
      requestId: String(Math.floor(20000000 + Math.random() * 10000000)),
      clientSign: '',
      versioncode: '140',
      buildver: String(Math.floor(Date.now() / 1000)),
      resolution: '1920x1080',
      channel: '',
    };
    if (this.cookies['MUSIC_U']) header['MUSIC_U'] = this.cookies['MUSIC_U'];
    if (this.cookies['__csrf']) header['__csrf'] = this.cookies['__csrf'];
    var form = ncrypto.eapi(apiPath, JSON.stringify(Object.assign({}, payload, { header: header })));
    return this.perform(endpoint('interface.music.163.com', '/eapi', path), form, 'interface.music.163.com');
  };

  /// Decode a raw response string into JSON, surfacing business errors.
  NeteaseClient.prototype.decode = function (text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) {
      var de = new Error('数据解析失败');
      de.kind = 'decoding';
      throw de;
    }
    if (obj && typeof obj === 'object' && 'code' in obj && obj.code !== 200) {
      if (obj.code === 301) {
        var ne = new Error('需要登录');
        ne.kind = 'needLogin';
        throw ne;
      }
      var be = new Error(obj.message || obj.msg || ('接口错误 (' + obj.code + ')'));
      be.kind = 'business';
      be.code = obj.code;
      throw be;
    }
    return obj;
  };

  var client = new NeteaseClient();

  return {
    client: client,
    decode: function (bufOrText) { return client.decode(bufOrText); },
    USER_AGENT: USER_AGENT,
    md5hex: function (s) { return ncrypto.md5hex(s); },
  };
});