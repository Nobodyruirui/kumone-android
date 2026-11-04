// 取证 8：服务端认不认「请求体里的 MUSIC_U」？
// 如果认 → 不用原生 HTTP 也能带登录态（对浏览器/WebView 都有效）
// 如果不认 → 必须走原生 HTTP（CapacitorHttp）才能带 Cookie 头
const path = require('path');
const root = path.join(__dirname, '..');
const crypto = require(path.join(root, 'www/kumone/lib/crypto.js'));
const client = require(path.join(root, 'www/kumone/lib/client.js')).client;

// 不带 Cookie 头地发请求：直接用 client.perform，但自己控制 headers 做不到，
// 所以这里直接用 fetch 手写请求头。
async function raw(tag, url, form, cookie) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Referer': 'https://music.163.com',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (cookie) headers['Cookie'] = cookie;
  try {
    const res = await fetch(url, { method: 'POST', headers, body: form });
    const text = await res.text();
    console.log('[' + tag + '] HTTP ' + res.status + ' len=' + text.length + ' :: ' + text.slice(0, 220));
  } catch (e) {
    console.log('[' + tag + '] EXC ' + (e && e.message));
  }
}

const ACC = '/v1/play/record';

(async () => {
  const base = { csrf_token: '' };

  const formOf = (obj) => {
    const w = crypto.weapi(JSON.stringify(obj));
    return 'params=' + w.params + '&encSecKey=' + crypto.WEAPI_ENC_SEC_KEY;
  };

  // A. 完全匿名
  await raw('A 无cookie 无payload token', 'https://music.163.com/weapi' + ACC,
    formOf(base), null);

  // B. payload 里塞一个假的 MUSIC_U
  await raw('B 无cookie payload带MUSIC_U', 'https://music.163.com/weapi' + ACC,
    formOf(Object.assign({}, base, { MUSIC_U: 'garbage-token' })), null);

  // C. Cookie 头里塞一个假的 MUSIC_U（对照组：服务端确实读 Cookie 头）
  await raw('C cookie头带MUSIC_U', 'https://music.163.com/weapi' + ACC,
    formOf(base), 'MUSIC_U=garbage-token');
})();
