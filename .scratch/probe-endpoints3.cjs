// 取证 4：上游「api 加密」= eapi 算法 + 路径前缀 /api + 域名 music.163.com/api。
// 这里显式控制「加密用的路径」与「实际请求 URL」，避免 client.eapi 把 /api 写死在错误的位置。
const path = require('path');
const root = path.join(__dirname, '..');
const crypto = require(path.join(root, 'www/kumone/lib/crypto.js'));
const client = require(path.join(root, 'www/kumone/lib/client.js')).client;

const FAKE_PHONE = '13000000000';

async function probe(tag, url, encPath, payload, enc) {
  const form = enc === 'eapi'
    ? crypto.eapi(encPath, JSON.stringify(payload))
    : crypto.weapi(JSON.stringify(payload));
  try {
    const text = await client.perform(url, form);
    console.log('[' + tag + '] ' + String(text).slice(0, 260));
  } catch (e) {
    console.log('[' + tag + '] EXC ' + (e && e.message));
  }
}

(async () => {
  const M = 'https://music.163.com';
  const I = 'https://interface.music.163.com';

  // eapi 算法 + /api 前缀路径
  await probe('api-crypto /api/login/qrcode/unikey', M + '/api/login/qrcode/unikey', '/api/login/qrcode/unikey', { type: 1 }, 'eapi');
  await probe('api-crypto /api/login/cellphone(md5)', M + '/api/login/cellphone', '/api/login/cellphone', { phone: FAKE_PHONE, password: crypto.md5hex('x'), countrycode: '86' }, 'eapi');
  await probe('api-crypto /api/login/cellphone(plain)', M + '/api/login/cellphone', '/api/login/cellphone', { phone: FAKE_PHONE, password: 'x', countrycode: '86' }, 'eapi');
  await probe('api-crypto /api/login/email', M + '/api/login/email', '/api/login/email', { email: 'nobody@example.com', password: 'x' }, 'eapi');
  await probe('api-crypto /api/login/status', M + '/api/login/status', '/api/login/status', {}, 'eapi');

  // interface 域名 + /api 前缀
  await probe('iface api-crypto /api/login/cellphone', I + '/api/login/cellphone', '/api/login/cellphone', { phone: FAKE_PHONE, password: crypto.md5hex('x'), countrycode: '86' }, 'eapi');
  await probe('iface api-crypto /api/login/qrcode/unikey', I + '/api/login/qrcode/unikey', '/api/login/qrcode/unikey', { type: 1 }, 'eapi');

  // eapi 域名 + 真实 eapi 路径（对照）
  await probe('eapi /login/qrcode/unikey', I + '/eapi/login/qrcode/unikey', '/api/login/qrcode/unikey', { type: 1 }, 'eapi');
  await probe('eapi /login/qrcode/client/login', I + '/eapi/login/qrcode/client/login', '/api/login/qrcode/client/login', { key: 'x', type: 1 }, 'eapi');
})();
