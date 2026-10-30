/* =============================================================
 * 本地 CORS 中继（仅用于桌面浏览器试用）
 * -------------------------------------------------------------
 * 为什么需要它：
 *   桌面浏览器里，页面直接向 music.163.com 发请求会被 CORS 拦掉
 *   （安卓 App 走 Capacitor 原生 HTTP 桥，不受影响）。
 *   以前只能在启动浏览器时加 --disable-web-security，
 *   那样就绑死在某一个浏览器上（ego-lite 也用不了）。
 *
 * 做法：
 *   页面把对 music.163.com 的 fetch 改道到本中继，
 *   中继转发请求、补上 Access-Control-Allow-Origin，再把响应原样带回。
 *   顺带把 Referer / User-Agent 设成网易云要的那一套 —— 浏览器的
 *   fetch 不允许脚本设置这两个头，但在服务端转发时可以补上。
 *
 *   内核层零改动：只是页面里换了个 fetch 出口。
 *
 * 用法：node tools/cors-proxy.mjs [--port 8111]
 * ============================================================= */
import http from 'node:http';

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = portArg >= 0 ? Number(args[portArg + 1]) : 8111;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '600'
};

/** 只允许转发到网易云，避免变成一个开放代理。 */
function allowed(target) {
  try {
    const u = new URL(target);
    return u.protocol === 'https:' && /(^|\.)163\.com$/.test(u.hostname);
  } catch (_) {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, 'http://127.0.0.1');
  if (requestUrl.pathname !== '/proxy') {
    res.writeHead(404, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('只提供 /proxy?url=<网易云地址>');
    return;
  }

  const target = requestUrl.searchParams.get('url');
  if (!target || !allowed(target)) {
    res.writeHead(400, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('目标不在允许列表内（只允许 https://*.163.com）');
    return;
  }

  try {
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        'User-Agent': UA,
        'Referer': 'https://music.163.com',
        'Origin': 'https://music.163.com',
        'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
        ...(req.headers['cookie'] ? { Cookie: req.headers['cookie'] } : {})
      },
      body
    });

    const buf = Buffer.from(await upstream.arrayBuffer());
    const setCookie = upstream.headers.getSetCookie ? upstream.headers.getSetCookie() : [];
    const headers = {
      ...CORS,
      'Content-Type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    };
    if (setCookie.length) headers['Set-Cookie'] = setCookie.join('; ');
    res.writeHead(upstream.status, headers);
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('中继转发失败：' + (e && e.message ? e.message : String(e)));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`CORS 中继已启动：http://127.0.0.1:${PORT}/proxy?url=<网易云地址>`);
});
