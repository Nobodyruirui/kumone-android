'use strict';
// 取证：排行榜点进去为什么是空的？
const api = require('../www/kumone/lib/api.js');

(async () => {
  const tops = await api.toplists();
  const first = tops[0];
  console.log('榜单:', first.id, first.name, '| 封面:', String(first.picUrl).slice(0, 60));

  const detail = await api.playlistDetail(first.id);
  console.log('\n--- playlistDetail 顶层键 ---');
  console.log(Object.keys(detail).join(', '));
  console.log('顶层 tracks 长度:', (detail.tracks || []).length);
  console.log('顶层 songs 长度:', (detail.songs || []).length);

  const pl = detail.playlist || {};
  console.log('\n--- detail.playlist 里的东西 ---');
  console.log('playlist.tracks 长度:', (pl.tracks || []).length);
  console.log('playlist.trackIds 长度:', (pl.trackIds || []).length);
  console.log('playlist.trackCount:', pl.trackCount);
  console.log('前 3 首 trackIds:', JSON.stringify((pl.trackIds || []).slice(0, 3)));
  const t0 = (pl.tracks || [])[0];
  console.log('tracks[0]:', t0 ? `${t0.id} ${t0.name} | pic=${String((t0.al || {}).picUrl).slice(0, 50)}` : '(无)');

  // 移动端服务层现在怎么取的
  const nz = require('../www/shared/normalize.js');
  const body = detail;
  const tracks = nz.normalizeTracks(body.songs || body.tracks || []);
  console.log('\n移动端当前取法拿到:', tracks.length, '首  →  详情页当然是空的');
  const tracks2 = nz.normalizeTracks((body.playlist || {}).tracks || []);
  console.log('改成从 playlist.tracks 取:', tracks2.length, '首');
  const ids = ((body.playlist || {}).trackIds || []).map((x) => x.id);
  console.log('trackIds 可用 id 数:', ids.length, '前 3:', ids.slice(0, 3).join(','));

  // 榜单专用接口对比
  try {
    const td = await api.client.weapi('/toplist/detail', { id: first.id });
    const o = JSON.parse(td);
    console.log('\n--- /toplist/detail ---');
    console.log('code:', o.code, '| song 字段:', Array.isArray(o.song) ? o.song.length : typeof o.song);
    if (Array.isArray(o.song) && o.song[0]) {
      console.log('song[0]:', o.song[0].id, o.song[0].name);
    }
  } catch (e) {
    console.log('/toplist/detail 出错:', e.message);
  }
})();
