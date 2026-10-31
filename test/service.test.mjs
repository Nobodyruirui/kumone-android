// 回归测试：移动端服务层（ticket 04）。
//
//   node test/service.test.mjs
//
// 用**假门面**注入固定返回，不打真网络。断言三条主线：
//   1. 归一化：服务层把内核原始结构交给共享归一化层，输出统一形态
//   2. 错误传播：内核失败被翻译成稳定错误码 + 五要素消息，且按码分支（不按文案）
//   3. 登录中断：needLogin 不是普通失败，而是带 resume 信息的打断
//
// 退出码：0 通过；1 不通过。

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createService } = require('../www/mobile/core/service.js');
const errors = require('../www/mobile/core/errors.js');
const L = require('../www/mobile/core/lyrics.js');

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log(`PASS - ${name}`);
  else { failed++; console.log(`FAIL - ${name}${extra ? ' :: ' + extra : ''}`); }
}

/** 造一个假门面：按 channel 返回预设结果，并记录调用参数。 */
function fakeFacade(handlers) {
  const calls = [];
  return {
    calls,
    invoke(channel, args) {
      calls.push({ channel, args });
      const h = handlers[channel];
      if (!h) return Promise.resolve({ ok: false, error: '未预设的通道 ' + channel, kind: 'business' });
      return Promise.resolve(typeof h === 'function' ? h(args) : h);
    }
  };
}

/* ------------------------------------------------ 1. 归一化路径 */

const rawSong = { id: 1, name: '曲目', ar: [{ id: 1, name: '甲' }], al: { id: 2, name: '专辑' }, dt: 1000 };
let svc = createService({
  facade: fakeFacade({
    dailyRecommendSongs: { ok: true, data: [rawSong] },
    topArtists: { ok: true, data: [{ id: 3, name: '歌手', picUrl: 'http://p' }] },
    userAccount: { ok: true, data: { userId: 9, nickname: '某人', vipType: 0 } }
  })
});

let r = await svc.dailyRecommend();
check('归一化：每日推荐返回统一形态',
  r.ok && r.data.length === 1 && r.data[0].artists[0].name === '甲' && r.data[0].album.name === '专辑',
  JSON.stringify(r));

r = await svc.topArtists();
check('归一化：推荐歌手返回统一形态', r.ok && r.data[0].name === '歌手' && r.data[0].pic === 'https://p');

r = await svc.account();
check('归一化：账号返回统一形态', r.ok && r.data.userId === 9 && r.data.nickname === '某人');

/* ------------------------------------------------ 2. 错误传播 */

svc = createService({
  facade: fakeFacade({
    dailyRecommendSongs: { ok: false, error: '数据解析失败', kind: 'decoding' },
    toplists: { ok: false, error: '网络错误 (429)', kind: null, httpStatus: 429 },
    userPlaylists: { ok: false, error: '网络错误 (401)', kind: null, httpStatus: 401 },    topArtists: { ok: false, error: '接口错误 (400)', kind: 'business', code: 400 },
    cloudSongs: { ok: false, error: '网络错误 (0)', kind: null }
  })
});

r = await svc.dailyRecommend();
check('错误：decoding → KUMONE_DECODE_FAILED', !r.ok && r.code === 'KUMONE_DECODE_FAILED');
check('错误：decoding 是 transient（可重试）', r.kind === 'transient');
check('错误：消息含五要素 Expected/State/Blocked by/Next',
  /Expected:/.test(r.message) && /State:/.test(r.message) && /Blocked by:/.test(r.message) && /Next:/.test(r.message),
  r.message);
check('错误：retryable 与 kind 一致', errors.retryable(r) === true);

r = await svc.toplists();
check('错误：429 → KUMONE_RATE_LIMITED', !r.ok && r.code === 'KUMONE_RATE_LIMITED' && r.kind === 'transient');

r = await svc.myPlaylists();
check('错误：401 → KUMONE_AUTH_EXPIRED（permanent）', !r.ok && r.code === 'KUMONE_AUTH_EXPIRED' && r.kind === 'permanent');
check('错误：permanent 不可重试', errors.retryable(r) === false);

r = await svc.topArtists();
check('错误：business → KUMONE_BUSINESS_REJECTED（permanent）',
  !r.ok && r.code === 'KUMONE_BUSINESS_REJECTED' && r.kind === 'permanent',
  JSON.stringify(r));
check('错误：业务拒绝的 next 说「不要重试」', /不要重试/.test(r.next || ''), r.next);

r = await svc.cloudSongs();
check('错误：网络失败 → KUMONE_NETWORK（transient）', !r.ok && r.code === 'KUMONE_NETWORK' && r.kind === 'transient');

/* ------------------------------------------ 3. 登录中断 */

svc = createService({
  facade: fakeFacade({
    userPlaylists: { ok: false, error: '需要登录', kind: 'needLogin' }
  })
});
r = await svc.myPlaylists(9);
check('登录中断：needLogin → KUMONE_NEED_LOGIN', !r.ok && r.code === 'KUMONE_NEED_LOGIN');
check('登录中断：带 loginInterrupt 标记', r.loginInterrupt === true);
check('登录中断：带恢复信息（哪个请求被打断）',
  r.resume && r.resume.channel === 'userPlaylists' && r.resume.args.uid === 9,
  JSON.stringify(r.resume));
check('登录中断：kind 为 permanent（不能原地重试）', r.kind === 'permanent');

/* ------------------------------------------ 4. 账号密码登录 */

const loginFacade = fakeFacade({
  cellphoneLogin: (a) => {
    if (a.phone === '138-0000-0000' && a.password === 'good-pass') {
      return { ok: true, data: { code: 200, cookie: 'MUSIC_U=x' } };
    }
    return { ok: true, data: { code: 502, message: '账号或密码错误' } };
  }
});
svc = createService({ facade: loginFacade });

r = await svc.loginByPassword('138-0000-0000', 'good-pass');
check('账号登录：成功返回 loggedIn', r.ok === true && r.data.loggedIn === true, JSON.stringify(r));
check('账号登录：确实调了 cellphoneLogin 通道',
  loginFacade.calls.some((c) => c.channel === 'cellphoneLogin'));

r = await svc.loginByPassword('138-0000-0000', 'bad-pass');
check('账号登录：凭据不对 → KUMONE_LOGIN_FAILED', !r.ok && r.code === 'KUMONE_LOGIN_FAILED');
check('账号登录：凭据不对是 permanent（不该原地重试）', r.kind === 'permanent');
check('账号登录：消息含五要素',
  /Expected:/.test(r.message) && /State:/.test(r.message) && /Next:/.test(r.message), r.message);
check('账号登录：失败原因里透出服务端说法', /账号或密码错误/.test(r.cause || ''), r.cause);

r = await svc.loginByPassword('', 'x');
check('账号登录：手机号为空 → KUMONE_LOGIN_FAILED', !r.ok && r.code === 'KUMONE_LOGIN_FAILED');
r = await svc.loginByPassword('138-0000-0000', '');
check('账号登录：密码为空 → KUMONE_LOGIN_FAILED', !r.ok && r.code === 'KUMONE_LOGIN_FAILED');
check('账号登录：空值时根本没调内核',
  !loginFacade.calls.some((c) => c.channel === 'cellphoneLogin' && !c.args.phone));

/* ------------------------------------------ 4b. 歌单 / 榜单详情取歌 */

const plFacade = fakeFacade({
  playlistDetail: {
    ok: true,
    data: {
      code: 200,
      // 网易云 v6 的真实形状：顶层没有 tracks，曲目在 playlist 里
      playlist: {
        id: 19723756, name: '飙升榜', trackCount: 100,
        picUrl: 'http://p4.music.126.net/x.jpg',
        creator: { nickname: '网易云' },
        tracks: [
          { id: 1, name: '甲', ar: [{ id: 1, name: 'A' }], al: { id: 1, name: '专辑' }, dt: 1000 },
          { id: 2, name: '乙', ar: [{ id: 2, name: 'B' }], al: { id: 1, name: '专辑' }, dt: 2000 }
        ],
        trackIds: [{ id: 1 }, { id: 2 }, { id: 3 }]
      }
    }
  },
  songDetails: {
    ok: true,
    data: { songs: [{ id: 3, name: '丙', ar: [{ id: 3, name: 'C' }], al: { id: 1, name: '专辑' }, dt: 3000 }] }
  }
});
svc = createService({ facade: plFacade });

r = await svc.playlistDetail(19723756);
check('歌单详情：曲目从 playlist.tracks 取（不是顶层）',
  r.ok && r.data.tracks.length === 2 && r.data.tracks[0].name === '甲',
  JSON.stringify(r.ok ? r.data.tracks : r));
check('歌单详情：歌单本体已归一化', r.ok && r.data.playlist.name === '飙升榜' && r.data.playlist.cover === 'https://p4.music.126.net/x.jpg');
check('歌单详情：透出完整 id 列表（供加载更多用）',
  r.ok && r.data.trackIds.length === 3 && r.data.trackIds[2] === 3);
check('歌单详情：总数来自 trackCount', r.ok && r.data.total === 100);

r = await svc.songDetails([3]);
check('批量取曲：按 id 取回曲目', r.ok && r.data.length === 1 && r.data[0].name === '丙');
r = await svc.songDetails([]);
var callsBefore = plFacade.calls.filter((c) => c.channel === 'songDetails').length;
await svc.songDetails([]);
var callsAfter = plFacade.calls.filter((c) => c.channel === 'songDetails').length;
check('批量取曲：空 id 不发请求', r.ok && r.data.length === 0 && callsAfter === callsBefore,
  'calls ' + callsBefore + ' → ' + callsAfter);

/* ------------------------------------------ 4c. 歌词取文本 */

const lyricFacade = fakeFacade({
  lyric: {
    ok: true,
    data: {
      code: 200,
      // 接口的真实形状：lrc / tlyric 是**对象**，不是字符串
      lrc: { version: 1, lyric: '[00:00.00]第一句\n[00:05.00]第二句' },
      tlyric: { version: 1, lyric: '[00:00.00]first line' },
      yrc: { version: 1, lyric: '[0,1000](0,1000,0)词' }
    }
  }
});
svc = createService({ facade: lyricFacade });
r = await svc.lyric(123);
check('歌词：lrc 从对象里取出字符串', r.ok && typeof r.data.lrc === 'string' &&
  r.data.lrc.indexOf('[00:00.00]') === 0, typeof (r.data && r.data.lrc));
check('歌词：tlyric 从对象里取出字符串', r.ok && typeof r.data.tlyric === 'string');
check('歌词：yrc 从对象里取出字符串', r.ok && typeof r.data.yrc === 'string');
check('歌词：取出的整行歌词真能解析出行',
  r.ok && L.parseLrc(r.data.lrc).length === 2, r.ok ? String(L.parseLrc(r.data.lrc).length) : '');

/* ------------------------------------------ 4d. 我的内容：建歌单 / 加歌单 / 收藏专辑 */

const mineFacade = fakeFacade({
  createPlaylist: { ok: true, data: { code: 200, playlist: { id: 555, name: '新歌单', picUrl: 'http://p1.music.126.net/x.jpg' } } },
  playlistTracks: { ok: true, data: undefined },
  subscribeAlbum: { ok: true, data: undefined },
  likedAlbums: {
    ok: true,
    data: [{ id: 7, name: '某专辑', picUrl: 'http://p2.music.126.net/a.jpg', artist: { name: '甲乐队' } }]
  }
});
svc = createService({ facade: mineFacade });

r = await svc.createPlaylist('新歌单');
check('新建歌单：返回 id 与名字', r.ok && r.data.id === 555 && r.data.name === '新歌单', JSON.stringify(r));
check('新建歌单：封面走 https', r.ok && r.data.cover === 'https://p1.music.126.net/x.jpg');

r = await svc.createPlaylist('   ');
check('新建歌单：空名字 → KUMONE_EMPTY_RESULT', !r.ok && r.code === 'KUMONE_EMPTY_RESULT');
check('新建歌单：空名字不调内核', !mineFacade.calls.some((c) => c.channel === 'createPlaylist' && !c.args.name));

r = await svc.addToPlaylist(555, [1, 2]);
check('加入歌单：成功并报了几首', r.ok && r.data.added === 2);
const pt = mineFacade.calls.find((c) => c.channel === 'playlistTracks');
check('加入歌单：op / playlistID / trackIDs 都对',
  pt && pt.args.op === 'add' && pt.args.playlistID === 555 && pt.args.trackIDs.join(',') === '1,2',
  JSON.stringify(pt && pt.args));

r = await svc.addToPlaylist(0, [1]);
check('加入歌单：没有歌单 → KUMONE_EMPTY_RESULT', !r.ok && r.code === 'KUMONE_EMPTY_RESULT');

r = await svc.subscribeAlbum(7, true);
check('收藏专辑：成功', r.ok && r.data.subscribed === true);
const sa = mineFacade.calls.find((c) => c.channel === 'subscribeAlbum');
check('收藏专辑：参数对', sa && sa.args.id === 7 && sa.args.subscribe === true);

r = await svc.likedAlbums();
check('收藏的专辑：归一化成列表', r.ok && r.data.length === 1 && r.data[0].name === '某专辑');
check('收藏的专辑：封面走 https', r.ok && r.data[0].pic === 'https://p2.music.126.net/a.jpg');

/* ------------------------------------------ 5. 分层纪律 */

const facade = fakeFacade({});
svc = createService({ facade });
await svc.toplists();
check('分层：只经内核门面调用', facade.calls.length === 1 && facade.calls[0].channel === 'toplists');
check('分层：服务层源码不含 document.', !/document\./.test(require('node:fs').readFileSync(
  new URL('../www/mobile/core/service.js', import.meta.url), 'utf8')));
check('分层：服务层源码不含 window.innerWidth', !/window\.innerWidth/.test(require('node:fs').readFileSync(
  new URL('../www/mobile/core/service.js', import.meta.url), 'utf8')));
check('分层：服务层不按内核字面量分支（不出现 kind === \'needLogin\'）',
  !/kind\s*===\s*'needLogin'/.test(require('node:fs').readFileSync(
    new URL('../www/mobile/core/service.js', import.meta.url), 'utf8')));

console.log(failed ? `\nSERVICE: ${failed} 项失败` : '\nSERVICE: ALL PASS ✔');
process.exit(failed ? 1 : 0);
