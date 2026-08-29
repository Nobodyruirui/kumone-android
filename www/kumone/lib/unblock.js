// Native reimplementation of UnblockNeteaseMusic core providers — browser build.
// Ported from lib/unblock.js. Provider order: 1. pyncmd 2. kuwo 3. kugou.
/* global module, CryptoJS */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    try { module.exports = factory(require('crypto-js')); }
    catch (_e) { module.exports = factory(null); }
  } else {
    root.KumoneUnblock = factory(root.CryptoJS);
  }
})(typeof self !== 'undefined' ? self : this, function (CryptoJS) {
  'use strict';

  function get(urlString, userAgent) {
    userAgent = userAgent || 'Mozilla/5.0';
    return fetch(urlString, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(10000) })
      .then(function (res) { return res.ok ? res.text() : null; })
      .catch(function () { return null; });
  }

  function getJSON(url) {
    return get(url).then(function (text) {
      if (!text) return null;
      try { return JSON.parse(text); } catch (_e) { return null; }
    });
  }

  function keyword(track) {
    return (track.name + ' ' + (track.artists && track.artists[0] ? track.artists[0].name : '')).trim();
  }

  function selectMatch(list, durationMS) {
    var match = list.slice(0, 5).find(function (s) { return s.durationMS > 0 && Math.abs(s.durationMS - durationMS) < 5000; });
    return match || list[0];
  }

  function pyncmd(track) {
    return getJSON('https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=' + track.id + '&br=320')
      .then(function (obj) {
        if (!obj || !(obj.br > 0) || typeof obj.url !== 'string') return null;
        return obj.url.replace(/^http:/, 'https:');
      });
  }

  function kuwo(track) {
    var query = encodeURIComponent(keyword(track));
    var searchURL = 'http://search.kuwo.cn/r.s?&correct=1&vipver=1&stype=comprehensive&encoding=utf8'
      + '&rformat=json&mobi=1&show_copyright_off=1&searchapi=6&all=' + query;
    return getJSON(searchURL).then(function (obj) {
      var content = obj && obj.content;
      if (!Array.isArray(content) || content.length < 2) return null;
      var abslist = content[1].musicpage && content[1].musicpage.abslist;
      if (!Array.isArray(abslist) || !abslist.length) return null;
      var songs = [];
      for (var i = 0; i < abslist.length; i++) {
        var musicrid = abslist[i]['MUSICRID'];
        if (typeof musicrid !== 'string') continue;
        var rid = musicrid.split('_').pop();
        var duration = parseInt(abslist[i]['DURATION'] || '0', 10) || 0;
        songs.push({ rid: rid, durationMS: duration * 1000 });
      }
      var match = selectMatch(songs, track.durationMS);
      if (!match) return null;
      var convertURL = 'http://antiserver.kuwo.cn/anti.s?type=convert_url&format=mp3&response=url&rid=MUSIC_' + match.rid;
      return get(convertURL, 'okhttp/3.10.0').then(function (text) {
        if (!text) return null;
        var m = text.match(/http[^\s$"]+/);
        return m ? m[0] : null;
      });
    });
  }

  function md5hex(s) {
    return CryptoJS ? CryptoJS.MD5(s).toString(CryptoJS.enc.Hex) : '';
  }

  function kugou(track) {
    var query = encodeURIComponent(keyword(track));
    var searchURL = 'http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=' + query + '&page=1&pagesize=10';
    return getJSON(searchURL).then(function (obj) {
      var info = obj && obj.data && obj.data.info;
      if (!Array.isArray(info) || !info.length) return null;
      var songs = info.map(function (item) {
        return {
          hash: item.hash,
          albumID: String(item.album_id || 0),
          durationMS: (item.duration || 0) * 1000,
        };
      }).filter(function (s) { return typeof s.hash === 'string'; });
      var match = selectMatch(songs, track.durationMS);
      if (!match) return null;
      var key = md5hex(match.hash + 'kgcloudv2');
      var trackURL = 'http://trackercdn.kugou.com/i/v2/?key=' + key + '&hash=' + match.hash
        + '&appid=1005&pid=2&cmd=25&behavior=play&album_id=' + match.albumID;
      return getJSON(trackURL).then(function (obj2) {
        var urls = obj2 && obj2.url;
        return Array.isArray(urls) && urls.length ? urls[0] : null;
      });
    });
  }

  function resolve(track) {
    if (typeof track.id !== 'number' || !track.name) return Promise.resolve(null);
    return pyncmd(track).then(function (pyn) {
      if (pyn) return { url: pyn, source: 'pyncmd' };
      return kuwo(track).then(function (kw) {
        if (kw) return { url: kw, source: '酷我音乐' };
        return kugou(track).then(function (kg) {
          if (kg) return { url: kg, source: '酷狗音乐' };
          return null;
        });
      });
    });
  }

  return { resolve: resolve };
});