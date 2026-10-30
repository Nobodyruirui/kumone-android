/* =============================================================
 * 移动端渲染层 · 服务层
 * -------------------------------------------------------------
 * 视图层不直接碰内核。服务层是移动端渲染层与内核门面之间的**唯一边界**：
 *
 *   视图层 → Mobile.service.* → window.kumone.invoke(channel, args) → 内核
 *
 * 三条纪律（ADR-0003）：
 *   1. 只走内核门面，不直接调 www/kumone/lib/api.js 的内部实现（内核层零改动）
 *   2. 失败一律翻译成契约错误（core/errors.js 的稳定码），按码分支，不按文案分支
 *   3. 「需要登录」不是普通错误，是一次**登录中断**：打断 → 扫码 → 恢复后重放
 *
 * 服务层不写 DOM、不拼 HTML、不持有视图状态；也不自己造错误结构。
 *
 * 加载方式：浏览器挂到 Mobile.service；Node 直接 require（自测用假门面注入）。
 * ============================================================= */
(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./errors.js'),
      require('../../shared/normalize.js')
    );
  } else {
    root.Mobile = root.Mobile || {};
    // 浏览器里直接用内核门面装配一个实例；门面缺失时不炸页面，
    // 而是留一个会明确报错的门面，等接线时能看出问题在哪。
    root.Mobile.service = factory(root.Mobile.errors, root.Mobile.normalize).createService({
      facade: root.kumone || {
        invoke: function () {
          return Promise.resolve({
            ok: false,
            error: '内核门面未就绪（window.kumone 不存在）',
            kind: 'business'
          });
        }
      }
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (errors, normalize) {
  'use strict';

  /**
   * 造一个服务层实例。
   * @param {object} opts
   * @param {object} opts.facade 内核门面，需有 invoke(channel, args) → Promise<{ok,data}|{ok:false,...}>
   * @param {object} [opts.errors] 契约错误模块
   * @param {object} [opts.normalize] 归一化模块
   */
  function createService(opts) {
    opts = opts || {};
    var facade = opts.facade;
    var err = opts.errors || errors;
    var nz = opts.normalize || normalize;

    if (!facade || typeof facade.invoke !== 'function') {
      throw new Error('服务层需要一个带 invoke(channel, args) 的内核门面');
    }

    /**
     * 调一次内核，并把结果规整成 { ok:true, data } / { ok:false, ...契约错误 }。
     * 这里是**唯一**的翻译点：视图层永远拿不到内核原始错误。
     */
    async function call(channel, args, ctx) {
      var raw;
      try {
        raw = await facade.invoke(channel, args || {});
      } catch (e) {
        raw = { ok: false, error: (e && e.message) || String(e), kind: (e && e.kind) || null };
      }
      if (raw && raw.ok === true) return { ok: true, data: raw.data };

      var contract = err.fromKernel(
        { message: raw && raw.error, kind: raw && raw.kind, code: raw && raw.code,
          httpStatus: raw && raw.httpStatus },
        ctx || { what: channel }
      );
      // 登录中断：需要登录不是「失败了」，是「流程被打断，等你扫码再继续」
      if (contract.code === 'KUMONE_NEED_LOGIN') {
        contract.loginInterrupt = true;
        contract.resume = { channel: channel, args: args || {} };
      }
      return contract;
    }

    /* --------------------------------------------------------- 账号 */

    /** 当前是否已登录。 */
    async function isLoggedIn() {
      var r = await call('isLoggedIn', {});
      return r.ok ? !!r.data : false;
    }

    /** 账号资料。 */
    async function account() {
      var r = await call('userAccount', {});
      if (!r.ok) return r;
      var acc = nz.normalizeAccount(r.data);
      return acc ? { ok: true, data: acc } : { ok: true, data: null };
    }

    /** 退出登录。 */
    async function logout() {
      return call('logout', {});
    }

    /* --------------------------------------------------------- 扫码登录 */

    /** 取二维码的 unikey（有效期约 3 分钟）。 */
    async function qrKey() {
      return call('qrKey', {});
    }

    /**
     * 轮询扫码状态。
     * 返回体的 code：800 已过期 / 801 等待扫码 / 802 已扫码待确认 / 803 登录成功。
     */
    async function qrCheck(key) {
      return call('qrCheck', { key: key });
    }

    /** 把登录地址渲染成二维码图片（data URL）。 */
    async function qrImage(text) {
      return call('qrImage', { text: text });
    }

    /* --------------------------------------------------------- 主页 */

    /** 每日推荐（单曲）。 */
    async function dailyRecommend() {
      var r = await call('dailyRecommendSongs', {});
      if (!r.ok) return r;
      return { ok: true, data: nz.normalizeTracks(r.data) };
    }

    /** 为你推荐（歌单）。 */
    async function recommendedPlaylists(limit) {
      var r = await call('personalizedPlaylists', limit ? { limit: limit } : {});
      if (!r.ok) return r;
      return { ok: true, data: nz.normalizePlaylists(r.data) };
    }

    /** 排行榜。 */
    async function toplists() {
      var r = await call('toplists', {});
      if (!r.ok) return r;
      return { ok: true, data: nz.normalizePlaylists(r.data) };
    }

    /** 推荐歌手。 */
    async function topArtists(limit) {
      var r = await call('topArtists', limit ? { limit: limit } : {});
      if (!r.ok) return r;
      return { ok: true, data: nz.normalizeArtists(r.data) };
    }

    /** 新碟上架。 */
    async function newAlbums(limit) {
      var r = await call('newAlbums', limit ? { limit: limit } : {});
      if (!r.ok) return r;
      return { ok: true, data: nz.normalizeAlbums(r.data) };
    }

    /* ------------------------------------------------------- 资料库 */

    /** 我的歌单。 */
    async function myPlaylists(uid) {
      var r = await call('userPlaylists', { uid: uid });
      if (!r.ok) return r;
      return { ok: true, data: nz.normalizePlaylists(r.data) };
    }

    /** 喜欢的音乐（先取 id，再批量取详情）。 */
    async function likedSongs(uid) {
      var ids = await call('likedTrackIDs', { uid: uid });
      if (!ids.ok) return ids;
      var list = ids.data || [];
      if (!list.length) return { ok: true, data: [] };
      var detail = await call('songDetails', { ids: list });
      if (!detail.ok) return detail;
      var songs = ((detail.data || {}).songs) || [];
      return { ok: true, data: nz.normalizeTracks(songs) };
    }

    /** 云盘歌曲。 */
    async function cloudSongs() {
      var r = await call('cloudSongs', {});
      if (!r.ok) return r;
      var body = r.data || {};
      var songs = body.content || body.songs || [];
      return { ok: true, data: nz.normalizeTracks(songs) };
    }

    /** 听歌排行。 */
    async function playRecords(uid, week) {
      var r = await call('playRecords', { uid: uid, week: !!week });
      if (!r.ok) return r;
      var rows = r.data || [];
      return {
        ok: true,
        data: rows.map(function (row) {
          return {
            track: nz.normalizeTrack(row),
            playCount: row.playCount || 0,
            score: row.score || 0
          };
        }).filter(function (x) { return !!x.track; })
      };
    }

    /* ------------------------------------------------------- 广播 / 搜索 */

    /** 私人广播（FM）。内核返回的是旧版字段，归一化层已经兼容。 */
    async function personalFM() {
      var r = await call('personalFM', {});
      if (!r.ok) return r;
      return { ok: true, data: nz.normalizeTracks(r.data) };
    }

    /** 不喜欢：把这首从 FM 里扔掉。 */
    async function fmTrash(id) {
      return call('fmTrash', { id: id });
    }

    /**
     * 搜索。
     * @param {string} keywords 关键词
     * @param {number} type 1 单曲 / 10 专辑 / 100 歌手 / 1000 歌单
     * @param {number} [limit]
     * @param {number} [offset]
     */
    async function search(keywords, type, limit, offset) {
      var r = await call('search', {
        keywords: keywords,
        type: type,
        limit: limit || 30,
        offset: offset || 0
      });
      if (!r.ok) return r;
      var body = r.data || {};
      return {
        ok: true,
        data: {
          songs: nz.normalizeTracks(body.songs),
          albums: nz.normalizeAlbums(body.albums),
          artists: nz.normalizeArtists(body.artists),
          playlists: nz.normalizePlaylists(body.playlists),
          counts: {
            songs: body.songCount || 0,
            albums: body.albumCount || 0,
            artists: body.artistCount || 0,
            playlists: body.playlistCount || 0
          }
        }
      };
    }

    /** 搜索联想：单曲 / 专辑 / 歌手 / 歌单各给几条。 */
    async function searchSuggest(keywords) {
      var r = await call('searchSuggest', { keywords: keywords });
      if (!r.ok) return r;
      var body = r.data || {};
      return {
        ok: true,
        data: {
          songs: nz.normalizeTracks(body.songs),
          albums: nz.normalizeAlbums(body.albums),
          artists: nz.normalizeArtists(body.artists),
          playlists: nz.normalizePlaylists(body.playlists)
        }
      };
    }

    /** 默认搜索词（大家都在搜）。 */
    async function searchDefaultKeyword() {
      var r = await call('searchDefaultKeyword', {});
      if (!r.ok) return r;
      return { ok: true, data: r.data || null };
    }

    /* --------------------------------------------------------- 详情 */

    /** 歌单详情（歌单本体 + 前若干首）。 */
    async function playlistDetail(id) {
      var r = await call('playlistDetail', { id: id });
      if (!r.ok) return r;
      var body = r.data || {};
      var pl = nz.normalizePlaylist(body.playlist || body);
      var tracks = nz.normalizeTracks(body.songs || body.tracks || []);
      return { ok: true, data: { playlist: pl, tracks: tracks } };
    }

    /** 歌手详情。 */
    async function artist(id) {
      var r = await call('artist', { id: id });
      if (!r.ok) return r;
      var body = r.data || {};
      return {
        ok: true,
        data: {
          artist: nz.normalizeArtist(body.artist || body),
          hotSongs: nz.normalizeTracks(body.hotSongs || [])
        }
      };
    }

    /** 专辑详情。 */
    async function album(id) {
      var r = await call('album', { id: id });
      if (!r.ok) return r;
      var body = r.data || {};
      return {
        ok: true,
        data: {
          album: nz.normalizeAlbum(body.album || body),
          songs: nz.normalizeTracks(body.songs || [])
        }
      };
    }

    /* --------------------------------------------------------- 播放 */

    /** 取播放地址；失败时按音质降级顺序重试（见 player.js 的降级链）。 */
    async function songUrl(id, level) {
      var r = await call('songURL', { id: id, level: level });
      if (!r.ok) return r;
      return { ok: true, data: nz.normalizeSongUrl(r.data) };
    }

    /** 歌词。 */
    async function lyric(id) {
      var r = await call('lyric', { id: id });
      if (!r.ok) return r;
      var body = r.data || {};
      return { ok: true, data: { lrc: body.lrc || null, tlyric: body.tlyric || null } };
    }

    /**
     * 第三方音源兜底（内核 unblock 通道）。
     * 与音质降级是两条不同的路径：这条是「换来源」，不是「换码率」。
     */
    async function unblock(track) {
      var r = await call('unblock', { track: track });
      if (!r.ok) return r;
      var hit = r.data || null;
      if (!hit || !hit.url) {
        return {
          ok: false,
          code: 'KUMONE_UNBLOCK_FAILED',
          kind: 'permanent',
          title: '音源解锁失败',
          message: '音源解锁失败\nExpected: await unblock(track)\nState: 第三方音源没有给出可播放地址\nBlocked by: ' + (r.message || '无可用音源'),
          next: '换一首；或提示用户该曲不可播'
        };
      }
      return { ok: true, data: { url: hit.url, source: hit.source || null } };
    }

    return {
      call: call,
      isLoggedIn: isLoggedIn,
      account: account,
      logout: logout,
      qrKey: qrKey,
      qrCheck: qrCheck,
      qrImage: qrImage,
      dailyRecommend: dailyRecommend,
      recommendedPlaylists: recommendedPlaylists,
      toplists: toplists,
      topArtists: topArtists,
      newAlbums: newAlbums,
      myPlaylists: myPlaylists,
      likedSongs: likedSongs,
      cloudSongs: cloudSongs,
      playRecords: playRecords,
      personalFM: personalFM,
      fmTrash: fmTrash,
      search: search,
      searchSuggest: searchSuggest,
      searchDefaultKeyword: searchDefaultKeyword,
      playlistDetail: playlistDetail,
      artist: artist,
      album: album,
      songUrl: songUrl,
      unblock: unblock,
      lyric: lyric
    };
  }

  return { createService: createService };
});
