'use strict';
// 取证脚本：看看真实接口返回的封面 URL 长什么样、能不能取到。
// 用法：node .scratch/probe-covers.js
const api = require('../www/kumone/lib/api.js');
const https = require('https');
const http = require('http');

function head(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.request(url, { method: 'GET', timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      res.resume();
      resolve({ status: res.statusCode, len: res.headers['content-length'] || 0 });
    });
    req.on('error', (e) => resolve({ status: 'ERR:' + e.code || e.message, len: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'TIMEOUT', len: 0 }); });
  });
}

function pics(list, pick) {
  return (list || []).map(pick).filter(Boolean);
}

(async () => {
  const samples = [];

  const daily = await api.dailyRecommendSongs();
  samples.push(['dailyRecommendSongs', pics(daily, (t) => t.al && t.al.picUrl)]);
  samples.push(['dailyRecommendSongs(album)', pics(daily, (t) => t.album && t.album.picUrl)]);

  const sr = await api.search('周杰伦', 1, 30, 0);
  samples.push(['cloudsearch songs.al.picUrl', pics(sr.songs, (t) => t.al && t.al.picUrl)]);
  samples.push(['cloudsearch songs.album.picUrl', pics(sr.songs, (t) => t.album && t.album.picUrl)]);

  const pl = await api.personalizedPlaylists(30);
  samples.push(['personalized picUrl', pics(pl, (p) => p.picUrl)]);
  samples.push(['personalized coverImgUrl', pics(pl, (p) => p.coverImgUrl)]);

  const tops = await api.toplists();
  samples.push(['toplist picUrl', pics(tops, (p) => p.picUrl)]);

  const albums = await api.newAlbums('ALL', 12);
  samples.push(['newAlbums picUrl', pics(albums, (a) => a.picUrl)]);

  const arts = await api.topArtists(20);
  samples.push(['topArtists picUrl', pics(arts, (a) => a.picUrl)]);
  samples.push(['topArtists img1v1Url', pics(arts, (a) => a.img1v1Url)]);

  const all = [];
  for (const [name, list] of samples) {
    const httpN = list.filter((u) => String(u).startsWith('http:')).length;
    const httpsN = list.filter((u) => String(u).startsWith('https:')).length;
    console.log(`${name}: n=${list.length} http=${httpN} https=${httpsN} sample=${list[0] || '(none)'}`);
    list.forEach((u) => all.push(u));
  }

  const uniq = Array.from(new Set(all));
  console.log(`\n唯一封面 URL ${uniq.length} 个，逐个探测：`);
  let bad = 0;
  for (const u of uniq) {
    const r = await head(u);
    const ok = r.status === 200;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'BAD '} ${r.status} ${u}`);
  }
  console.log(`\n不可达 ${bad}/${uniq.length}`);
})();
