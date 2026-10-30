// 回归测试：共享归一化纯函数（ticket 03）。
//
//   node test/normalize.test.mjs
//
// 断言要点：
//   1. v3 字段（ar/al/dt）与旧版字段（artists/album/duration）都能归一化
//   2. 归一化是纯函数：同一输入两次调用结果相同，且不改动入参
//   3. 批量归一化过滤掉空项
//   4. 可播性判定链与上游一致（VIP / 付费专辑 / 无版权 / 已下架）
//
// 退出码：0 通过；1 不通过。

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const nz = require('../www/shared/normalize.js');

let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    console.log(`PASS - ${name}`);
  } else {
    failed++;
    console.log(`FAIL - ${name}${extra ? ' :: ' + extra : ''}`);
  }
}

/* 1. v3 字段 */
const v3 = nz.normalizeTrack({
  id: 123,
  name: '测试曲目',
  ar: [{ id: 1, name: '甲' }, { id: 2, name: '乙' }],
  al: { id: 9, name: '测试专辑', picUrl: 'http://p/cover.jpg' },
  dt: 210000,
  alia: ['别名一'],
  tns: ['副标一'],
  fee: 1,
  privilege: { pl: 1 }
});
check('v3 字段：id 透传', v3.id === 123);
check('v3 字段：艺人归一化', v3.artists.length === 2 && v3.artists[1].name === '乙');
check('v3 字段：专辑归一化', v3.album.name === '测试专辑' && v3.album.picUrl === 'http://p/cover.jpg');
check('v3 字段：时长归一化', v3.durationMS === 210000);
check('艺人名拼接', nz.artistNames(v3) === '甲 / 乙');
check('副标题优先译名', nz.trackSubtitle(v3) === '副标一');

/* 2. 旧版字段 */
const legacy = nz.normalizeTrack({
  id: 456,
  name: '旧版曲目',
  artists: [{ id: 3, name: '丙' }],
  album: { id: 8, name: '旧专辑', picUrl: 'http://p/old.jpg' },
  duration: 180000
});
check('旧版字段：艺人', legacy.artists[0].name === '丙');
check('旧版字段：专辑', legacy.album.name === '旧专辑');
check('旧版字段：时长', legacy.durationMS === 180000);

/* 3. 纯函数：不改入参，两次结果一致 */
const input = { id: 1, name: 'x', ar: [{ id: 1, name: 'a' }], al: { id: 1, name: 'b' } };
const snapshotOfInput = JSON.stringify(input);
const a = nz.normalizeTrack(input);
const b = nz.normalizeTrack(input);
check('纯函数：不改动入参', JSON.stringify(input) === snapshotOfInput);
check('纯函数：两次结果一致', JSON.stringify(a) === JSON.stringify(b));
check('纯函数：null 输入返回 null', nz.normalizeTrack(null) === null);

/* 4. 批量归一化过滤空项 */
const batch = nz.normalizeTracks([{ id: 1, name: 'a' }, null, { id: 2, name: 'b' }]);
check('批量归一化过滤空项', batch.length === 2 && batch[1].id === 2);
check('批量归一化：非数组返回空数组', nz.normalizeTracks(undefined).length === 0);

/* 5. 可播性判定链 */
const vipTrack = nz.normalizeTrack({ id: 1, name: 'vip', fee: 1 });
check('可播性：未登录 VIP → vipOnly', nz.playability(vipTrack, null, false, 0) === 'vipOnly');
check('可播性：登录但非 VIP 仍是 vipOnly', nz.playability(vipTrack, null, true, 0) === 'vipOnly');
check('可播性：VIP 用户 → playable', nz.playability(vipTrack, null, false, 1) === 'playable');
check('可播性：登录 + privilege.cs → playable',
  nz.playability(vipTrack, { cs: true }, true, 0) === 'playable');
check('可播性：privilege.pl > 0 → playable',
  nz.playability(vipTrack, { pl: 9 }, false, 0) === 'playable');
const paid = nz.normalizeTrack({ id: 2, name: 'paid', fee: 4 });
check('可播性：付费专辑', nz.playability(paid, null, true, 1) === 'paidAlbum');
const noCopy = nz.normalizeTrack({ id: 3, name: 'nc', noCopyrightRcmd: true });
check('可播性：无版权', nz.playability(noCopy, null, true, 1) === 'noCopyright');
const delisted = nz.normalizeTrack({ id: 4, name: 'dl', privilege: { st: -1 } });
check('可播性：已下架', nz.playability(delisted, null, true, 1) === 'delisted');
check('可播性标签可展示', nz.playabilityLabel('vipOnly') === 'VIP 专属');

/* 6. 账号与播放地址 */
const acc = nz.normalizeAccount({ userId: 42, nickname: '某人', avatarUrl: 'http://a', vipType: 1 });
check('账号归一化', acc.userId === 42 && acc.nickname === '某人' && acc.vipType === 1);
check('账号归一化：空输入返回 null', nz.normalizeAccount(null) === null);
const url = nz.normalizeSongUrl({ url: 'http://x/y.mp3', level: 'standard' });
check('播放地址：http 升为 https', url.url === 'https://x/y.mp3');
check('播放地址：无 url 返回 null', nz.normalizeSongUrl({}) === null);

/* 7. 歌单 / 专辑 / 歌手 */
const pl = nz.normalizePlaylist({ id: 1, name: '歌单', picUrl: 'http://c', trackCount: 12, creator: { nickname: 'n' } });
check('歌单归一化', pl.cover === 'http://c' && pl.trackCount === 12 && pl.creator.nickname === 'n');
const al = nz.normalizeAlbum({ id: 2, name: '专辑', artists: [{ name: '甲' }], publishTime: 5 });
check('专辑归一化', al.artistName === '甲' && al.publishTime === 5);
const ar = nz.normalizeArtist({ id: 3, name: '歌手', img1v1Url: 'http://p' });
check('歌手归一化', ar.pic === 'http://p' && ar.name === '歌手');

console.log(failed ? `\nNORMALIZE: ${failed} 项失败` : '\nNORMALIZE: ALL PASS ✔');
process.exit(failed ? 1 : 0);
