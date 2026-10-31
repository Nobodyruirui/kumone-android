/* =============================================================
 * 移动端渲染层 · 共享归一化纯函数
 * -------------------------------------------------------------
 * 同一个接口返回的原始结构，在不同地方必须变成**同一个对象**：
 * 上游 app.js 里有 normalizeTrack / normalizePlaylist / ...，
 * 移动端渲染层不能各写一份 —— 那是「同一个 track 对象两个真相」。
 *
 * 所以这份文件把归一化收敛成一个纯函数集合：
 *   - 不碰 DOM（只有数据进出）
 *   - 不发请求（没有网络）
 *   - 不写全局状态（没有副作用）
 *   → 可以在 Node 里直接 require 并逐条断言
 *
 * 上游内核层与上游渲染层都不动（ADR-0001），这里只是移动端自己的那一份，
 * 语义与上游对齐：同时接受 v3（ar/al/dt）与旧版（artists/album/duration）字段。
 *
 * 加载方式：浏览器挂到 Mobile.normalize，并同时导出裸全局名
 * （normalizeTrack / normalizePlaylist / ...）；Node 直接 require。
 * ============================================================= */
(function (root, factory) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var api = factory();
    // 裸全局导出：上游原版渲染层（www/app.js）用的就是这些裸标识符。
    // 这样共享版落地后，上游将来要切过来只需要删掉自己的副本，
    // 不必改动它那 20 余处调用点（本轮不动上游，见 ADR-0001）。
    root.imageUrl = api.imageUrl;
    root.normalizeTrack = api.normalizeTrack;
    root.normalizeTracks = api.normalizeTracks;
    root.normalizePlaylist = api.normalizePlaylist;
    root.normalizePlaylists = api.normalizePlaylists;
    root.normalizeAlbum = api.normalizeAlbum;
    root.normalizeAlbums = api.normalizeAlbums;
    root.normalizeArtist = api.normalizeArtist;
    root.normalizeArtists = api.normalizeArtists;
    root.normalizeAccount = api.normalizeAccount;
    root.normalizeSongUrl = api.normalizeSongUrl;
    root.artistNames = api.artistNames;
    root.trackSubtitle = api.trackSubtitle;
    root.playability = api.playability;
    // 注意：playabilityLabel 不导出为全局 —— 上游 www/app.js 里同名的是
    // 一个「状态 → 文案」的常量对象，语义不同，避免将来同页加载时语义混淆。

    root.Mobile = root.Mobile || {};
    root.Mobile.normalize = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------ 图片 */

  /**
   * 把网易云返回的图片地址规整成**能直接显示**的地址。
   *
   * 为什么需要它（真机实证）：
   *   网易云对**歌曲**封面返回 `http://p1..p4.music.126.net/...`，
   *   对**歌单 / 专辑**封面返回 `https://...`。
   *   App 的页面 origin 是 `https://localhost`（Capacitor androidScheme=https），
   *   而 Capacitor 默认 `android.allowMixedContent = false` ——
   *   于是 http 图片被当成混合内容拦掉：歌单封面有、歌曲封面没有。
   *
   * 规则（纯函数，可 Node 断言）：
   *   - 空 / 非字符串 → null（不给界面一个无效的 src）
   *   - 协议相对地址 `//host/x` → `https://host/x`
   *   - `http://` → `https://`
   *   - 追加尺寸参数 `?param=<size>y<size>`（网易云图片服务自带裁剪）
   *
   * @param {string} raw 接口返回的图片地址
   * @param {number} [size] 期望的边长（像素）；缺省不加参数
   * @returns {string|null}
   */
  function imageUrl(raw, size) {
    if (!raw || typeof raw !== 'string') return null;
    var u = raw.trim();
    if (!u) return null;
    if (u.indexOf('//') === 0) u = 'https:' + u;
    else if (u.indexOf('http://') === 0) u = 'https://' + u.slice('http://'.length);
    if (size && u.indexOf('param=') < 0) {
      u += (u.indexOf('?') >= 0 ? '&' : '?') + 'param=' + size + 'y' + size;
    }
    return u;
  }

  /* ------------------------------------------------------------ 曲目 */

  /**
   * 归一化单曲。
   * @param {object} raw 接口原始曲目
   * @returns {object|null} 统一形态的曲目
   */
  function normalizeTrack(raw) {
    if (!raw) return null;
    return {
      id: raw.id,
      name: raw.name || '',
      artists: (raw.ar || raw.artists || []).map(function (a) {
        return { id: (a && a.id) || 0, name: (a && a.name) || '' };
      }),
      album: {
        id: ((raw.al || raw.album) || {}).id || 0,
        name: ((raw.al || raw.album) || {}).name || '',
        picUrl: imageUrl(((raw.al || raw.album) || {}).picUrl)
      },
      durationMS: raw.dt || raw.duration || 0,
      alias: raw.alia || raw.alias || [],
      tns: raw.tns || [],
      fee: raw.fee || 0,
      mv: raw.mv || 0,
      noCopyrightRcmd: Boolean(raw.noCopyrightRcmd),
      pc: Boolean(raw.pc),
      privilege: raw.privilege || null
    };
  }

  /** 艺人名拼接：界面直接可展示。 */
  function artistNames(track) {
    if (!track || !track.artists) return '';
    return track.artists.map(function (a) { return a.name; }).join(' / ');
  }

  /** 副标题：优先译名，其次别名。 */
  function trackSubtitle(track) {
    if (!track) return null;
    if (track.tns && track.tns.length) return track.tns[0];
    if (track.alias && track.alias.length) return track.alias[0];
    return null;
  }

  /* ------------------------------------------------------------ 歌单 */

  function normalizePlaylist(raw) {
    if (!raw) return null;
    return {
      id: raw.id,
      name: raw.name || '',
      cover: imageUrl(raw.picUrl || raw.coverImgUrl),
      playCount: raw.playCount != null ? raw.playCount : (raw.playcount || 0),
      trackCount: raw.trackCount || 0,
      copywriter: raw.copywriter || null,
      creator: raw.creator
        ? { nickname: raw.creator.nickname || '', userId: raw.creator.userId || 0 }
        : null,
      specialType: raw.specialType || 0,
      subscribed: Boolean(raw.subscribed)
    };
  }

  /* -------------------------------------------------------- 专辑/歌手 */

  function normalizeAlbum(raw) {
    if (!raw) return null;
    var artists = raw.artists || (raw.artist ? [raw.artist] : []);
    return {
      id: raw.id,
      name: raw.name || '',
      pic: imageUrl(raw.picUrl || raw.cover),
      artistName: artists.map(function (a) { return a.name; })
        .filter(Boolean).join(' / '),
      artistId: (raw.artist || {}).id || 0,
      publishTime: raw.publishTime || 0,
      size: raw.size || 0
    };
  }

  function normalizeArtist(raw) {
    if (!raw) return null;
    return {
      id: raw.id,
      name: raw.name || '',
      pic: imageUrl(raw.picUrl || raw.cover || raw.avatar || raw.img1v1Url),
      albumSize: raw.albumSize || 0,
      musicSize: raw.musicSize || 0,
      alias: raw.alias || [],
      followed: Boolean(raw.followed),
      brief: raw.briefDesc || null
    };
  }

  /* ------------------------------------------------------------ 可播性 */

  var PLAYABILITY_LABEL = {
    vipOnly: 'VIP 专属',
    paidAlbum: '付费专辑',
    noCopyright: '无版权',
    delisted: '已下架'
  };

  /**
   * 判定曲目可播状态。判定链与上游 Track.swift 一致：
   *   明确可播 → 登录后可用 → VIP 判定 → 付费专辑 → 无版权 → 已下架
   * @param {object} track 归一化后的曲目
   * @param {object} privilege 权限信息（缺省取 track.privilege）
   * @param {boolean} isLoggedInNow 当前是否已登录
   * @param {number} vip VIP 类型（0 表示非 VIP）
   * @returns {string} playable | vipOnly | paidAlbum | noCopyright | delisted
   */
  function playability(track, privilege, isLoggedInNow, vip) {
    if (!track) return 'playable';
    privilege = privilege || track.privilege || null;
    if (privilege && privilege.pl > 0) return 'playable';
    if (isLoggedInNow && privilege && privilege.cs) return 'playable';
    var fee = (privilege && privilege.fee != null) ? privilege.fee : track.fee;
    if (fee === 1) return vip > 0 ? 'playable' : 'vipOnly';
    if (fee === 4) return 'paidAlbum';
    if (track.noCopyrightRcmd) return 'noCopyright';
    if (privilege && privilege.st < 0 && isLoggedInNow) return 'delisted';
    return 'playable';
  }

  /** 可播状态的可展示中文标签（playable 返回空串）。 */
  function playabilityLabel(state) {
    return PLAYABILITY_LABEL[state] || '';
  }

  /* ------------------------------------------------------------ 批量 */

  /** 批量归一化曲目，过滤掉空项。 */
  function normalizeTracks(list) {
    if (!Array.isArray(list)) return [];
    return list.map(normalizeTrack).filter(Boolean);
  }

  /** 批量归一化歌单。 */
  function normalizePlaylists(list) {
    if (!Array.isArray(list)) return [];
    return list.map(normalizePlaylist).filter(Boolean);
  }

  /** 批量归一化专辑。 */
  function normalizeAlbums(list) {
    if (!Array.isArray(list)) return [];
    return list.map(normalizeAlbum).filter(Boolean);
  }

  /** 批量归一化歌手。 */
  function normalizeArtists(list) {
    if (!Array.isArray(list)) return [];
    return list.map(normalizeArtist).filter(Boolean);
  }

  /**
   * 归一化账号信息（userAccount 返回的是 profile）。
   * @param {object} raw
   * @returns {object|null} { userId, nickname, avatarUrl, vipType }
   */
  function normalizeAccount(raw) {
    if (!raw) return null;
    return {
      userId: raw.userId || 0,
      nickname: raw.nickname || '',
      avatarUrl: imageUrl(raw.avatarUrl),
      vipType: raw.vipType || 0
    };
  }

  /**
   * 把接口返回的播放地址数据规整成播放引擎要的形态。
   * @param {object} raw songURL 的返回项
   * @returns {object|null} { url, level, freeTrialInfo }
   */
  function normalizeSongUrl(raw) {
    if (!raw || !raw.url) return null;
    return {
      url: String(raw.url).replace(/^http:/, 'https:'),
      level: raw.level || null,
      freeTrialInfo: raw.freeTrialInfo || null
    };
  }

  return {
    imageUrl: imageUrl,
    normalizeTrack: normalizeTrack,
    normalizeTracks: normalizeTracks,
    normalizePlaylist: normalizePlaylist,
    normalizePlaylists: normalizePlaylists,
    normalizeAlbum: normalizeAlbum,
    normalizeAlbums: normalizeAlbums,
    normalizeArtist: normalizeArtist,
    normalizeArtists: normalizeArtists,
    normalizeAccount: normalizeAccount,
    normalizeSongUrl: normalizeSongUrl,
    artistNames: artistNames,
    trackSubtitle: trackSubtitle,
    playability: playability,
    playabilityLabel: playabilityLabel
  };
});
