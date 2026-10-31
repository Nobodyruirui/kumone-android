'use strict';
// 定点验证：同一张封面，http 与 https 分别能不能取到。
// 用法：node .scratch/probe-cover-scheme.js
const https = require('https');
const http = require('http');

const urls = [
  'http://p3.music.126.net/9Wn6lXmRkuvM3-6sFWxMlQ==/109951163078575129.jpg',
  'http://p1.music.126.net/78q0jUUJ0h08GxAs2G-tCA==/109951168529051968.jpg',
  'http://p4.music.126.net/rxRBgvgWFRm-2QrrdMICZA==/109951174060325680.jpg'
];

function get(url, extraHeaders) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.request(url, {
      method: 'GET',
      timeout: 10000,
      headers: Object.assign({ 'User-Agent': 'Mozilla/5.0' }, extraHeaders || {})
    }, (res) => {
      let n = 0;
      res.on('data', (c) => { n += c.length; });
      res.on('end', () => resolve({ status: res.statusCode, bytes: n, type: res.headers['content-type'] }));
    });
    req.on('error', (e) => resolve({ status: 'ERR:' + (e.code || e.message), bytes: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'TIMEOUT', bytes: 0 }); });
  });
}

(async () => {
  for (const u of urls) {
    const httpsUrl = u.replace(/^http:/, 'https:');
    const a = await get(u);
    const b = await get(httpsUrl);
    const c = await get(httpsUrl, { Referer: 'https://music.163.com/' });
    console.log('原 URL  http :', u);
    console.log('  http  ->', a.status, a.bytes + 'B', a.type || '');
    console.log('  https ->', b.status, b.bytes + 'B', b.type || '');
    console.log('  https+Referer ->', c.status, c.bytes + 'B', c.type || '');
    console.log('');
  }
})();
