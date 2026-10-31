// Kumone for Android — bridge layer.
// Replaces the Electron preload/IPC (window.kumone) with an in-page implementation
// that talks directly to the browser kernel. Provides exactly the same surface as
// preload.js so renderer/app.js needs no changes.
/* global window, document, QRCode, KumoneAPI, KumoneUnblock */
'use strict';
(function () {
  var API = window.KumoneAPI;
  var VERSION = '0.1.4';
  var UPSTREAM_RELEASES = 'https://github.com/missuo/kumone/releases';

  // Channel -> API call mapping (mirrors main.js CHANNELS).
  var dispatch = {
    cellphoneLogin: function (a) { return API.cellphoneLogin(a.phone, a.password); },
    qrKey: function () { return API.qrKey(); },
    qrCheck: function (a) { return API.qrCheck(a.key); },
    logout: function () { return API.logout(); },
    refreshLogin: function () { return API.refreshLogin(); },
    userAccount: function () { return API.userAccount(); },
    isLoggedIn: function () { return Promise.resolve(API.client.isLoggedIn()); },
    userPlaylists: function (a) { return API.userPlaylists(a.uid); },
    likedTrackIDs: function (a) { return API.likedTrackIDs(a.uid); },
    likeTrack: function (a) { return API.likeTrack(a.id, a.like); },
    likedAlbums: function () { return API.likedAlbums(); },
    likedArtists: function () { return API.likedArtists(); },
    playRecords: function (a) { return API.playRecords(a.uid, a.week); },
    cloudSongs: function () { return API.cloudSongs(); },
    cloudDelete: function (a) { return API.cloudDelete(a.id); },
    personalizedPlaylists: function () { return API.personalizedPlaylists(); },
    recommendResource: function () { return API.recommendResource(); },
    dailyRecommendSongs: function () { return API.dailyRecommendSongs(); },
    playlistDetail: function (a) { return API.playlistDetail(a.id); },
    toplists: function () { return API.toplists(); },
    highQualityPlaylists: function (a) { return API.highQualityPlaylists('全部', 12, a.before || 0); },
    newAlbums: function () { return API.newAlbums('ALL', 12); },
    personalizedNewSongs: function () { return API.personalizedNewSongs(12); },
    songDetails: function (a) { return API.songDetails(a.ids); },
    songURL: function (a) { return API.songURL([a.id], a.level).then(function (d) { return (d && d[0]) || null; }); },
    lyric: function (a) { return API.lyric(a.id); },
    search: function (a) { return API.search(a.keywords, a.type, a.limit, a.offset); },
    searchSuggest: function (a) { return API.searchSuggest(a.keywords); },
    searchDefaultKeyword: function () { return API.searchDefaultKeyword(); },
    album: function (a) { return API.album(a.id); },
    albumDynamic: function (a) { return API.albumDynamic(a.id); },
    artist: function (a) { return API.artist(a.id); },
    artistAlbums: function (a) { return API.artistAlbums(a.id); },
    similarSongs: function (a) { return API.similarSongs(a.id); },
    similarArtists: function (a) { return API.similarArtists(a.id); },
    topArtists: function (a) { return API.topArtists(a.limit || 100); },
    subscribePlaylist: function (a) { return API.subscribePlaylist(a.id, a.subscribe); },
    subscribeAlbum: function (a) { return API.subscribeAlbum(a.id, a.subscribe); },
    subscribeArtist: function (a) { return API.subscribeArtist(a.id, a.subscribe); },
    createPlaylist: function (a) { return API.createPlaylist(a.name, a.isPrivate); },
    deletePlaylist: function (a) { return API.deletePlaylist(a.id); },
    playlistTracks: function (a) { return API.playlistTracks(a.op, a.playlistID, a.trackIDs); },
    scrobble: function (a) { return API.scrobble(a.trackID, a.sourceID, a.seconds); },
    intelligenceList: function (a) { return API.intelligenceList(a.songID, a.playlistID); },
    personalFM: function () { return API.personalFM(); },
    fmTrash: function (a) { return API.fmTrash(a.id); },
    unblock: function (a) { return window.KumoneUnblock ? window.KumoneUnblock.resolve(a.track) : Promise.resolve(null); },
    // Non-NetEase helpers.
    qrImage: function (a) { return qrImage(a.text); },
    checkUpdate: function () { return checkUpdate(); },
    openReleases: function () { try { window.open(UPSTREAM_RELEASES, '_blank'); } catch (_e) {} return Promise.resolve(true); },
    copyText: function (a) { return copyText(a.text); },
  };

  function makeError(e) {
    e = e || new Error('未知错误');
    return { ok: false, error: e.message || String(e), kind: e.kind || null, code: e.code || null };
  }

  /// Emulate the IPC round-trip: every call resolves to { ok, data } or { ok:false, ... }.
  function invoke(channel, args) {
    var fn = dispatch[channel];
    if (!fn) return Promise.reject({ ok: false, error: '未知指令: ' + channel });
    try {
      return Promise.resolve(fn(args || {}))
        .then(function (data) { return { ok: true, data: data }; })
        .catch(function (e) { return makeError(e); });
    } catch (e) {
      return Promise.resolve(makeError(e));
    }
  }

  // QR data URL via bundled qrcode (global QRCode). Falls back to SVG if canvas fails.
  function qrImage(text) {
    return new Promise(function (resolve, reject) {
      var t = String(text || '');
      function viaSvg() {
        try {
          QRCode.toString(t, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }, function (err, svg) {
            if (err || !svg) { reject(err || new Error('二维码生成失败')); return; }
            resolve('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
          });
        } catch (e) { reject(e); }
      }
      try {
        QRCode.toDataURL(t, { width: 240, margin: 1, errorCorrectionLevel: 'M' }, function (err, url) {
          if (err || !url || url.length === 0) { viaSvg(); return; }
          resolve(url);
        });
      } catch (e) { viaSvg(); }
    });
  }

  function checkUpdate() {
    return fetch('https://api.github.com/repos/missuo/kumone/releases/latest', {
      headers: { 'User-Agent': 'Kumone/' + VERSION },
    }).then(function (res) { return res.json(); })
      .then(function (release) {
        return { latest: release.tag_name || null, current: VERSION, url: release.html_url || UPSTREAM_RELEASES };
      })
      .catch(function () { return { latest: null, current: VERSION }; });
  }

  function copyText(text) {
    var s = String(text || '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(s).then(function () { return true; })
        .catch(function () { return legacyCopy(s); });
    }
    return Promise.resolve(legacyCopy(s));
  }

  function legacyCopy(s) {
    try {
      var ta = document.createElement('textarea');
      ta.value = s;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (_e) { return false; }
  }

  // Media keys: map Android media-session actions into callbacks.
  function onMediaKey(callback) {
    if (!navigator.mediaSession || !callback) return;
    var bind = function (action, key) {
      try {
        navigator.mediaSession.setActionHandler(action, function () { callback(key); });
      } catch (_e) { /* action unsupported */ }
    };
    bind('play', 'MediaPlayPause');
    bind('pause', 'MediaPlayPause');
    bind('previoustrack', 'MediaPreviousTrack');
    bind('nexttrack', 'MediaNextTrack');
    bind('stop', 'MediaStop');
  }

  window.kumone = {
    invoke: invoke,
    onMediaKey: onMediaKey,
    isNative: function () {
      return typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    },
  };
})();