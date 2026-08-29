'use strict';
// Smoke test: verify the browser kernel loads, cookie jar works, decode handles errors.
const clientMod = require('F:/test/kumone-android/www/kumone/lib/client.js');
const api = require('F:/test/kumone-android/www/kumone/lib/api.js');

let ok = true;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  if (!cond) ok = false;
}

// 1. require chain intact
check('api exposes NeteaseAPI methods', typeof api.qrKey === 'function' && typeof api.songURL === 'function');

// 2. cookie jar
const client = clientMod.client;
check('default not logged in', client.isLoggedIn() === false);
client.ingestCookieString('MUSIC_U=abc123;;__csrf=xyz;;os=pc; path=/');
check('cookie ingested', client.cookies.MUSIC_U === 'abc123' && client.cookies.__csrf === 'xyz');
check('now logged in', client.isLoggedIn() === true);
check('cookie header built', client.cookieHeader().includes('MUSIC_U=abc123'));
client.clearAuthCookies();
check('logout clears auth cookies', client.isLoggedIn() === false && client.cookies.__csrf === undefined);

// 3. decode
const good = clientMod.decode('{"code":200,"data":{"a":1}}');
check('decode success', good.code === 200 && good.data.a === 1);
try { clientMod.decode('{"code":301}'); check('decode 301 throws needLogin', false); }
catch (e) { check('decode 301 throws needLogin', e.kind === 'needLogin'); }

console.log(ok ? '\nSMOKE: ALL PASS ✔' : '\nSMOKE: FAILURES ✘');
process.exit(ok ? 0 : 1);