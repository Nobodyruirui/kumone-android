// 取证 9：找一个「匿名会 301、带上 token 就有反应」的 weapi 接口，
// 然后对比 token 放在 Cookie 头 vs 放在 payload 里。
const path = require('path');
const root = path.join(__dirname, '..');
const crypto = require(path.join(root, 'www/kumone/lib/crypto.js'));

async function raw(tag, url, obj, cookie) {
  const w = crypto.weapi(JSON.stringify(obj));
  const body = 'params=' + w.params + '&encSecKey=' + crypto.WEAPI_ENC_SEC_KEY;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Referer': 'https://music.163.com',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (cookie) headers['Cookie'] = cookie;
  try {
    const res = await fetch(url, { method: 'POST', headers, body });
    const text = await res.text();
    console.log('[' + tag + '] HTTP ' + res.status + ' len=' + text.length + ' :: ' + text.slice(0, 200));
  } catch (e) {
    console.log('[' + tag + '] EXC ' + (e && e.message));
  }
}

const EPS = [
  '/user/subcount',
  '/user/level',
  '/api/v1/play/record',
  '/user/record',
  '/user/cloud?limit=1',
  '/user/binding',
];

(async () => {
  for (const ep of EPS) {
    await raw('anon ' + ep, 'https://music.163.com/weapi' + ep, { csrf_token: '' }, null);
    await raw('cookie ' + ep, 'https://music.163.com/weapi' + ep, { csrf_token: '' }, 'MUSIC_U=garbage-token');
    await raw('payload ' + ep, 'https://music.163.com/weapi' + ep, { csrf_token: '', MUSIC_U: 'garbage-token' }, null);
  }
})();
