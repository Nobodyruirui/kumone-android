'use strict';
// 取证：为什么大部分歌没歌词？
const api = require('../www/kumone/lib/api.js');

(async () => {
  const daily = await api.dailyRecommendSongs();
  let onlyLrc = 0, withYrc = 0;
  for (const t of daily.slice(0, 6)) {
    const l = await api.lyric(t.id);
    console.log('--- ' + t.name + ' ---');
    console.log('  顶层键        :', Object.keys(l).join(', '));
    console.log('  typeof lrc    :', typeof l.lrc, l.lrc && typeof l.lrc === 'object' ? '(对象!) 键=' + Object.keys(l.lrc).join(',') : '');
    console.log('  lrc.lyric 头  :', String((l.lrc && l.lrc.lyric) || l.lrc || '').slice(0, 60));
    console.log('  typeof tlyric :', typeof l.tlyric, l.tlyric && typeof l.tlyric === 'object' ? '(对象!)' : '');
    console.log('  typeof yrc    :', typeof l.yrc, l.yrc && typeof l.yrc === 'object' ? '(对象!)' : '');
    if (l.yrc && l.yrc.lyric) withYrc++; else onlyLrc++;
  }

  console.log('\n=== 移动端现在的取法（service.lyric 的写法） ===');
  const l = await api.lyric(daily[0].id);
  const serviceShape = { lrc: l.lrc || null, tlyric: l.tlyric || null, yrc: (l.yrc && l.yrc.lyric) || null };
  console.log('  service 拿到的 lrc 类型:', typeof serviceShape.lrc, '→', String(serviceShape.lrc).slice(0, 60));
  const nz = require('../www/shared/normalize.js');
  const L = require('../www/mobile/core/lyrics.js');
  console.log('  解析整行歌词得到行数:', L.parseLrc(serviceShape.lrc).length, '  ← 0 就是「没歌词」的真相');
  console.log('  解析逐字歌词得到行数:', L.parseYrc(serviceShape.yrc).length);
})();
