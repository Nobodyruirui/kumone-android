// Kumone for Windows — renderer application.
// UI layer of the Electron port of missuo/kumone (SwiftUI on macOS).
'use strict';

/* ---------------------------------- helpers ---------------------------------- */

const $ = (sel) => document.querySelector(sel);
const invoke = async (channel, args) => {
  const res = await window.kumone.invoke(channel, args);
  if (!res.ok) {
    const e = new Error(res.error);
    e.kind = res.kind; e.code = res.code;
    if (e.kind === 'needLogin') handleNeedLogin();
    throw e;
  }
  return res.data;
};

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    node.append(c);
  }
  return node;
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const img = (url, size) => {
  if (!url) return '';
  let s = url.replace(/^http:/, 'https:');
  s += s.includes('?') ? `&param=${size}y${size}` : `?param=${size}y${size}`;
  return s;
};

const fmtDuration = (sec) => {
  const t = Math.round(Number(sec) || 0);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const fmtDurationMS = (ms) => fmtDuration((Number(ms) || 0) / 1000);
const fmtCount = (n) => {
  n = Number(n) || 0;
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return String(n);
};
const fmtBytes = (n) => {
  n = Number(n) || 0;
  if (n >= 1 << 30) return (n / (1 << 30)).toFixed(1) + ' GB';
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MB';
  return Math.round(n / 1024) + ' KB';
};

function toast(msg) {
  const t = el('div', { class: 'toast' }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3200);
}

/// Electron has no window.prompt — tiny promise-based input modal.
function promptModal(title, defaultValue = '') {
  return new Promise((resolve) => {
    const backdrop = $('#prompt-backdrop');
    const input = $('#prompt-input');
    $('#prompt-title').textContent = title;
    input.value = defaultValue;
    backdrop.hidden = false;
    input.focus();
    input.select();
    const done = (val) => {
      backdrop.hidden = true;
      $('#prompt-ok').onclick = $('#prompt-cancel').onclick = input.onkeydown = null;
      resolve(val);
    };
    $('#prompt-ok').onclick = () => done(input.value.trim() || null);
    $('#prompt-cancel').onclick = () => done(null);
    input.onkeydown = (ev) => {
      if (ev.key === 'Enter') done(input.value.trim() || null);
      if (ev.key === 'Escape') done(null);
    };
  });
}

/// Android WebView does not expose a working window.confirm, so we build our own.
function confirmAsync(message) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    Object.assign(backdrop.style, {
      position: 'fixed', inset: '0', background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '10000',
    });
    const box = document.createElement('div');
    Object.assign(box.style, {
      background: '#242428', color: '#eee', padding: '20px 22px', borderRadius: '12px',
      maxWidth: '80vw', fontSize: '14px', boxShadow: '0 8px 30px rgba(0,0,0,.5)',
    });
    const msg = document.createElement('div');
    msg.textContent = message;
    msg.style.cssText = 'margin-bottom:16px;line-height:1.6;white-space:pre-wrap;word-break:break-all;';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
    const no = document.createElement('button'); no.textContent = '取消';
    const yes = document.createElement('button'); yes.textContent = '确定';
    [no, yes].forEach((b) => Object.assign(b.style, {
      padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px',
    }));
    no.style.background = '#33313a'; no.style.color = '#ccc';
    yes.style.background = '#ec4141'; yes.style.color = '#fff';
    const done = (v) => { document.body.removeChild(backdrop); resolve(v); };
    no.onclick = () => done(false);
    yes.onclick = () => done(true);
    btns.append(no, yes);
    box.append(msg, btns);
    backdrop.append(box);
    document.body.append(backdrop);
    no.focus();
  });
}

/* ------------------------------- normalizers -------------------------------- */

// Mirrors Track.swift: accepts both "v3" (ar/al/dt) and legacy (artists/album/duration).
function normalizeTrack(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    name: raw.name || '',
    artists: (raw.ar || raw.artists || []).map((a) => ({ id: a.id || 0, name: a.name || '' })),
    album: {
      id: (raw.al || raw.album || {}).id || 0,
      name: (raw.al || raw.album || {}).name || '',
      picUrl: (raw.al || raw.album || {}).picUrl || null,
    },
    durationMS: raw.dt || raw.duration || 0,
    alias: raw.alia || raw.alias || [],
    tns: raw.tns || [],
    fee: raw.fee || 0,
    mv: raw.mv || 0,
    noCopyrightRcmd: Boolean(raw.noCopyrightRcmd),
    pc: Boolean(raw.pc),
    privilege: raw.privilege || null,
  };
}
const artistNames = (t) => t.artists.map((a) => a.name).join(' / ');
const trackSubtitle = (t) => t.tns[0] || t.alias[0] || null;

function normalizePlaylist(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    name: raw.name || '',
    cover: raw.picUrl || raw.coverImgUrl || null,
    playCount: raw.playCount ?? raw.playcount ?? 0,
    trackCount: raw.trackCount || 0,
    copywriter: raw.copywriter || null,
    creator: raw.creator ? { nickname: raw.creator.nickname || '', userId: raw.creator.userId || 0 } : null,
    specialType: raw.specialType || 0,
    subscribed: Boolean(raw.subscribed),
  };
}
function normalizeAlbum(raw) {
  if (!raw) return null;
  const artists = raw.artists || (raw.artist ? [raw.artist] : []);
  return {
    id: raw.id,
    name: raw.name || '',
    pic: raw.picUrl || raw.cover || null,
    artistName: artists.map((a) => a.name).filter(Boolean).join(' / '),
    artistId: (raw.artist || {}).id || 0,
    publishTime: raw.publishTime || 0,
    size: raw.size || 0,
  };
}
function normalizeArtist(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    name: raw.name || '',
    pic: raw.picUrl || raw.cover || raw.avatar || raw.img1v1Url || null,
    albumSize: raw.albumSize || 0,
    musicSize: raw.musicSize || 0,
    alias: raw.alias || [],
    followed: Boolean(raw.followed),
    brief: raw.briefDesc || null,
  };
}

// Mirrors Track.playability in Track.swift (YesPlayMusic decision chain).
function playability(track, privilege, isLoggedInNow, vip) {
  privilege = privilege || track.privilege || null;
  if (privilege && privilege.pl > 0) return 'playable';
  if (isLoggedInNow && privilege && privilege.cs) return 'playable';
  const fee = (privilege && privilege.fee != null) ? privilege.fee : track.fee;
  if (fee === 1) return vip > 0 ? 'playable' : 'vipOnly';
  if (fee === 4) return 'paidAlbum';
  if (track.noCopyrightRcmd) return 'noCopyright';
  if (privilege && privilege.st < 0 && isLoggedInNow) return 'delisted';
  return 'playable';
}
const playabilityLabel = { vipOnly: 'VIP 专属', paidAlbum: '付费专辑', noCopyright: '无版权', delisted: '已下架' };

/* --------------------------------- state ------------------------------------ */

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('kumone.' + key); return v == null ? fallback : JSON.parse(v); }
    catch (_) { return fallback; }
  },
  set(key, value) { localStorage.setItem('kumone.' + key, JSON.stringify(value)); },
};

const state = {
  account: store.get('account', null),        // { userId, nickname, avatarUrl, vipType }
  likedIds: new Set(store.get('likedIds', [])),
  playlists: [],
  view: { type: 'home' },
  history: [],
  quality: store.get('quality', 'lossless'),
  unblock: store.get('unblock', true),
  appearance: store.get('appearance', 'dark'),
};

const player = {
  queue: [],            // [{ track, sourceID }]
  index: -1,
  playNextList: [],     // 插播队列（"下一首播放"，对应上游 playNextList）
  repeat: store.get('repeat', 'off'),         // off | all | one
  generation: 0,
  consecutiveFailures: 0,
  scrobbled: false,
  lyrics: [],
  fmActive: false,                            // 私人FM：队列播完自动续
  restoreTime: null,                          // 重启后恢复的播放位置
  fmCover: null,
};
const audio = new Audio();
audio.volume = store.get('volume', 0.9);
const isLoggedIn = () => Boolean(state.account);
const vipType = () => (state.account && state.account.vipType) || 0;

let needLoginShown = false;
function handleNeedLogin() {
  if (needLoginShown) return;
  needLoginShown = true;
  state.account = null;
  store.set('account', null);
  updateAccountChip();
  refreshLibraryNav();
  toast('登录已过期，请重新扫码登录');
  openLogin().finally(() => { needLoginShown = false; });
}

/* --------------------------------- views ------------------------------------ */

const viewEl = () => $('#view');
function nav(view) {
  state.history.push(state.view);
  state.view = view;
  render();
  $('#main').scrollTop = 0;
}
/// 返回上一个视图（正在播放大页「收起」等入口）。
function back() {
  state.view = state.history.pop() || { type: 'home' };
  render();
}
window.kumoneNav = nav;

function render() {
  const v = state.view;
  document.querySelectorAll('.nav-item').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === v.type ||
      (v.type === 'playlist' && b.dataset.view === 'library' && v.fromLibrary) ||
      (v.type === 'records' && b.dataset.view === 'library')));
  document.querySelectorAll('.pl-nav-item').forEach((b) =>
    b.classList.toggle('active', v.type === 'playlist' && Number(b.dataset.id) === v.id));
  const map = {
    home: renderHome, playlist: renderPlaylist, album: renderAlbum,
    artist: renderArtist, search: renderSearch, library: renderLibrary,
    fm: renderFM, records: renderRecords, cloud: renderCloud, similar: renderSimilar,
    nowplaying: renderNowPlaying,
  };
  (map[v.type] || renderHome)(viewEl(), v);
}

const setLoading = (root) => root.append(el('div', { class: 'loading' }, '加载中…'));

/* ------------------------------- home view ---------------------------------- */

async function renderHome(root) {
  root.textContent = '';
  root.append(el('h1', { class: 'page-title' }, '发现'));

  // 快捷入口卡（对应上游 HomeView 的每日推荐/私人漫游/心动模式入口）
  const quick = el('div', { class: 'quick-row' });
  root.append(quick);
  if (isLoggedIn()) {
    const likedList = () => state.playlists.find((p) => p.specialType === 5);
    quick.append(
      quickCard('每日推荐', '根据你的口味生成', '📅', () => {
        const sec = root.querySelector('.daily-section');
        if (sec) sec.scrollIntoView({ behavior: 'smooth' });
      }),
      quickCard('私人漫游', '从喜欢的歌开始漫游', '📡', () => nav({ type: 'fm' })),
      quickCard('心动模式', '你的红心歌曲和相似推荐', '💖', async () => {
        const pl = likedList();
        if (!pl) { toast('未找到喜欢的音乐歌单'); return; }
        nav({ type: 'playlist', id: pl.id, fromLibrary: true });
      }));
  } else {
    quick.append(quickCard('登录网易云音乐', '解锁每日推荐、私人漫游与心动模式', '🔐', () => openLogin()));
  }

  const secRec = el('div');
  const secHQ = el('div');
  const secTop = el('div');
  const secArtists = el('div');
  const secAlbums = el('div');
  const secDaily = el('div', { class: 'daily-section' });
  root.append(
    el('div', { class: 'section-title' }, isLoggedIn() ? '推荐歌单' : '精选歌单'), secRec,
    el('div', { class: 'section-title' }, '精品歌单'), secHQ,
    el('div', { class: 'section-title' }, '排行榜'), secTop,
    el('div', { class: 'section-title' }, '推荐歌手'), secArtists,
    el('div', { class: 'section-title' }, '新碟上架'), secAlbums,
    el('div', { class: 'section-title' }, isLoggedIn() ? '每日推荐' : '最新音乐'), secDaily,
  );
  for (const s of [secRec, secHQ, secTop, secArtists, secAlbums, secDaily]) setLoading(s);

  invoke('personalizedPlaylists').then((list) => {
    secRec.textContent = '';
    secRec.append(playlistGrid((list || []).map(normalizePlaylist)));
  }).catch((e) => secRec.textContent = e.message);

  invoke('highQualityPlaylists', {}).then((resp) => {
    secHQ.textContent = '';
    secHQ.append(playlistGrid((resp.playlists || []).map(normalizePlaylist), 180));
  }).catch(() => { secHQ.textContent = ''; });

  invoke('toplists').then((list) => {
    secTop.textContent = '';
    secTop.append(playlistGrid((list || []).slice(0, 12).map((t) => normalizePlaylist({
      id: t.id, name: t.name, picUrl: t.coverImgUrl, playCount: t.playCount,
      trackCount: (t.tracks || []).length, copywriter: t.updateFrequency,
    })), 150));
  }).catch((e) => { secTop.textContent = ''; secTop.append(el('div', { class: 'empty' }, e.message)); });

  // 推荐歌手：热门歌手洗牌取 6（对应上游 HomeView 的 topArtists.shuffled().prefix(6)）
  invoke('topArtists', { limit: 100 }).then((artists) => {
    secArtists.textContent = '';
    const picked = (artists || []).sort(() => Math.random() - 0.5).slice(0, 6).map(normalizeArtist);
    const grid = el('div', { class: 'grid artist-grid' });
    for (const ar of picked) {
      if (!ar) continue;
      grid.append(el('div', {
        class: 'card artist-card',
        onclick: () => nav({ type: 'artist', id: ar.id }),
      },
        el('img', { class: 'artist-avatar', src: img(ar.pic, 220), loading: 'lazy', alt: '' }),
        el('div', { class: 'card-name' }, ar.name),
        el('div', { class: 'card-sub' }, `热门歌曲 ${fmtCount(ar.musicSize)}`)));
    }
    secArtists.append(grid);
  }).catch(() => { secArtists.textContent = ''; });

  invoke('newAlbums').then((albums) => {
    secAlbums.textContent = '';
    secAlbums.append(playlistGrid((albums || []).map((a) => {
      const al = normalizeAlbum(a);
      return { id: al.id, name: al.name, cover: al.pic, playCount: 0, trackCount: al.size, copywriter: al.artistName };
    })));
  }).catch(() => { secAlbums.textContent = ''; });

  if (isLoggedIn()) {
    invoke('recommendResource').then((list) => {
      if ((list || []).length) { secRec.textContent = ''; secRec.append(playlistGrid(list.map(normalizePlaylist))); }
    }).catch(() => {});
    invoke('dailyRecommendSongs').then((songs) => {
      secDaily.textContent = '';
      secDaily.append(trackTable({ tracks: (songs || []).slice(0, 12).map(normalizeTrack), sourceID: 0 }));
    }).catch(() => { secDaily.textContent = ''; });
  } else {
    invoke('personalizedNewSongs').then((songs) => {
      secDaily.textContent = '';
      secDaily.append(trackTable({ tracks: (songs || []).map(normalizeTrack), sourceID: 0 }));
    }).catch(() => { secDaily.textContent = ''; });
  }
}

function quickCard(title, subtitle, icon, onClick) {
  return el('div', { class: 'quick-card', onclick: onClick },
    el('div', { class: 'qc-icon' }, icon),
    el('div', { class: 'qc-meta' },
      el('div', { class: 'qc-title' }, title),
      el('div', { class: 'qc-sub' }, subtitle)));
}

function playlistGrid(list, coverSize = 220) {
  const grid = el('div', { class: 'grid' });
  for (const pl of list) {
    if (!pl) continue;
    const card = el('div', {
      class: 'card',
      onclick: () => nav({ type: 'playlist', id: pl.id, fromLibrary: false }),
    },
      el('div', { class: 'cover-wrap' },
        el('img', { src: img(pl.cover, coverSize), loading: 'lazy', alt: '' }),
        el('button', {
          class: 'play-overlay', title: '播放',
          onclick: (ev) => { ev.stopPropagation(); playPlaylist(pl.id); },
        }, '▶')),
      el('div', { class: 'card-name' }, pl.name),
      pl.copywriter
        ? el('div', { class: 'card-sub' }, pl.copywriter)
        : el('div', { class: 'card-sub' }, `${fmtCount(pl.playCount)}次播放 · ${pl.trackCount}首`));
    grid.append(card);
  }
  return grid;
}

/* ----------------------------- playlist view -------------------------------- */

async function renderPlaylist(root, view) {
  root.textContent = '';
  setLoading(root);
  try {
    const resp = await invoke('playlistDetail', { id: view.id });
    root.textContent = '';
    const pl = resp.playlist || {};
    const privMap = new Map((resp.privileges || []).map((p) => [p.id, p]));
    const own = isLoggedIn() && pl.creator && pl.creator.userId === state.account.userId;
    const detail = normalizePlaylist({
      id: pl.id, name: pl.name, coverImgUrl: pl.coverImgUrl, playCount: pl.playCount,
      trackCount: pl.trackCount, subscribed: pl.subscribed, specialType: pl.specialType,
      creator: pl.creator, copywriter: null,
    });
    detail.description = pl.description || '';
    detail.subscribedCount = pl.subscribedCount || 0;
    let tracks = (pl.tracks || []).map(normalizeTrack);
    // Big playlists only embed the first ~1000 tracks; resolve the rest by id.
    const ids = (pl.trackIds || []).map((r) => r.id);
    if (ids.length > tracks.length) {
      const missing = ids.filter((id) => !tracks.some((t) => t.id === id));
      for (let i = 0; i < missing.length; i += 500) {
        try {
          const extra = await invoke('songDetails', { ids: missing.slice(i, i + 500) });
          tracks = tracks.concat((extra.songs || []).map(normalizeTrack));
        } catch (_) {}
      }
    }
    root.append(detailHead({
      cover: detail.cover, name: detail.name,
      lines: [
        pl.creator ? `创建者：${pl.creator.nickname || ''}` : '',
        `${fmtCount(detail.playCount)}次播放 · ${detail.trackCount}首 · 收藏 ${fmtCount(detail.subscribedCount)}`,
      ],
      desc: detail.description,
      onPlay: () => { if (tracks.length) playQueue(tracks, 0, view.id); },
      onHeart: tracks.length ? async () => {
        try {
          const list = await invoke('intelligenceList', { songID: tracks[0].id, playlistID: view.id });
          const intelligent = list.map(normalizeTrack).filter(Boolean);
          if (intelligent.length) playQueue(intelligent, 0, view.id);
        } catch (e) { toast(e.message); }
      } : null,
      subscribed: detail.subscribed,
      onSub: own || detail.specialType === 5 ? null : async (btn) => {
        try {
          await invoke('subscribePlaylist', { id: view.id, subscribe: !detail.subscribed });
          detail.subscribed = !detail.subscribed;
          btn.textContent = detail.subscribed ? '已收藏' : '收藏';
          toast(detail.subscribed ? '已收藏歌单' : '已取消收藏');
        } catch (e) { toast(e.message); }
      },
      onDelete: own && detail.specialType !== 5 ? async () => {
        if (!(await confirmAsync(`删除歌单「${detail.name}」？`))) return;
        try {
          await invoke('deletePlaylist', { id: view.id });
          toast('歌单已删除');
          state.history.pop();
          refreshLibraryNav();
          nav({ type: 'library' });
        } catch (e) { toast(e.message); }
      } : null,
    }, '歌单'));
    root.append(trackTable({ tracks, privileges: privMap, sourceID: view.id, removable: own && detail.specialType !== 5 }));
  } catch (e) {
    root.textContent = '';
    root.append(el('div', { class: 'empty' }, e.message));
  }
}

async function playPlaylist(id) {
  try {
    const resp = await invoke('playlistDetail', { id });
    const tracks = (resp.playlist.tracks || []).map(normalizeTrack);
    if (tracks.length) playQueue(tracks, 0, id);
    else toast('歌单为空');
  } catch (e) { toast(e.message); }
}

function detailHead({ cover, name, lines, desc, onPlay, onHeart, onSub, subscribed, onDelete }, kind) {
  const meta = el('div', { class: 'dh-meta' },
    el('h2', {}, name),
    ...lines.filter(Boolean).map((l) => el('div', { class: 'dh-line' }, l)),
    el('div', {},
      el('button', { class: 'btn primary', onclick: onPlay }, `播放${kind || ''}`),
      onHeart ? el('button', { class: 'btn', onclick: onHeart, title: '以心动模式播放' }, '心动模式') : null,
      onSub ? el('button', { class: 'btn', onclick: (ev) => onSub(ev.currentTarget) }, subscribed ? '已收藏' : '收藏') : null,
      onDelete ? el('button', { class: 'btn', onclick: onDelete }, '删除歌单') : null),
    desc ? el('div', { class: 'dh-desc' }, desc) : null);
  return el('div', { class: 'detail-head' },
    el('img', { src: img(cover, 380), alt: '' }), meta);
}

/* ----------------------------- track table ---------------------------------- */

function trackTable({ tracks, privileges, sourceID, removable }) {
  const table = el('table', { class: 'track-table' });
  table.append(el('thead', {}, el('tr', {},
    el('td', { class: 't-index' }, ''), el('td', {}, '标题'),
    el('td', {}, '歌手'), el('td', {}, '专辑'), el('td', { class: 't-duration' }, '时长'))));
  const tbody = el('tbody');
  tracks.forEach((track, i) => {
    const privilege = privileges ? privileges.get(track.id) : null;
    const p = playability(track, privilege, isLoggedIn(), vipType());
    const sub = trackSubtitle(track);
    const current = player.queue[player.index] && player.queue[player.index].track.id === track.id;
    const liked = state.likedIds.has(track.id);
    const tr = el('tr', {
      class: current ? 'current' : '',
      ondblclick: () => playQueue(tracks, i, sourceID),
      oncontextmenu: (ev) => {
        ev.preventDefault();
        openContextMenu(track, ev.clientX, ev.clientY);
      },
    },
      el('td', { class: 't-index' },
        el('button', { class: 't-play-btn', title: '播放', onclick: () => playQueue(tracks, i, sourceID) },
          current && !audio.paused ? '♪' : '▶')),
      el('td', { class: 't-name', title: track.name },
        track.name,
        sub ? el('span', { class: 't-sub' }, `（${sub}）`) : null,
        p === 'vipOnly' ? el('span', { class: 'tag vip' }, 'VIP') : null,
        p === 'paidAlbum' ? el('span', { class: 'tag vip' }, '付费') : null,
        p === 'noCopyright' || p === 'delisted' ? el('span', { class: 'tag nc' }, '无版权') : null),
      el('td', { class: 't-artist' },
        track.artists.map((a, ai) => el('span', {
          onclick: (ev) => { ev.stopPropagation(); if (a.id) nav({ type: 'artist', id: a.id }); },
        }, (ai ? ' / ' : '') + a.name))),
      el('td', { class: 't-album' },
        el('span', {
          onclick: (ev) => { ev.stopPropagation(); if (track.album.id) nav({ type: 'album', id: track.album.id }); },
        }, track.album.name)),
      el('td', { class: 't-duration' }, fmtDurationMS(track.durationMS)),
      el('td', { class: 't-duration' },
        el('span', { class: 't-act' },
          el('button', {
            class: `t-like${liked ? ' liked' : ''}`, title: '喜欢',
            onclick: (ev) => { ev.stopPropagation(); toggleLike(track.id); },
          }, liked ? '♥' : '♡'),
          el('button', {
            class: 't-like', title: '添加到歌单',
            onclick: (ev) => { ev.stopPropagation(); openAddMenu(track.id, ev.currentTarget); },
          }, '＋'),
          removable ? el('button', {
            class: 't-like', title: '从歌单移除',
            onclick: async (ev) => {
              ev.stopPropagation();
              try {
                await invoke('playlistTracks', { op: 'del', playlistID: sourceID, trackIDs: [track.id] });
                toast('已从歌单移除');
                render();
              } catch (e) { toast(e.message); }
            },
          }, '✕') : null)));
    tbody.append(tr);
  });
  table.append(tbody);
  return table;
}

/* --------------------------- add-to-playlist menu ---------------------------- */

async function openAddMenu(trackID, anchor) {
  const menu = $('#add-menu');
  if (!isLoggedIn()) { toast('需要登录'); openLogin(); return; }
  if (!state.playlists.length) {
    try { state.playlists = (await invoke('userPlaylists', { uid: state.account.userId })).map(normalizePlaylist); }
    catch (e) { toast(e.message); return; }
  }
  menu.textContent = '';
  for (const pl of state.playlists) {
    if (pl.specialType === 5) continue;          // 我喜欢的音乐 走红心接口
    menu.append(el('div', {
      class: 'add-menu-item', text: pl.name,
      onclick: async () => {
        closeAddMenu();
        try {
          await invoke('playlistTracks', { op: 'add', playlistID: pl.id, trackIDs: [trackID] });
          toast(`已添加到「${pl.name}」`);
        } catch (e) { toast(e.message); }
      },
    }, pl.name));
  }
  menu.append(el('div', {
    class: 'add-menu-item add-menu-new',
    onclick: async () => {
      closeAddMenu();
      const name = await promptModal('新建歌单名称');
      if (!name) return;
      try {
        const resp = await invoke('createPlaylist', { name, isPrivate: false });
        if (resp && resp.id) {
          await invoke('playlistTracks', { op: 'add', playlistID: resp.id, trackIDs: [trackID] });
          toast(`已创建「${name}」并添加歌曲`);
          refreshLibraryNav();
        }
      } catch (e) { toast(e.message); }
    },
  }, '＋ 新建歌单并添加'));
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(r.left - 160, window.innerWidth - 230)) + 'px';
  menu.style.top = Math.min(r.bottom + 6, window.innerHeight - 200) + 'px';
  setTimeout(() => document.addEventListener('click', closeAddMenu, { once: true }), 0);
}
function closeAddMenu() { $('#add-menu').hidden = true; }

/* ----------------------------- context menu --------------------------------- */

/// 曲目右键菜单，对齐上游 TrackList.contextMenuItems：
/// 下一首播放 / 我喜欢 / 收藏到歌单 / 查看专辑 / 查看歌手 / 复制链接。
function openContextMenu(track, x, y) {
  const menu = $('#add-menu');
  const liked = state.likedIds.has(track.id);
  menu.textContent = '';
  const item = (label, fn) => el('div', { class: 'add-menu-item', onclick: () => { closeAddMenu(); fn(); } }, label);
  menu.append(
    item('下一首播放', () => { if (!player.queue.length) { playQueue([track], 0, 0); } else addPlayNext(track); }),
    item(liked ? '从「我喜欢」中移除' : '添加到「我喜欢」', () => toggleLike(track.id)),
    item('收藏到歌单…', () => setTimeout(() => openAddMenu(track.id, {
      getBoundingClientRect: () => ({ left: x, bottom: y, right: x, top: y }),
    }), 0)));
  if (track.album.id) {
    menu.append(item(`查看专辑：${track.album.name}`, () => nav({ type: 'album', id: track.album.id })));
  }
  for (const a of track.artists.slice(0, 3)) {
    if (a.id) menu.append(item(`查看歌手：${a.name}`, () => nav({ type: 'artist', id: a.id })));
  }
  menu.append(item('复制链接', async () => {
    await invoke('copyText', { text: `https://music.163.com/song?id=${track.id}` });
    toast('链接已复制');
  }));
  menu.hidden = false;
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - 230)) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - menu.offsetHeight - 12) + 'px';
  setTimeout(() => document.addEventListener('click', closeAddMenu, { once: true }), 0);
}

/* ----------------------------- album / artist ------------------------------- */

async function renderAlbum(root, view) {
  root.textContent = '';
  setLoading(root);
  try {
    const [resp, dyn] = await Promise.all([
      invoke('album', { id: view.id }),
      invoke('albumDynamic', { id: view.id }).catch(() => null),
    ]);
    root.textContent = '';
    const album = resp.album || {};
    const tracks = (resp.songs || []).map(normalizeTrack);
    let subscribed = Boolean(dyn && dyn.isSub);
    root.append(detailHead({
      cover: album.picUrl, name: album.name,
      lines: [
        album.artist ? `歌手：${album.artist.name}` : '',
        `${album.company || ''} · ${album.size || tracks.length}首 · 收藏 ${fmtCount(dyn && dyn.subCount)}`,
        album.publishTime ? new Date(album.publishTime).toLocaleDateString('zh-CN') : '',
      ],
      desc: album.description,
      onPlay: () => { if (tracks.length) playQueue(tracks, 0, view.id); },
      subscribed,
      onSub: async (btn) => {
        try {
          await invoke('subscribeAlbum', { id: view.id, subscribe: !subscribed });
          subscribed = !subscribed;
          btn.textContent = subscribed ? '已收藏' : '收藏专辑';
          toast(subscribed ? '已收藏专辑' : '已取消收藏');
        } catch (e) { toast(e.message); }
      },
    }, '专辑'));
    root.append(trackTable({ tracks, sourceID: view.id }));
  } catch (e) {
    root.textContent = '';
    root.append(el('div', { class: 'empty' }, e.message));
  }
}

async function renderArtist(root, view) {
  root.textContent = '';
  setLoading(root);
  try {
    const [resp, albumsResp, simResp] = await Promise.all([
      invoke('artist', { id: view.id }),
      invoke('artistAlbums', { id: view.id }).catch(() => null),
      invoke('similarArtists', { id: view.id }).catch(() => null),
    ]);
    root.textContent = '';
    const artist = normalizeArtist(resp.artist || {});
    const tracks = (resp.hotSongs || []).map(normalizeTrack);
    let followed = artist.followed;
    root.append(detailHead({
      cover: artist.pic, name: artist.name,
      lines: [`单曲 ${artist.musicSize || tracks.length} · 专辑 ${artist.albumSize || 0}`],
      desc: artist.brief || '',
      onPlay: () => { if (tracks.length) playQueue(tracks, 0, view.id); },
      subscribed: followed,
      onSub: async (btn) => {
        try {
          await invoke('subscribeArtist', { id: view.id, subscribe: !followed });
          followed = !followed;
          btn.textContent = followed ? '已关注' : '关注';
          toast(followed ? '已关注歌手' : '已取消关注');
        } catch (e) { toast(e.message); }
      },
    }, '热门歌曲'));
    root.append(trackTable({ tracks, sourceID: view.id }));
    if (simResp && (simResp || []).length) {
      root.append(el('div', { class: 'section-title' }, '相似歌手'));
      root.append(playlistGrid(simResp.map((a) => {
        const ar = normalizeArtist(a);
        return { id: ar.id, name: ar.name, cover: ar.pic, playCount: 0, trackCount: 0, copywriter: `专辑 ${ar.albumSize}` };
      }), 150));
    }
    if (albumsResp && (albumsResp.hotAlbums || []).length) {
      root.append(el('div', { class: 'section-title' }, '专辑'));
      root.append(playlistGrid(albumsResp.hotAlbums.map((a) => {
        const al = normalizeAlbum(a);
        return { id: al.id, name: al.name, cover: al.pic, playCount: 0, trackCount: al.size, copywriter: al.artistName };
      })));
    }
  } catch (e) {
    root.textContent = '';
    root.append(el('div', { class: 'empty' }, e.message));
  }
}

/* ------------------------------ similar songs -------------------------------- */

async function renderSimilar(root) {
  root.textContent = '';
  const entry = currentEntry();
  if (!entry) {
    root.append(el('div', { class: 'empty' }, '先播放一首歌，再来看相似推荐'));
    return;
  }
  root.append(el('h1', { class: 'page-title' }, `与「${entry.track.name}」相似`));
  setLoading(root);
  try {
    const songs = await invoke('similarSongs', { id: entry.track.id });
    root.textContent = '';
    root.append(el('h1', { class: 'page-title' }, `与「${entry.track.name}」相似`));
    const tracks = (songs || []).map(normalizeTrack);
    if (!tracks.length) {
      root.append(el('div', { class: 'empty' }, '没有找到相似歌曲'));
      return;
    }
    root.append(trackTable({ tracks, sourceID: 0 }));
  } catch (e) {
    root.textContent = '';
    root.append(el('div', { class: 'empty' }, e.message));
  }
}

/* ------------------------------ now playing ---------------------------------- */

/// 独立「正在播放」大页（对应上游 NowPlayingView）：大封面 + 歌词主体。
function renderNowPlaying(root) {
  root.textContent = '';
  const entry = currentEntry();
  if (!entry) {
    root.append(el('div', { class: 'empty' }, '还没有在播放的歌曲'));
    return;
  }
  const track = entry.track;
  const lyricBox = el('div', { class: 'np-lyrics' });
  const renderLines = () => {
    lyricBox.textContent = '';
    if (!player.lyrics.length) {
      lyricBox.append(el('div', { class: 'empty' }, '暂无歌词'));
      return;
    }
    for (const line of player.lyrics) {
      lyricBox.append(el('div', {
        class: 'lyrics-line', 'data-time': line.time,
        onclick: () => { audio.currentTime = line.time; },
      },
        el('div', {}, line.text || '♪'),
        line.tl ? el('div', { class: 'tl' }, line.tl) : null,
        line.rl ? el('div', { class: 'tl rl' }, line.rl) : null));
    }
  };
  renderLines();
  root.append(el('div', { class: 'np-page' },
    el('div', { class: 'np-left' },
      el('img', { class: 'np-cover', src: img(track.album.picUrl, 640), alt: '' }),
      el('div', { class: 'np-title' }, track.name),
      el('div', { class: 'np-sub' }, artistNames(track)),
      track.album.name ? el('div', {
        class: 'np-sub np-album', onclick: () => nav({ type: 'album', id: track.album.id }),
      }, track.album.name) : null,
      el('button', { class: 'btn np-close', onclick: () => back() }, '↓ 收起')),
    lyricBox));
}

/* -------------------------------- personal FM -------------------------------- */

async function renderFM(root) {
  root.textContent = '';
  root.append(el('h1', { class: 'page-title' }, '私人 FM'));
  if (!isLoggedIn()) {
    root.append(el('div', { class: 'empty' }, '登录后即可收听私人 FM'));
    return;
  }
  setLoading(root);
  try {
    const songs = await invoke('personalFM');
    root.textContent = '';
    const tracks = (songs || []).map(normalizeTrack).filter(Boolean);
    if (!tracks.length) {
      root.append(el('div', { class: 'empty' }, 'FM 暂无内容，稍后再试'));
      return;
    }
    const heroTrack = tracks[0];
    root.append(el('div', { class: 'fm-hero' },
      el('img', { src: img(heroTrack.album.picUrl, 440), alt: '' }),
      el('div', {},
        el('h2', {}, heroTrack.name),
        el('div', { class: 'dh-line' }, artistNames(heroTrack)),
        el('div', { style: 'margin-top:14px' },
          el('button', {
            class: 'btn primary',
            onclick: () => startFM(tracks),
          }, '播放 FM'),
          el('button', {
            class: 'btn',
            onclick: async () => {
              try {
                await invoke('fmTrash', { id: heroTrack.id });
                toast('已扔进垃圾桶');
                render();
              } catch (e) { toast(e.message); }
            },
          }, '不喜欢（扔进垃圾桶）')))));
    root.append(trackTable({
      tracks,
      sourceID: -100,
      removable: 'fm',
    }));
  } catch (e) {
    root.textContent = '';
    root.append(el('div', { class: 'empty' }, e.message));
  }
}

async function startFM(tracks) {
  player.fmActive = true;
  playQueue(tracks, 0, -100);
}
async function fmExtend() {
  try {
    const songs = await invoke('personalFM');
    const more = (songs || []).map(normalizeTrack).filter(Boolean);
    if (!more.length) return false;
    player.queue.push(...more.map((t) => ({ track: t, sourceID: -100 })));
    renderQueuePanel();
    return true;
  } catch (_) { return false; }
}

/* -------------------------------- play records ------------------------------- */

async function renderRecords(root, view) {
  root.textContent = '';
  root.append(el('h1', { class: 'page-title' }, '听歌排行'));
  if (!isLoggedIn()) {
    root.append(el('div', { class: 'empty' }, '登录后查看听歌排行'));
    return;
  }
  const week = view.week !== false;
  const seg = el('div', { class: 'seg' });
  seg.append(
    el('button', {
      class: week ? 'active' : '', onclick: () => nav({ type: 'records', week: true }),
    }, '最近一周'),
    el('button', {
      class: !week ? 'active' : '', onclick: () => nav({ type: 'records', week: false }),
    }, '所有时间'));
  root.append(seg, el('div', { class: 'dh-line', style: 'margin-bottom:12px' },
    week ? '按最近一周播放次数排序' : '按历史总播放次数排序'));
  const container = el('div');
  root.append(container);
  setLoading(container);
  try {
    const items = await invoke('playRecords', { uid: state.account.userId, week });
    container.textContent = '';
    if (!items.length) {
      container.append(el('div', { class: 'empty' }, '还没有播放记录'));
      return;
    }
    const tracks = items.map((it) => normalizeTrack(it.song)).filter(Boolean);
    // 注：表格统一渲染，播报次数放在行首替换序号列附近不可行，改为附加列。
    container.append(recordsTable(items, tracks));
  } catch (e) {
    container.textContent = '';
    container.append(el('div', { class: 'empty' }, e.message));
  }
}

function recordsTable(items, tracks) {
  const table = el('table', { class: 'track-table' });
  table.append(el('thead', {}, el('tr', {},
    el('td', { class: 't-index' }, '次'), el('td', {}, '标题'),
    el('td', {}, '歌手'), el('td', {}, '专辑'), el('td', { class: 't-duration' }, '时长'))));
  const tbody = el('tbody');
  items.forEach((it, i) => {
    const track = tracks[i];
    if (!track) return;
    const current = player.queue[player.index] && player.queue[player.index].track.id === track.id;
    const liked = state.likedIds.has(track.id);
    tbody.append(el('tr', {
      class: current ? 'current' : '',
      ondblclick: () => playQueue(tracks, i, 0),
    },
      el('td', { class: 't-index' }, el('span', { class: 'pc-badge' }, fmtCount(it.playCount)),
        el('button', { class: 't-play-btn', title: '播放', onclick: () => playQueue(tracks, i, 0) }, '▶')),
      el('td', { class: 't-name' }, track.name),
      el('td', { class: 't-artist' }, artistNames(track)),
      el('td', { class: 't-album' }, track.album.name),
      el('td', { class: 't-duration' }, fmtDurationMS(track.durationMS)),
      el('td', { class: 't-duration' },
        el('button', {
          class: `t-like${liked ? ' liked' : ''}`, title: '喜欢',
          onclick: (ev) => { ev.stopPropagation(); toggleLike(track.id); },
        }, liked ? '♥' : '♡'))));
  });
  table.append(tbody);
  return table;
}

/* --------------------------------- cloud disk -------------------------------- */

async function renderCloud(root) {
  root.textContent = '';
  root.append(el('h1', { class: 'page-title' }, '云盘音乐'));
  if (!isLoggedIn()) {
    root.append(el('div', { class: 'empty' }, '登录后查看云盘音乐'));
    return;
  }
  const stats = el('div', { class: 'dh-line', style: 'margin-bottom:12px' });
  root.append(stats);
  const container = el('div');
  root.append(container);
  setLoading(container);
  try {
    const resp = await invoke('cloudSongs');
    container.textContent = '';
    const items = resp.data || [];
    if (!items.length) {
      container.append(el('div', { class: 'empty' }, '云盘是空的'));
      return;
    }
    if (resp.size && resp.maxSize) {
      stats.textContent = `已用 ${fmtBytes(Number(resp.size))} / ${fmtBytes(Number(resp.maxSize))}`;
    }
    const table = el('table', { class: 'track-table' });
    table.append(el('thead', {}, el('tr', {},
      el('td', { class: 't-index' }, ''), el('td', {}, '标题'),
      el('td', {}, '歌手'), el('td', {}, '专辑'), el('td', { class: 't-duration' }, '大小'))));
    const tbody = el('tbody');
    const tracks = items.map((it) => normalizeTrack(it.simpleSong) || {
      id: it.songId, name: it.songName || '未知歌曲',
      artists: [{ id: 0, name: it.artist || '未知歌手' }],
      album: { id: 0, name: it.album || '', picUrl: null },
      durationMS: 0, alias: [], tns: [], fee: 0, mv: 0,
      noCopyrightRcmd: false, pc: true, privilege: null,
    });
    items.forEach((it, i) => {
      const track = tracks[i];
      const current = player.queue[player.index] && player.queue[player.index].track.id === track.id;
      tbody.append(el('tr', {
        class: current ? 'current' : '',
        ondblclick: () => playQueue(tracks, i, -200),
      },
        el('td', { class: 't-index' },
          el('button', { class: 't-play-btn', title: '播放', onclick: () => playQueue(tracks, i, -200) }, '▶')),
        el('td', { class: 't-name' }, track.name),
        el('td', { class: 't-artist' }, artistNames(track)),
        el('td', { class: 't-album' }, track.album.name),
        el('td', { class: 't-duration' }, fmtBytes(it.fileSize)),
        el('td', { class: 't-duration' },
          el('button', {
            class: 't-like', title: '从云盘删除',
            onclick: async (ev) => {
              ev.stopPropagation();
              if (!(await confirmAsync(`从云盘删除「${track.name}」？`))) return;
              try {
                await invoke('cloudDelete', { id: it.songId });
                toast('已删除');
                render();
              } catch (e) { toast(e.message); }
            },
          }, '✕'))));
    });
    table.append(tbody);
    container.append(table);
  } catch (e) {
    container.textContent = '';
    container.append(el('div', { class: 'empty' }, e.message));
  }
}

/* -------------------------------- search ------------------------------------ */

let searchTimer = null;
let suggestTimer = null;
async function renderSearch(root, view) {
  root.textContent = '';
  const keywords = view.keywords || '';
  const type = view.searchType || 1;

  const input = el('input', {
    type: 'text', placeholder: '搜索音乐、歌手、专辑、歌单', value: keywords,
    oninput: () => queueSuggest(input.value),
    onkeydown: (ev) => {
      if (ev.key === 'Enter') doSearch(input.value, type);
      if (ev.key === 'Escape') closeSuggest();
    },
  });
  const suggestWrap = el('div', { class: 'suggest-wrap' }, input);
  const doSearch = (kw, t) => { closeSuggest(); if (kw.trim()) nav({ type: 'search', keywords: kw.trim(), searchType: t }); };
  root.append(el('div', { class: 'search-bar' }, suggestWrap,
    el('button', { class: 'btn primary', onclick: () => doSearch(input.value, type) }, '搜索')));
  input.focus();

  // 默认搜索词作为 placeholder
  invoke('searchDefaultKeyword').then((kw) => {
    if (kw && !input.value) input.placeholder = `大家都在搜：${kw}`;
  }).catch(() => {});

  const tabs = el('div', { class: 'tabs' });
  const types = [[1, '单曲'], [10, '专辑'], [100, '歌手'], [1000, '歌单']];
  for (const [t, label] of types) {
    tabs.append(el('button', {
      class: `tab${type === t ? ' active' : ''}`,
      onclick: () => doSearch(keywords, t),
    }, label));
  }
  root.append(tabs);
  const results = el('div');
  root.append(results);

  const run = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      results.textContent = '';
      setLoading(results);
      try {
        const r = await invoke('search', { keywords, type, limit: 50 });
        results.textContent = '';
        const sec = el('div');
        results.append(sec);
        const types2 = { 1: '单曲', 10: '专辑', 100: '歌手', 1000: '歌单' };
        if (type === 1) {
          const tracks = (r.songs || []).map(normalizeTrack);
          if (!tracks.length) { results.append(el('div', { class: 'empty' }, '没有找到相关内容')); return; }
          sec.append(trackTable({ tracks, sourceID: 0 }));
        } else if (type === 10) {
          const albums = (r.albums || []).map(normalizeAlbum);
          if (!albums.length) { results.append(el('div', { class: 'empty' }, '没有找到相关内容')); return; }
          sec.append(playlistGrid(albums.map((a) => ({ id: a.id, name: a.name, cover: a.pic, trackCount: a.size, playCount: 0, copywriter: a.artistName }))));
        } else if (type === 100) {
          const artists = (r.artists || []).map(normalizeArtist);
          if (!artists.length) { results.append(el('div', { class: 'empty' }, '没有找到相关内容')); return; }
          sec.append(playlistGrid(artists.map((a) => ({ id: a.id, name: a.name, cover: a.pic, copywriter: `专辑 ${a.albumSize}`, trackCount: 0, playCount: 0 })), 150));
        } else {
          const pls = (r.playlists || []).map(normalizePlaylist);
          if (!pls.length) { results.append(el('div', { class: 'empty' }, '没有找到相关内容')); return; }
          sec.append(playlistGrid(pls));
        }
      } catch (e) {
        results.textContent = '';
        results.append(el('div', { class: 'empty' }, e.message));
      }
    }, 200);
  };
  if (keywords) run();
  else results.append(el('div', { class: 'empty' }, '输入关键词开始搜索'));

  /* 搜索联想 */
  function queueSuggest(kw) {
    clearTimeout(suggestTimer);
    if (!kw.trim()) { closeSuggest(); return; }
    suggestTimer = setTimeout(async () => {
      try {
        const sug = await invoke('searchSuggest', { keywords: kw.trim() });
        if (!sug) { closeSuggest(); return; }
        const items = [
          ...(sug.songs || []).slice(0, 5).map((s) => ({ kind: '单曲', name: s.name, kw: s.name })),
          ...(sug.artists || []).slice(0, 3).map((a) => ({ kind: '歌手', name: a.name, navTo: { type: 'artist', id: a.id } })),
          ...(sug.albums || []).slice(0, 3).map((a) => ({ kind: '专辑', name: a.name, navTo: { type: 'album', id: a.id } })),
          ...(sug.playlists || []).slice(0, 3).map((p) => ({ kind: '歌单', name: p.name, navTo: { type: 'playlist', id: p.id } })),
        ];
        if (!items.length) { closeSuggest(); return; }
        const box = el('div', { id: 'suggest' });
        for (const it of items) {
          box.append(el('div', {
            class: 'sg-item',
            onmousedown: () => {
              closeSuggest();
              if (it.navTo) { input.value = it.name; nav(it.navTo); }
              else doSearch(it.kw, 1);
            },
          }, el('span', { class: 'sg-kind' }, it.kind), el('span', { class: 'sg-name' }, it.name)));
        }
        closeSuggest();
        suggestWrap.append(box);
      } catch (_) { closeSuggest(); }
    }, 300);
  }
  function closeSuggest() {
    const old = suggestWrap.querySelector('#suggest');
    if (old) old.remove();
  }
}

/* ------------------------------- library ------------------------------------ */

async function renderLibrary(root) {
  root.textContent = '';
  const head = el('div', { style: 'display:flex;align-items:center;gap:12px' },
    el('h1', { class: 'page-title', style: 'margin:0' }, '我的音乐'));
  if (isLoggedIn()) {
    head.append(el('button', {
      class: 'btn', style: 'margin:0 0 16px',
      onclick: async () => {
        const name = await promptModal('新建歌单名称');
        if (!name) return;
        try {
          await invoke('createPlaylist', { name, isPrivate: false });
          toast(`已创建「${name}」`);
          refreshLibraryNav();
          render();
        } catch (e) { toast(e.message); }
      },
    }, '＋ 新建歌单'));
  }
  root.append(head);
  if (!isLoggedIn()) {
    root.append(el('div', { class: 'empty' }, '登录后查看你的歌单'));
    return;
  }
  setLoading(root);
  try {
    const list = await invoke('userPlaylists', { uid: state.account.userId });
    root.textContent = '';
    root.append(head);
    root.append(playlistGrid(list.map(normalizePlaylist)));
  } catch (e) {
    root.textContent = '';
    root.append(head);
    root.append(el('div', { class: 'empty' }, e.message));
  }
}

async function refreshLibraryNav() {
  const section = $('#library-section');
  const container = $('#playlist-nav');
  container.textContent = '';
  if (!isLoggedIn()) { section.hidden = true; return; }
  section.hidden = false;
  $('#library-owner').textContent = `${state.account.nickname} 的音乐`;
  container.append(el('button', {
    class: 'nav-item', style: 'margin:2px 0',
    onclick: () => nav({ type: 'library' }),
  }, '全部歌单'));
  container.append(el('div', {
    class: 'pl-nav-item',
    onclick: () => nav({ type: 'records', week: true }),
  }, el('span', { style: 'font-size:13px' }, '📊 听歌排行')));
  container.append(el('div', {
    class: 'pl-nav-item',
    onclick: () => nav({ type: 'cloud' }),
  }, el('span', { style: 'font-size:13px' }, '☁️ 云盘音乐')));
  try {
    const list = await invoke('userPlaylists', { uid: state.account.userId });
    state.playlists = list.map(normalizePlaylist);
    for (const pl of state.playlists.slice(0, 30)) {
      container.append(el('div', {
        class: 'pl-nav-item', 'data-id': pl.id,
        onclick: () => nav({ type: 'playlist', id: pl.id, fromLibrary: true }),
      },
        el('img', { src: img(pl.cover, 60), alt: '' }),
        el('span', {}, pl.specialType === 5 ? '我喜欢的音乐' : pl.name)));
    }
  } catch (_) {}
}

/* --------------------------------- like ------------------------------------- */

async function toggleLike(id) {
  if (!isLoggedIn()) { toast('需要登录'); openLogin(); return; }
  const like = !state.likedIds.has(id);
  try {
    await invoke('likeTrack', { id, like });
    if (like) state.likedIds.add(id); else state.likedIds.delete(id);
    store.set('likedIds', [...state.likedIds]);
    updateLikeButtons();
  } catch (e) { toast(e.message); }
}
function updateLikeButtons() {
  render();
}

/* -------------------------------- player ------------------------------------ */

function playQueue(tracks, index, sourceID = 0) {
  player.queue = tracks.filter(Boolean).map((t) => ({ track: t, sourceID }));
  player.index = Math.max(0, Math.min(index, player.queue.length - 1));
  player.consecutiveFailures = 0;
  player.playNextList = [];
  if (sourceID !== -100) player.fmActive = false;
  loadCurrent(true);
}

/// "下一首播放"：插入到当前曲目之后优先播放；已在插播队列则移到队尾。
function addPlayNext(track) {
  if (!track) return;
  player.playNextList = player.playNextList.filter((t) => t.id !== track.id);
  player.playNextList.push(track);
  toast(`已添加到下一首播放：${track.name}`);
  renderQueuePanel();
}

function currentEntry() { return player.queue[player.index] || null; }

async function advance(userInitiated) {
  if (!player.queue.length && !player.playNextList.length) return;
  if (player.repeat === 'one' && !userInitiated && !player.playNextList.length) {
    audio.currentTime = 0;
    audio.play();
    return;
  }
  // 插播队列优先（对应上游 advanceToNext 的 playNextList 分支）
  if (player.playNextList.length) {
    const track = player.playNextList.shift();
    player.queue.splice(player.index + 1, 0, { track, sourceID: 0 });
    player.index += 1;
    loadCurrent(true);
    return;
  }
  if (player.index < player.queue.length - 1) {
    player.index += 1;
    loadCurrent(true);
    return;
  }
  if (player.fmActive) {
    // 私人FM：播完自动拉取下一批
    if (await fmExtend()) {
      player.index += 1;
      loadCurrent(true);
      return;
    }
    audio.pause();
    return;
  }
  if (player.repeat === 'all') {
    player.index = 0;
    loadCurrent(true);
  } else {
    audio.pause();
  }
}

function retreat() {
  if (!player.queue.length) return;
  if (player.index > 0) player.index -= 1;
  else if (player.repeat === 'all') player.index = player.queue.length - 1;
  else { audio.currentTime = 0; return; }
  loadCurrent(true);
}

async function loadCurrent(autoplay) {
  const entry = currentEntry();
  if (!entry) return;
  const track = entry.track;
  const generation = ++player.generation;
  player.scrobbled = false;
  updatePlayerBar();
  render();
  renderQueuePanel();
  loadLyrics(track, generation);
  persistPlayback();
  await resolveAndPlay(track, entry.sourceID, generation, autoplay);
}

async function resolveAndPlay(track, sourceID, generation, autoplay = true) {
  const quality = state.quality;
  let data = null;
  try { data = await invoke('songURL', { id: track.id, level: quality }); } catch (_) {}
  if (generation !== player.generation) return;
  if (!data || !data.url) {
    if (quality !== 'standard') {
      try { data = await invoke('songURL', { id: track.id, level: 'standard' }); } catch (_) {}
    }
    if (generation !== player.generation) return;
  }

  let url = data && data.url ? data.url.replace(/^http:/, 'https:') : null;
  // NetEase refused or trial-only — try third-party sources (UnblockNeteaseMusic).
  if ((!url || (data && data.freeTrialInfo)) && state.unblock) {
    try {
      const unblocked = await invoke('unblock', {
        track: { id: track.id, name: track.name, artists: track.artists, durationMS: track.durationMS },
      });
      if (generation !== player.generation) return;
      if (unblocked && unblocked.url) {
        url = unblocked.url;
        data = null;
        player.servedQuality = null;
        toast(`已使用第三方音源：${unblocked.source}`);
      }
    } catch (_) {}
  }

  if (!url) {
    player.consecutiveFailures += 1;
    const p = playability(track, null, isLoggedIn(), vipType());
    toast(`《${track.name}》无法播放${p !== 'playable' ? '：' + playabilityLabel[p] : ''}`);
    if (player.consecutiveFailures < 5) advance(false);
    else { audio.pause(); updatePlayerBar(); }
    return;
  }

  player.consecutiveFailures = 0;
  player.servedQuality = data && data.level ? data.level : null;
  audio.src = url;
  // 恢复上次播放位置（应用重启后第一次播放）
  if (player.restoreTime != null && player.restoreTime > 0) {
    audio.addEventListener('loadedmetadata', () => {
      if (player.restoreTime != null && player.restoreTime < audio.duration) {
        audio.currentTime = player.restoreTime;
      }
      player.restoreTime = null;
    }, { once: true });
  }
  if (autoplay) {
    try { await audio.play(); } catch (_) {}
  }
  updatePlayerBar();
  updateMediaSession(track, data);
  if (data && data.freeTrialInfo) toast('VIP 歌曲，当前为试听片段');
}

/* --------------------------- playback persistence ---------------------------- */

function persistPlayback() {
  if (!player.queue.length) { store.set('playback', null); return; }
  store.set('playback', {
    queue: player.queue.map((q) => q.track),
    index: player.index,
    time: audio.currentTime || 0,
    fm: player.fmActive,
    playNext: player.playNextList,
  });
}
function restorePlayback() {
  const saved = store.get('playback', null);
  if (!saved || !Array.isArray(saved.queue) || !saved.queue.length) return;
  try {
    player.queue = saved.queue.filter(Boolean).map((t) => ({ track: t, sourceID: 0 }));
    player.index = Math.max(0, Math.min(saved.index || 0, player.queue.length - 1));
    player.fmActive = Boolean(saved.fm);
    player.playNextList = (saved.playNext || []).filter(Boolean);
    player.restoreTime = saved.time > 5 ? saved.time : null;
    updatePlayerBar();
  } catch (_) {}
}
setInterval(() => { if (currentEntry() && !audio.paused) persistPlayback(); }, 10000);
window.addEventListener('beforeunload', persistPlayback);

/* ------------------------------- MediaSession -------------------------------- */

function updateMediaSession(track, data) {
  if (!('mediaSession' in navigator)) return;
  // Windows: Chromium wires MediaSession into the System Media Transport Controls,
  // so this gives taskbar/media-overlay controls + hardware keys for free.
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name,
      artist: artistNames(track),
      album: track.album.name,
      artwork: track.album.picUrl
        ? [{ src: img(track.album.picUrl, 512), sizes: '512x512', type: 'image/jpeg' }]
        : [],
    });
  } catch (_) {}
  const set = (action, handler) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {}
  };
  set('play', () => audio.play());
  set('pause', () => audio.pause());
  set('previoustrack', () => retreat());
  set('nexttrack', () => advance(true));
  set('seekto', (d) => { if (d.seekTime != null && audio.duration) audio.currentTime = d.seekTime; });
}

/* --------------------------------- lyrics ----------------------------------- */

function parseLRC(text) {
  const lines = [];
  for (const line of String(text || '').split('\n')) {
    const times = [...line.matchAll(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g)];
    if (!times.length) continue;
    const content = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of times) {
      const t = Number(m[1]) * 60 + Number(m[2]) + Number(m[3] || 0) / (m[3] && m[3].length === 2 ? 100 : 1000);
      lines.push({ time: t, text: content });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

async function loadLyrics(track, generation) {
  player.lyrics = [];
  try {
    const resp = await invoke('lyric', { id: track.id });
    if (generation !== player.generation) return;
    const main = parseLRC(resp.lrc && resp.lrc.lyric);
    // Fallback: some uploads ship untimed plain-text lyrics — still show them.
    if (!main.length && resp.lrc && resp.lrc.lyric) {
      for (const text of resp.lrc.lyric.split('\n')) {
        const t = text.trim();
        if (t) main.push({ time: -1, text: t, tl: null });
      }
    }
    const trans = parseLRC(resp.tlyric && resp.tlyric.lyric);
    const roma = parseLRC(resp.romalrc && resp.romalrc.lyric);
    const byTime = (lines) => new Map(lines.map((l) => [Math.round(l.time * 10), l.text]));
    const transByTime = byTime(trans);
    const romaByTime = byTime(roma);
    player.lyrics = main.map((l) => ({
      ...l,
      tl: transByTime.get(Math.round(l.time * 10)) || null,
      rl: romaByTime.get(Math.round(l.time * 10)) || null,
    }));
    renderLyricsPanel();
    if (state.view.type === 'nowplaying') render();   // 大页歌词刷新
  } catch (_) {}
}

/* ------------------------------ player bar UI -------------------------------- */

function updatePlayerBar() {
  const entry = currentEntry();
  const track = entry ? entry.track : null;
  $('#pb-cover').src = track ? img(track.album.picUrl, 120) : '';
  $('#pb-title').textContent = track ? track.name : '未在播放';
  $('#pb-artist').textContent = track ? artistNames(track) : '';
  $('#btn-play').textContent = audio.paused ? '▶' : '⏸';
  const liked = track && state.likedIds.has(track.id);
  $('#btn-like').textContent = liked ? '♥' : '♡';
  const badge = { standard: '标准', higher: '较高', exhigh: '极高', lossless: '无损', hires: '高解析', sky: '沉浸' };
  $('#pb-served').textContent = player.servedQuality ? (badge[player.servedQuality] || player.servedQuality) : '';
  $('#pb-served').title = player.servedQuality ? `实际音质：${player.servedQuality}` : '';
}

audio.addEventListener('timeupdate', () => {
  const dur = audio.duration || 0;
  if (dur && !seeking) $('#pb-seek').value = String(Math.round((audio.currentTime / dur) * 1000));
  $('#pb-cur').textContent = fmtDuration(audio.currentTime);
  highlightLyric();
  // Scrobble after 30s (mirrors PlayerService's progress-based trigger).
  const entry = currentEntry();
  if (entry && !player.scrobbled && audio.currentTime > 30) {
    player.scrobbled = true;
    invoke('scrobble', { trackID: entry.track.id, sourceID: entry.sourceID, seconds: Math.floor(audio.currentTime) });
  }
});
audio.addEventListener('durationchange', () => {
  $('#pb-dur').textContent = fmtDuration(audio.duration);
});
audio.addEventListener('play', updatePlayerBar);
audio.addEventListener('pause', () => { updatePlayerBar(); persistPlayback(); });
audio.addEventListener('ended', () => advance(false));
audio.addEventListener('error', () => {
  if (audio.src) advance(false);
});

let seeking = false;
$('#pb-seek').addEventListener('pointerdown', () => { seeking = true; });
$('#pb-seek').addEventListener('change', (ev) => {
  if (audio.duration) audio.currentTime = (Number(ev.target.value) / 1000) * audio.duration;
  seeking = false;
});
$('#btn-play').addEventListener('click', async () => {
  if (!currentEntry()) {
    if (player.queue.length) loadCurrent(true);
    else toast('队列是空的，去挑一首歌吧');
    return;
  }
  if (audio.paused) {
    if (!audio.src) await loadCurrent(true);   // 重启恢复后第一次播放
    else audio.play();
  } else audio.pause();
});
$('#btn-next').addEventListener('click', () => { player.consecutiveFailures = 0; advance(true); });
$('#btn-prev').addEventListener('click', retreat);
$('#btn-mode').addEventListener('click', () => {
  const modes = ['off', 'all', 'one'];
  player.repeat = modes[(modes.indexOf(player.repeat) + 1) % modes.length];
  store.set('repeat', player.repeat);
  $('#btn-mode').textContent = player.repeat === 'one' ? '🔂' : player.repeat === 'all' ? '🔁' : '➡';
  toast({ off: '顺序播放', all: '列表循环', one: '单曲循环' }[player.repeat]);
});
$('#btn-like').addEventListener('click', () => {
  const entry = currentEntry();
  if (entry) toggleLike(entry.track.id);
});
$('#pb-volume').addEventListener('input', (ev) => {
  audio.volume = Number(ev.target.value) / 100;
  store.set('volume', audio.volume);
});
$('#pb-quality').addEventListener('change', (ev) => {
  state.quality = ev.target.value;
  store.set('quality', state.quality);
  toast('音质已切换，下一首生效');
});
$('#pb-track').addEventListener('click', () => { nav({ type: 'nowplaying' }); });
$('#btn-similar').addEventListener('click', () => nav({ type: 'similar' }));

/* --------------------------- panels: queue / lyrics / settings ---------------- */

let panelMode = null;
function togglePanel(mode) {
  if (panelMode === mode) { panelMode = null; $('#panel').hidden = true; return; }
  panelMode = mode;
  $('#panel').hidden = false;
  $('#btn-queue').classList.toggle('on', mode === 'queue');
  $('#btn-lyrics').classList.toggle('on', mode === 'lyrics');
  $('#btn-settings').classList.toggle('on', mode === 'settings');
  if (mode === 'queue') renderQueuePanel();
  else if (mode === 'lyrics') renderLyricsPanel();
  else renderSettingsPanel();
}
$('#btn-queue').addEventListener('click', () => togglePanel('queue'));
$('#btn-lyrics').addEventListener('click', () => togglePanel('lyrics'));
$('#btn-settings').addEventListener('click', () => togglePanel('settings'));

function renderQueuePanel() {
  if (panelMode !== 'queue') return;
  const root = $('#panel-content');
  root.textContent = '';
  root.append(el('div', { class: 'panel-title' },
    `播放队列 · ${player.queue.length}首${player.fmActive ? ' · FM' : ''}`));
  if (player.playNextList.length) {
    root.append(el('div', { class: 'queue-group' }, '下一首播放'));
    player.playNextList.forEach((track) => {
      root.append(el('div', { class: 'queue-item play-next' },
        el('img', { src: img(track.album.picUrl, 80), alt: '' }),
        el('div', { class: 'q-meta' },
          el('div', { class: 'q-name' }, track.name),
          el('div', { class: 'q-artist' }, artistNames(track))),
        el('button', {
          class: 't-like', title: '移除',
          onclick: (ev) => {
            ev.stopPropagation();
            player.playNextList = player.playNextList.filter((t) => t.id !== track.id);
            renderQueuePanel();
          },
        }, '✕')));
    });
    root.append(el('div', { class: 'queue-group' }, '队列'));
  }
  player.queue.forEach((item, i) => {
    root.append(el('div', {
      class: `queue-item${i === player.index ? ' current' : ''}`,
      onclick: () => { player.index = i; player.consecutiveFailures = 0; loadCurrent(true); },
    },
      el('img', { src: img(item.track.album.picUrl, 80), alt: '' }),
      el('div', { class: 'q-meta' },
        el('div', { class: 'q-name' }, item.track.name),
        el('div', { class: 'q-artist' }, artistNames(item.track)))));
  });
}

function renderLyricsPanel() {
  if (panelMode !== 'lyrics') return;
  const root = $('#panel-content');
  root.textContent = '';
  root.append(el('div', { class: 'panel-title' }, '歌词'));
  if (!player.lyrics.length) {
    root.append(el('div', { class: 'empty' }, '暂无歌词'));
    return;
  }
  for (const line of player.lyrics) {
    root.append(el('div', {
      class: 'lyrics-line', 'data-time': line.time,
      onclick: () => { audio.currentTime = line.time; },
    },
      el('div', {}, line.text || '♪'),
      line.tl ? el('div', { class: 'tl' }, line.tl) : null,
      line.rl ? el('div', { class: 'tl rl' }, line.rl) : null));
  }
}

function renderSettingsPanel() {
  const root = $('#panel-content');
  root.textContent = '';
  root.append(el('div', { class: 'panel-title' }, '设置'));

  const appearanceRow = el('div', { class: 'set-row' },
    el('div', {},
      el('div', { class: 'set-label' }, '外观'),
      el('div', { class: 'set-desc' }, '跟随系统 / 浅色 / 深色')),
    el('button', {
      class: 'btn', style: 'margin:0',
      onclick: (ev) => {
        const modes = ['auto', 'dark', 'light'];
        state.appearance = modes[(modes.indexOf(state.appearance) + 1) % modes.length];
        store.set('appearance', state.appearance);
        applyAppearance();
        ev.currentTarget.textContent = { auto: '跟随系统', light: '浅色', dark: '深色' }[state.appearance];
      },
    }, { auto: '跟随系统', light: '浅色', dark: '深色' }[state.appearance] || '深色'));
  root.append(appearanceRow);

  const sw = el('label', { class: 'switch' },
    el('input', {
      type: 'checkbox', checked: state.unblock ? '' : null,
      onchange: (ev) => {
        state.unblock = ev.target.checked;
        store.set('unblock', state.unblock);
        toast(state.unblock ? '已开启第三方音源解锁' : '已关闭第三方音源解锁');
      },
    }),
    el('span', { class: 'slider' }));
  root.append(el('div', { class: 'set-row' },
    el('div', {},
      el('div', { class: 'set-label' }, '音源解锁'),
      el('div', { class: 'set-desc' }, '无版权/VIP 试听时尝试第三方音源（酷我/酷狗/pyncmd）')),
    sw));

  root.append(el('div', { class: 'set-row' },
    el('div', {},
      el('div', { class: 'set-label' }, '检查更新'),
      el('div', { class: 'set-desc' }, '对比上游 GitHub 最新版本')),
    el('button', {
      class: 'btn', style: 'margin:0',
      onclick: async (ev) => {
        ev.currentTarget.textContent = '检查中…';
        try {
          const r = await invoke('checkUpdate', {});
          ev.currentTarget.textContent = '检查更新';
          if (!r.latest) toast('暂时无法获取版本信息');
          else toast(`当前 v${r.current} · 上游最新 ${r.latest}（Windows 版需手动下载）`);
        } catch (e) { ev.currentTarget.textContent = '检查更新'; toast(e.message); }
      },
    }, '检查更新')));

  root.append(el('div', { class: 'set-version' }, 'Kumone for Windows · v0.1.0 · Electron 移植版'));
}

function applyAppearance() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const resolve = () => {
    if (state.appearance === 'auto') return mq.matches ? 'dark' : 'light';
    return state.appearance;
  };
  document.body.classList.toggle('light', resolve() === 'light');
  if (!applyAppearance._watching) {
    applyAppearance._watching = true;
    mq.addEventListener('change', () => { if (state.appearance === 'auto') applyAppearance(); });
  }
}

function highlightLyric() {
  const active = panelMode === 'lyrics' || state.view.type === 'nowplaying';
  if (!active || !player.lyrics.length) return;
  const t = audio.currentTime;
  let idx = -1;
  for (let i = 0; i < player.lyrics.length; i++) {
    if (player.lyrics[i].time <= t) idx = i; else break;
  }
  document.querySelectorAll('.lyrics-line').forEach((n) => {
    const time = Number(n.dataset.time);
    const on = player.lyrics[idx] && Math.abs(time - player.lyrics[idx].time) < 0.05;
    if (on !== n.classList.contains('current')) {
      n.classList.toggle('current', on);
      if (on) n.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
}

/* ------------------------- keyboard shortcuts / media keys -------------------- */

window.addEventListener('keydown', (ev) => {
  const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName);
  if (!$('#prompt-backdrop').hidden) return;                      // 输入弹窗内不拦截
  if (ev.key === 'Escape') {
    if (!$('#modal-backdrop').hidden) closeLogin();
    else if (!$('#prompt-backdrop').hidden) {}
    else if (panelMode) togglePanel(panelMode);
    return;
  }
  if (inInput) return;
  switch (ev.key) {
    case ' ':
      ev.preventDefault();
      $('#btn-play').click();
      break;
    case 'ArrowLeft':
      if (ev.ctrlKey || ev.metaKey) retreat();
      else if (audio.duration) audio.currentTime = Math.max(0, audio.currentTime - 5);
      break;
    case 'ArrowRight':
      if (ev.ctrlKey || ev.metaKey) { player.consecutiveFailures = 0; advance(true); }
      else if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
      break;
    case 'ArrowUp':
      ev.preventDefault();
      audio.volume = Math.min(1, audio.volume + 0.05);
      $('#pb-volume').value = String(Math.round(audio.volume * 100));
      store.set('volume', audio.volume);
      break;
    case 'ArrowDown':
      ev.preventDefault();
      audio.volume = Math.max(0, audio.volume - 0.05);
      $('#pb-volume').value = String(Math.round(audio.volume * 100));
      store.set('volume', audio.volume);
      break;
    case 'l': case 'L': togglePanel('lyrics'); break;
    case 'q': case 'Q': togglePanel('queue'); break;
    default: break;
  }
});

window.kumone.onMediaKey((key) => {
  if (key === 'MediaPlayPause') $('#btn-play').click();
  else if (key === 'MediaNextTrack') { player.consecutiveFailures = 0; advance(true); }
  else if (key === 'MediaPreviousTrack') retreat();
  else if (key === 'MediaStop') audio.pause();
});

/* --------------------------------- login ------------------------------------ */

let qrPollTimer = null;
async function openLogin() {
  $('#modal-backdrop').hidden = false;
  startQRLogin();
}
function closeLogin() {
  $('#modal-backdrop').hidden = true;
  clearTimeout(qrPollTimer);
}

async function startQRLogin() {
  const status = $('#qr-status');
  const refresh = $('#qr-refresh');
  refresh.hidden = true;
  status.className = '';
  status.textContent = '正在获取二维码…';
  clearTimeout(qrPollTimer);
  let unikey;
  try {
    unikey = await invoke('qrKey');
    const url = `https://music.163.com/login?codekey=${unikey}`;
    $('#qr-img').src = await window.kumone.invoke('qrImage', { text: url });
    status.textContent = '请使用网易云音乐 App 扫码';
  } catch (e) {
    status.textContent = `获取二维码失败：${e.message}`;
    refresh.hidden = false;
    return;
  }
  const poll = async () => {
    try {
      const check = await invoke('qrCheck', { key: unikey });
      if (check.code === 800) {
        status.textContent = '二维码已过期';
        refresh.hidden = false;
        return;
      }
      if (check.code === 802) { status.textContent = '已扫描，请在手机上确认'; }
      if (check.code === 803) {
        status.className = 'ok';
        status.textContent = '登录成功';
        await afterLogin();
        setTimeout(closeLogin, 600);
        return;
      }
    } catch (e) { status.textContent = e.message; }
    qrPollTimer = setTimeout(poll, 2000);
  };
  qrPollTimer = setTimeout(poll, 2000);
}

async function afterLogin() {
  try {
    const profile = await invoke('userAccount');
    if (!profile) throw new Error('获取账号信息失败');
    state.account = {
      userId: profile.userId,
      nickname: profile.nickname || '',
      avatarUrl: profile.avatarUrl || '',
      vipType: profile.vipType || 0,
    };
    store.set('account', state.account);
    updateAccountChip();
    refreshLibraryNav();
    invoke('likedTrackIDs', { uid: state.account.userId })
      .then((ids) => { state.likedIds = new Set(ids || []); store.set('likedIds', ids || []); render(); })
      .catch(() => {});
    render();
  } catch (e) { toast(e.message); }
}

function updateAccountChip() {
  if (state.account) {
    $('#account-avatar').src = img(state.account.avatarUrl, 60);
    $('#account-name').textContent = state.account.nickname + (vipType() > 0 ? ' (VIP)' : '');
  } else {
    $('#account-avatar').src = '';
    $('#account-name').textContent = '未登录';
  }
}

$('#account-chip').addEventListener('click', async () => {
  if (!isLoggedIn()) { openLogin(); return; }
  if (await confirmAsync('退出登录？')) {
    await invoke('logout');
    state.account = null;
    state.playlists = [];
    state.likedIds = new Set();
    store.set('account', null);
    store.set('likedIds', []);
    store.set('playback', null);
    player.queue = [];
    player.index = -1;
    player.fmActive = false;
    audio.pause();
    audio.removeAttribute('src');
    updateAccountChip();
    updatePlayerBar();
    refreshLibraryNav();
    nav({ type: 'home' });
    toast('已退出登录');
  }
});
$('#login-cancel').addEventListener('click', closeLogin);
$('#qr-refresh').addEventListener('click', startQRLogin);

/* --------------------------------- nav wiring ------------------------------- */

document.querySelectorAll('.nav-item').forEach((btn) => {
  if (btn.dataset.view) btn.addEventListener('click', () => nav({ type: btn.dataset.view }));
});

/* --------------------------------- boot ------------------------------------- */

$('#pb-quality').value = state.quality;
$('#btn-mode').textContent = player.repeat === 'one' ? '🔂' : player.repeat === 'all' ? '🔁' : '➡';
$('#pb-volume').value = String(Math.round(audio.volume * 100));
applyAppearance();
updateAccountChip();
restorePlayback();
updatePlayerBar();
refreshLibraryNav();
render();
// 已登录时启动即刷新登录态（对应上游 refreshLogin）。
if (isLoggedIn()) invoke('refreshLogin', {}).catch(() => {});
