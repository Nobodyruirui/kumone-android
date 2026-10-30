// 回归测试：广播与搜索的服务层（ticket 15）。
//
//   node test/fm-search.test.mjs
//
// 用**假门面**注入固定返回，不打真网络。断言：
//   1. FM：旧版字段的曲目能归一化成统一形态
//   2. FM：不喜欢走 fmTrash 通道
//   3. 搜索：四种类型各自的结果都归一化，并带回计数
//   4. 搜索：联想的四种结果都归一化
//   5. 搜索：默认搜索词原样带回
//   6. 失败一律翻译成契约错误（按码分支，不按文案）
//
// 退出码：0 通过；1 不通过。

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createService } = require('../www/mobile/core/service.js');

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log(`PASS - ${name}`);
  else { failed++; console.log(`FAIL - ${name}${extra ? ' :: ' + extra : ''}`); }
}

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

const svc = (handlers) => createService({ facade: fakeFacade(handlers) });

/* ---------------------------------------------------- 1. FM 归一化 */

{
  // 内核 /v1/radio/get 返回的是**旧版字段**：artists / album / duration
  const rawFm = [{
    id: 3453955856, name: '排山倒海', duration: 210000,
    artists: [{ id: 1, name: '甲' }],
    album: { id: 2, name: '专辑乙', picUrl: 'http://p' }
  }];
  const s = svc({ personalFM: { ok: true, data: rawFm } });
  const r = await s.personalFM();
  check('FM：拿到 ok', r.ok === true);
  check('FM：旧版字段归一化成统一形态',
    r.data[0].name === '排山倒海' && r.data[0].durationMS === 210000 &&
    r.data[0].artists[0].name === '甲' && r.data[0].album.name === '专辑乙',
    JSON.stringify(r.data[0]));
}

/* ---------------------------------------------------- 2. FM 不喜欢 */

{
  let got = null;
  const s = svc({
    fmTrash: (a) => { got = a; return { ok: true, data: true }; }
  });
  const r = await s.fmTrash(3453955856);
  check('FM：不喜欢调了 fmTrash 通道', r.ok === true && got && got.id === 3453955856,
    JSON.stringify(got));
}

/* ---------------------------------------------------- 3. 搜索四种类型 */

{
  const rawSong = { id: 1, name: '曲目', ar: [{ id: 1, name: '甲' }], al: { id: 2, name: '专辑' }, dt: 1000 };
  const rawAlbum = { id: 3, name: '专辑', picUrl: 'http://p', artists: [{ id: 1, name: '甲' }] };
  const rawArtist = { id: 4, name: '歌手', picUrl: 'http://p' };
  const rawPlaylist = { id: 5, name: '歌单', coverImgUrl: 'http://p', creator: { nickname: '乙' } };

  const s = svc({
    search: (a) => {
      if (a.type === 1) return { ok: true, data: { songs: [rawSong], songCount: 278 } };
      if (a.type === 10) return { ok: true, data: { albums: [rawAlbum], albumCount: 592 } };
      if (a.type === 100) return { ok: true, data: { artists: [rawArtist], artistCount: 84 } };
      return { ok: true, data: { playlists: [rawPlaylist], playlistCount: 463 } };
    }
  });

  const s1 = await s.search('周杰伦', 1, 30, 0);
  check('搜索单曲：归一化 + 带回计数',
    s1.ok && s1.data.songs[0].name === '曲目' && s1.data.counts.songs === 278,
    JSON.stringify(s1.data && s1.data.counts));

  const s10 = await s.search('周杰伦', 10, 30, 0);
  check('搜索专辑：归一化 + 带回计数',
    s10.ok && s10.data.albums[0].name === '专辑' && s10.data.counts.albums === 592);

  const s100 = await s.search('周杰伦', 100, 30, 0);
  check('搜索歌手：归一化 + 带回计数',
    s100.ok && s100.data.artists[0].name === '歌手' && s100.data.counts.artists === 84);

  const s1000 = await s.search('周杰伦', 1000, 30, 0);
  check('搜索歌单：归一化 + 带回计数',
    s1000.ok && s1000.data.playlists[0].name === '歌单' && s1000.data.counts.playlists === 463);
}

/* ---------------------------------------------------- 4. 联想 */

{
  const s = svc({
    searchSuggest: {
      ok: true,
      data: {
        songs: [{ id: 1, name: '联想曲', artists: [{ id: 1, name: '甲' }], album: { id: 2, name: '专' }, duration: 1000 }],
        albums: [{ id: 3, name: '联想专辑', artist: { id: 1, name: '甲' } }],
        artists: [{ id: 4, name: '联想歌手' }],
        playlists: [{ id: 5, name: '联想歌单', coverImgUrl: 'http://p' }]
      }
    }
  });
  const r = await s.searchSuggest('周');
  check('联想：四类都归一化',
    r.ok &&
    r.data.songs[0].name === '联想曲' &&
    r.data.albums[0].name === '联想专辑' &&
    r.data.artists[0].name === '联想歌手' &&
    r.data.playlists[0].name === '联想歌单',
    JSON.stringify(r.data && Object.keys(r.data)));
}

/* ---------------------------------------------------- 5. 默认搜索词 */

{
  const s = svc({ searchDefaultKeyword: { ok: true, data: '🔥自由的你 最近很火哦' } });
  const r = await s.searchDefaultKeyword();
  check('默认搜索词原样带回', r.ok && r.data === '🔥自由的你 最近很火哦', String(r.data));
}

/* ---------------------------------------------------- 6. 失败路径 */

{
  const s = svc({
    personalFM: { ok: false, error: '需要登录', kind: 'needLogin' },
    search: { ok: false, error: '服务异常', kind: 'business', code: 400 }
  });
  const fm = await s.personalFM();
  check('FM 失败：翻成 KUMONE_NEED_LOGIN 且是登录中断',
    fm.ok === false && fm.code === 'KUMONE_NEED_LOGIN' && fm.loginInterrupt === true,
    JSON.stringify(fm && fm.code));

  const sr = await s.search('x', 1, 30, 0);
  check('搜索失败：翻成稳定码，按码分支',
    sr.ok === false && sr.code === 'KUMONE_BUSINESS_REJECTED' && sr.kind === 'permanent',
    JSON.stringify(sr && sr.code));
}

console.log(failed ? `\nFM-SEARCH: ${failed} 条断言失败` : '\nFM-SEARCH: ALL PASS ✔');
process.exit(failed ? 1 : 0);
