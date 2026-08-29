// Typed NetEase Cloud Music API surface — browser build.
// Ported from lib/api.js (Node). All functions return plain decoded JSON objects.
/* global module */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./client'));
  } else {
    root.KumoneAPI = factory(root.KumoneClient);
  }
})(typeof self !== 'undefined' ? self : this, function (mod) {
  'use strict';
  var client = mod.client;
  var decode = function (text) { return mod.decode(text); };

  var call = function (kind, path, payload) {
    return client[kind](path, payload).then(decode);
  };
  var weapi = function (path, payload) { return call('weapi', path, payload); };
  var eapi = function (path, payload) { return call('eapi', path, payload); };

  var NeteaseAPI = {
    client: client,

    // ----- Auth -----
    qrKey: function () {
      return weapi('/login/qrcode/unikey', { type: 1 }).then(function (r) { return r.unikey; });
    },
    qrLoginURL: function (unikey) {
      return 'https://music.163.com/login?codekey=' + unikey;
    },
    qrCheck: function (unikey) {
      return client.weapi('/login/qrcode/client/login', { key: unikey, type: 1 }).then(function (text) {
        var obj = JSON.parse(text);
        if (obj && typeof obj.cookie === 'string' && obj.cookie.length) client.ingestCookieString(obj.cookie);
        return obj;
      });
    },
    logout: function () {
      return weapi('/logout').catch(function () {}).then(function () { client.clearAuthCookies(); });
    },
    refreshLogin: function () {
      return weapi('/login/token/refresh').catch(function () {});
    },
    userAccount: function () {
      return weapi('/w/nuser/account/get').then(function (r) { return (r.profile) || null; });
    },

    // ----- User library -----
    userPlaylists: function (uid, limit, offset) {
      limit = limit || 2000; offset = offset || 0;
      return weapi('/user/playlist', { uid: uid, limit: limit, offset: offset, includeVideo: true })
        .then(function (r) { return r.playlist; });
    },
    likedTrackIDs: function (uid) {
      return weapi('/song/like/get', { uid: uid }).then(function (r) { return r.ids; });
    },
    likeTrack: function (id, like) {
      return weapi('/radio/like?alg=itembased&trackId=' + id + '&time=3', { trackId: id, like: like })
        .then(function (resp) {
          if (resp.code !== 200) throw new Error('操作失败，专辑下架或版权锁定');
        });
    },
    likedAlbums: function (limit, offset) {
      limit = limit || 500; offset = offset || 0;
      return weapi('/album/sublist', { limit: limit, offset: offset, total: true }).then(function (r) { return r.data; });
    },
    likedArtists: function (limit, offset) {
      limit = limit || 500; offset = offset || 0;
      return weapi('/artist/sublist', { limit: limit, offset: offset, total: true }).then(function (r) { return r.data; });
    },
    playRecords: function (uid, week) {
      return weapi('/v1/play/record', { uid: uid, type: week ? 1 : 0 })
        .then(function (resp) { return (week ? resp.weekData : resp.allData) || []; });
    },
    cloudSongs: function (limit, offset) {
      limit = limit || 1000; offset = offset || 0;
      return weapi('/v1/cloud/get', { limit: limit, offset: offset });
    },
    cloudDelete: function (id) {
      return weapi('/cloud/del', { songIds: '[' + id + ']' });
    },

    // ----- Playlists -----
    personalizedPlaylists: function (limit) {
      limit = limit || 30;
      return weapi('/personalized/playlist', { limit: limit, total: true, n: 1000 }).then(function (r) { return r.result; });
    },
    recommendResource: function () {
      return weapi('/v1/discovery/recommend/resource').then(function (r) { return r.recommend; });
    },
    dailyRecommendSongs: function () {
      return weapi('/v3/discovery/recommend/songs')
        .then(function (r) { return (r.data || {}).dailySongs || []; });
    },
    playlistDetail: function (id) {
      return weapi('/v6/playlist/detail', { id: id, n: 100000, s: 8 });
    },
    songDetails: function (ids) {
      if (!ids.length) return Promise.resolve({ songs: [], privileges: [] });
      var c = '[' + ids.map(function (i) { return '{"id":' + i + '}'; }).join(',') + ']';
      return weapi('/v3/song/detail', { c: c });
    },
    topPlaylists: function (category, order, limit, offset) {
      category = category || ''; order = order || 'hot'; limit = limit || 50; offset = offset || 0;
      return weapi('/playlist/list', { cat: category, order: order, limit: limit, offset: offset, total: true });
    },
    highQualityPlaylists: function (category, limit, before) {
      category = category || '全部'; limit = limit || 50; before = before || 0;
      return weapi('/playlist/highquality/list', { cat: category, limit: limit, lasttime: before, total: true });
    },
    toplists: function () {
      return eapi('/toplist', {}).then(function (r) { return r.list; });
    },
    createPlaylist: function (name, isPrivate) {
      return weapi('/playlist/create', { name: name, privacy: isPrivate ? 10 : 0, type: 'NORMAL' });
    },
    deletePlaylist: function (id) {
      return weapi('/playlist/remove', { ids: '[' + id + ']' });
    },
    subscribePlaylist: function (id, subscribe) {
      return weapi('/playlist/' + (subscribe ? 'subscribe' : 'unsubscribe'), { id: id });
    },
    playlistTracks: function (op, playlistID, trackIDs) {
      var ids = '[' + trackIDs.join(',') + ']';
      return client.weapi('/playlist/manipulate/tracks',
        { op: op, pid: playlistID, trackIds: ids, imme: 'true' }).then(function () {
          return undefined;
        }).catch(function (e) {
          if (e.code === 512 && op === 'add') {
            return client.weapi('/playlist/manipulate/tracks',
              { op: op, pid: playlistID, trackIds: '[' + trackIDs.concat(trackIDs).join(',') + ']', imme: 'true' });
          }
          throw e;
        });
    },
    intelligenceList: function (songID, playlistID) {
      return weapi('/playmode/intelligence/list',
        { songId: songID, type: 'fromPlayOne', playlistId: playlistID, startMusicId: songID, count: 1 })
        .then(function (resp) { return (resp.data || []).map(function (i) { return i.songInfo; }).filter(Boolean); });
    },

    // ----- Tracks -----
    songURL: function (ids, level) {
      var payload = { ids: '[' + ids.join(',') + ']', level: level, encodeType: 'flac' };
      if (level === 'sky') payload.immerseType = 'c51';
      return eapi('/song/enhance/player/url/v1', payload).then(function (r) { return r.data; });
    },
    lyric: function (id) {
      return weapi('/song/lyric', { id: id, lv: -1, kv: -1, tv: -1, rv: -1 });
    },
    personalFM: function () {
      return weapi('/v1/radio/get').then(function (r) { return r.data || []; });
    },
    fmTrash: function (id) {
      return weapi('/radio/trash/add?alg=RT&songId=' + id + '&time=25', { songId: id });
    },
    similarSongs: function (id, limit) {
      limit = limit || 30;
      return weapi('/v1/discovery/simiSong', { songid: id, limit: limit, offset: 0 }).then(function (r) { return r.songs; });
    },

    // ----- Albums / Artists -----
    album: function (id) {
      return weapi('/v1/album/' + id);
    },
    newAlbums: function (area, limit, offset) {
      area = area || 'ALL'; limit = limit || 30; offset = offset || 0;
      return weapi('/album/new', { area: area, limit: limit, offset: offset, total: true }).then(function (r) { return r.albums; });
    },
    albumDynamic: function (id) {
      return eapi('/album/detail/dynamic', { id: id });
    },
    subscribeAlbum: function (id, subscribe) {
      return weapi('/album/' + (subscribe ? 'sub' : 'unsub'), { id: id });
    },
    artist: function (id) {
      return weapi('/v1/artist/' + id);
    },
    artistAlbums: function (id, limit, offset) {
      limit = limit || 100; offset = offset || 0;
      return weapi('/artist/albums/' + id, { limit: limit, offset: offset, total: true });
    },
    subscribeArtist: function (id, subscribe) {
      return weapi('/artist/' + (subscribe ? 'sub' : 'unsub'), { artistId: id, artistIds: '[' + id + ']' });
    },
    topArtists: function (limit) {
      limit = limit || 100;
      return weapi('/toplist/artist', { type: 1, limit: limit, offset: 0, total: true }).then(function (r) { return r.list.artists; });
    },
    similarArtists: function (id) {
      return weapi('/discovery/simiArtist', { artistid: id }).then(function (r) { return r.artists; });
    },

    // ----- Search -----
    search: function (keywords, type, limit, offset) {
      limit = limit || 30; offset = offset || 0;
      return eapi('/cloudsearch/pc', { s: keywords, type: type, limit: limit, offset: offset, total: true })
        .then(function (resp) { return resp.result || {}; });
    },
    searchSuggest: function (keywords) {
      return weapi('/search/suggest/web', { s: keywords }).then(function (r) { return r.result || null; });
    },
    searchDefaultKeyword: function () {
      return eapi('/search/defaultkeyword/get', {}).then(function (r) { return (r.data && r.data.showKeyword) || null; });
    },

    // ----- Personalized extras -----
    personalizedNewSongs: function (limit) {
      limit = limit || 10;
      return weapi('/personalized/newsong', { type: 'recommend', limit: limit, areaId: 0 })
        .then(function (resp) { return resp.result.map(function (i) { return i.song; }).filter(Boolean); });
    },

    // ----- Scrobble -----
    scrobble: function (trackID, sourceID, seconds) {
      var log = [{
        action: 'play',
        json: {
          download: 0, end: 'playend', id: trackID,
          sourceId: String(sourceID), time: seconds,
          type: 'song', wifi: 0, source: 'list',
        },
      }];
      return weapi('/feedback/weblog', { logs: JSON.stringify(log) }).catch(function () {});
    },
  };

  return NeteaseAPI;
});