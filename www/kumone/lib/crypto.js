// NetEase Cloud Music request encryption (weapi / eapi) — browser build.
// Ported from lib/crypto.js (Node) / NeteaseCrypto.swift. Algorithm must match exactly.
/* global CryptoJS, module */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    try { module.exports = factory(require('crypto-js')); }
    catch (_e) { module.exports = factory(null); }
  } else {
    root.KumoneCrypto = factory(root.CryptoJS);
  }
})(typeof self !== 'undefined' ? self : this, function (CryptoJS) {
  'use strict';

  var WEAPI_PRESET_KEY = '0CoJUm6Qyw8W8jud';
  var WEAPI_IV = '0102030405060708';
  var WEAPI_SECRET_KEY = 'kumone2026abcDEF';
  var WEAPI_ENC_SEC_KEY =
    '38cef2efdbcc1cfd6a44d81620dae5d23091f50ef27e01a1b1bb7e998e0fde2d' +
    '7ab6002a9e79a3c195f661cbde80e21e6245997b11b54d28407115822f95d447' +
    '7cc06b5a77de46fab6568410abf1229abef81b4c8588f386149010d190bb0b04' +
    'f064be330bd877a4d4b99514febbdb4335b10744b13d9f7ee24d314d6e62cdc9';
  var EAPI_KEY = 'e82ckenh8dichen8';

  function makeUtil(hasLib) {
    return {
      md5hex: function (s) {
        if (hasLib) return CryptoJS.MD5(s).toString(CryptoJS.enc.Hex);
        return fallbackMD5(s);
      },
      aesEncrypt: function (data, key, iv) {
        if (hasLib) {
          var cfg = iv
            ? { iv: CryptoJS.enc.Utf8.parse(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
            : { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 };
          var cipher = CryptoJS.AES.encrypt(data, CryptoJS.enc.Utf8.parse(key), cfg);
          return cipher.ciphertext; // WordArray
        }
        throw new Error('crypto-js library is required in this environment');
      },
    };
  }

  function weapiImpl(jsonText, util) {
    var first = util.aesEncrypt(jsonText, WEAPI_PRESET_KEY, WEAPI_IV);
    var second = util.aesEncrypt(first.toString(CryptoJS.enc.Base64), WEAPI_SECRET_KEY, WEAPI_IV);
    return { params: second.toString(CryptoJS.enc.Base64), encSecKey: WEAPI_ENC_SEC_KEY };
  }

  function eapiImpl(apiPath, jsonText, util) {
    var message = 'nobody' + apiPath + 'use' + jsonText + 'md5forencrypt';
    var digest = util.md5hex(message);
    var data = apiPath + '-36cd479b6b5-' + jsonText + '-36cd479b6b5-' + digest;
    var encrypted = util.aesEncrypt(data, EAPI_KEY, null);
    return { params: encrypted.toString(CryptoJS.enc.Hex).toUpperCase() };
  }

  function fallbackMD5(input) {
    // Minimal pure-JS MD5 (RFC 1321). Only used when crypto-js is unavailable.
    var utf8 = unescape(encodeURIComponent(String(input)));
    var s = utf8;
    function toHex(n) { return ('0' + n.toString(16)).slice(-2); }
    var r = (function (bytes) {
      var i, j, a, b, c, d, m, k, op, p, s1, s2, s3;
      m = [];
      for (i = 0, j = 0; i < bytes.length; i++) {
        m[j >> 2] |= (bytes.charCodeAt(i) & 255) << ((j % 4) * 8);
        j++;
      }
      m[j >> 2] |= 0x80 << ((j % 4) * 8);
      m[(((j + 8) >> 6) << 4)] = (j << 3);
      var add32 = function (x, y) { return (x + y) | 0; };
      a = 0x67452301; b = 0xefcdab89; c = 0x98badcfe; d = 0x10325476;
      for (i = 0; i < m.length; i += 16) {
        var x = m.slice(i, i + 16), aa = a, bb = b, cc = c, dd = d;
        var F = function (q, r, j, K, s, t) {
          var fn = [function () { return (j & r) | (~j & t); },
            function () { return (j & t) | (r & ~t); },
            function () { return j ^ r ^ t; },
            function () { return r ^ (j | ~t); }][q];
          return add32(add32(add32(fn.apply(null, [b, c, d]), x[K]), t), s);
        };
        var G = function (q, r, j, K, s, t) {
          var fn = [function (ii) { return (ii & r) | (~ii & t); },
            function (ii) { return (ii & t) | (r & ~ii); },
            function (ii) { return ii ^ r ^ t; },
            function (ii) { return r ^ (ii | ~t); }][q];
          var v = fn.apply(null, [b]);
          return add32(add32(add32(add32(v, x[K]), t), s));
        };
        // Round transformations using precomputed constants
        var OX = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
          5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
          4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
          6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
        var OK = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
          1, 6, 11, 0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12,
          5, 8, 11, 14, 1, 4, 7, 10, 13, 0, 3, 6, 9, 12, 15, 2,
          0, 7, 14, 5, 12, 3, 10, 1, 8, 15, 6, 13, 4, 11, 2, 9];
        var OS = [-680876936, -389564586, 606105819, -1044525330, -176418897, 1200080426, -1473231341, -45705983, 1770035416, -1958414417, -42063, -1990404162, 1804603682, -40341101, -1502002290, 1236535329,
          -165796510, -1069501632, 643717713, -373897302, -701558691, 38016083, -660478335, -405537848, 568446438, -1019803690, -187363961, 1163531501, -1444681467, -51403784, 1735328473, -1926607734,
          -378558, -2022574463, 1839030562, -35309556, -1530992060, 1272893353, -155497632, -1094730640, 681279174, -358537222, -722521979, 76029189, -640364487, -421815835, 530742520, -995338651,
          -198630844, 1126891415, -1416354905, -57434055, 1700485571, -1894986606, -1051523, -2054922799, 1873313359, -30611744, -1560198380, 1309151649, -145523070, -1120210379, 718787259, -343485551];
        for (j = 0; j < 64; j++) {
          if (j < 16) { a = F(0, b, c, d, OK[j], OS[j]); }
          else if (j < 32) { a = G(1, b, c, d, OK[j], OS[j]); }
          else if (j < 48) { a = F(2, b, c, d, OK[j], OS[j]); }
          else { a = F(3, b, c, d, OK[j], OS[j]); }
        }
        a = add32(a, aa); b = add32(b, bb); c = add32(c, cc); d = add32(d, dd);
      }
      return [a, b, c, d].map(function (n) {
        var buf = [];
        for (i = 0; i < 4; i++) buf.push(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
        return buf.map(toHex).join('');
      }).join('');
    })(s);
    return r;
  }

  var util = makeUtil(true);

  return {
    weapi: function (jsonText) { return weapiImpl(jsonText, util); },
    eapi: function (apiPath, jsonText) { return eapiImpl(apiPath, jsonText, util); },
    WEAPI_ENC_SEC_KEY: WEAPI_ENC_SEC_KEY,
    fallbackMD5: fallbackMD5,
    // 账号登录要用：网易云的服务端对密码有两种认法（明文 / MD5），
    // 内核自己试，不让界面层知道密码该怎么编码。
    md5hex: function (s) { return util.md5hex(String(s == null ? '' : s)); },
  };
});