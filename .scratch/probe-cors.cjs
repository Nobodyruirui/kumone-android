// 取证 10：网易云 weapi 端点到底返不返 CORS 头？
const path = require('path');
const root = path.join(__dirname, '..');
const crypto = require(path.join(root, 'www/kumone/lib/crypto.js'));

(async () => {
  const w = crypto.weapi(JSON.stringify({ csrf_token: '' }));
  const body = 'params=' + w.params + '&encSecKey=' + crypto.WEAPI_ENC_SEC_KEY;

  for (const origin of ['http://127.0.0.1:8100', 'https://localhost']) {
    const res = await fetch('https://music.163.com/weapi/login/cellphone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': origin,
        'Referer': 'https://music.163.com'
      },
      body: body
    });
    const h = {};
    for (const [k, v] of res.headers) {
      if (/access-control|set-cookie|vary|server/i.test(k)) h[k] = v;
    }
    console.log('origin=' + origin + ' status=' + res.status + ' :: ' + JSON.stringify(h));
    const text = await res.text();
    console.log('  body: ' + text.slice(0, 160));
  }
})();
