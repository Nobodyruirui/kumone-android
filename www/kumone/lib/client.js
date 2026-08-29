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
  NeteaseClient.prototype.perform = function (url, form) {
    var self = this;
    var body = encodeForm(form);
    var headers = {
      'User-Agent': USER_AGENT,
      'Referer': 'https://music.163.com',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': this.cookieHeader({ os: 'pc', appver: '3.1.17' }),
    };

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
    }

    // Plain browser path (used for local testing / PWA).
    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: body,
      signal: AbortSignal.timeout(15000),
    }).then(function (res) {
      self.absorbSetCookies(res);
      if (!res.ok) {
        var e = new Error('网络错误 (' + res.status + ')');
        e.httpStatus = res.status;
        throw e;
      }
      return res.text();
    });
  };

  NeteaseClient.prototype.weapi = function (path, payload) {
    payload = payload || {};
    var body = Object.assign({}, payload, { csrf_token: this.cookies['__csrf'] || '' });
    var form = ncrypto.weapi(JSON.stringify(body));
    var fullPath = path;
    var csrf = this.cookies['__csrf'];
    if (csrf) fullPath += (fullPath.indexOf('?') !== -1 ? '&' : '?') + 'csrf_token=' + csrf;
    return this.perform('https://music.163.com/weapi' + fullPath, form);
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
    return this.perform('https://interface.music.163.com/eapi' + path, form);
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
  };
});