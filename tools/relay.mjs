// =============================================================
// 本地直连代理（开发 / 验收用，不进 APK）
// -------------------------------------------------------------
// 为什么需要它：
//   网易云的 weapi 端点**不返回 Access-Control-Allow-Origin**
//   （实测：带 Origin 头打 /weapi/login/cellphone，响应里没有 ACAO）。
//   于是浏览器里的 fetch 一律被 CORS 拦掉 → 「Failed to fetch」。
//
//   安卓上这件事是靠自研的原生 HTTP 桥绕开的
//   （android/.../HTTPClientPlugin.java：原生 HttpURLConnection，不受 CORS 管，
//     而且 Cookie 请求头能原样发出去）。
//
//   桌面浏览器里没有那座桥，于是用这个本地代理顶替它：
//     · 转发到真实上游（默认 music.163.com，接口域名放在 X-Kumone-Upstream 头里）
//     · 代理自己维护 cookie 罐 —— 浏览器会把 `Cookie` 请求头丢掉，这里补上
//     · 响应补上 CORS 头
//
// 用法：
//   node tools/relay.mjs            # 默认 8123
//   node tools/relay.mjs 8199
//
// 页面侧开关：给 index.html 加 ?relay=1（见 www/kumone/lib/client.js）
// 只绑 127.0.0.1：这是一个本地开发工具，不对外暴露。
// =============================================================
import http from 'node:http';
import https from 'node:https';

const PORT = Number(process.argv[2] || 8123);
const DEFAULT_HOST = 'music.163.com';

/** cookie 罐：一个代理进程一个会话（本地单人调试足够）。 */
const jar = new Map();

function cookieHeader() {
  if (!jar.size) return '';
  return Array.from(jar.entries()).map(([k, v]) => k + '=' + v).join('; ');
}

function storeCookies(list) {
  (list || []).forEach((raw) => {
    const pair = String(raw).split(';')[0];
    const i = pair.indexOf('=');
    if (i <= 0) return;
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (!name || value === '""') return;
    jar.set(name, value);
  });
}

const server = http.createServer((req, res) => {
  const origin = String(req.headers['origin'] || '*');

  // 预检：代理要能带自定义头（X-Kumone-Upstream）
  // 注意：请求带凭据（credentials: 'include'）时，通配符
  // `Access-Control-Allow-Origin: *` 与 `Allow-Headers: *` 都不合法 ——
  // 必须回显具体的 Origin 与请求头，否则预检失败（表现就是 Failed to fetch）。
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': String(req.headers['access-control-request-headers'] || '*'),
      'Access-Control-Max-Age': '600',
      'Vary': 'Origin'
    });
    res.end();
    return;
  }

  const upstream = String(req.headers['x-kumone-upstream'] || DEFAULT_HOST);
  const target = 'https://' + upstream + req.url;

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const key = k.toLowerCase();
      if (key === 'host' || key === 'origin' || key === 'connection' ||
          key === 'content-length' || key === 'x-kumone-upstream') continue;
      headers[k] = v;
    }
    // 浏览器把 Cookie 头丢了，这里用代理自己的罐补上
    const ck = cookieHeader();
    if (ck) headers['cookie'] = ck;
    if (!headers['referer']) headers['referer'] = 'https://music.163.com';
    if (!headers['user-agent']) {
      headers['user-agent'] = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
    }

    const up = https.request(target, { method: req.method, headers }, (ures) => {
      const setCookie = ures.headers['set-cookie'];
      if (setCookie) storeCookies(setCookie);
      const out = {};
      for (const [k, v] of Object.entries(ures.headers)) {
        if (k === 'set-cookie') continue;
        out[k] = v;
      }
      out['access-control-allow-origin'] = origin;
      out['access-control-allow-credentials'] = 'true';
      out['access-control-expose-headers'] = '*';
      out['vary'] = 'Origin';
      res.writeHead(ures.statusCode || 502, out);
      ures.pipe(res);
    });

    up.on('error', (e) => {
      res.writeHead(502, {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'content-type': 'application/json; charset=utf-8'
      });
      res.end(JSON.stringify({ code: -1, message: 'relay error: ' + e.message }));
    });

    if (chunks.length) up.write(Buffer.concat(chunks));
    up.end();
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[relay] http://127.0.0.1:' + PORT + ' → https://' + DEFAULT_HOST + ' (cookie 罐由本进程持有)');
});
