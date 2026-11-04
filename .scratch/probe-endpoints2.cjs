// 取证 3：把还可能活着的登录端点全探一遍（用假凭据，只看端点是否存在 + 返回码语义）。
const path = require('path');
const root = path.join(__dirname, '..');
const crypto = require(path.join(root, 'www/kumone/lib/crypto.js'));
const client = require(path.join(root, 'www/kumone/lib/client.js')).client;

const FAKE_PHONE = '13000000000';
const FAKE_MAIL = 'nobody@example.com';

async function probe(tag, host, ep, payload, enc) {
  const form = enc === 'eapi'
    ? crypto.eapi(ep, JSON.stringify(payload))
    : crypto.weapi(JSON.stringify(payload));
  try {
    const text = await client.perform(host + enc + ep, form);
    console.log('[' + tag + '] ' + String(text).slice(0, 220));
  } catch (e) {
    console.log('[' + tag + '] EXC ' + (e && e.message));
  }
}

(async () => {
  const W = 'https://music.163.com/weapi';
  const E = 'https://interface.music.163.com/eapi';
  const E3 = 'https://interface3.music.163.com/eapi';

  await probe('weapi /login/phone', W, '/login/phone', { phone: FAKE_PHONE, password: 'x' });
  await probe('weapi /login', W, '/login', { email: FAKE_MAIL, password: 'x', type: 1 });
  await probe('weapi /login/email?type', W, '/login/email', { email: FAKE_MAIL, password: 'x', type: 1 });
  await probe('eapi /login/phone', E, '/login/phone', { phone: FAKE_PHONE, password: crypto.md5hex('x') });
  await probe('eapi /login/email', E, '/login/email', { email: FAKE_MAIL, password: crypto.md5hex('x') });
  await probe('eapi /login/cellphone', E, '/login/cellphone', { phone: FAKE_PHONE, password: crypto.md5hex('x'), countrycode: '86' });
  await probe('eapi3 /login/phone', E3, '/login/phone', { phone: FAKE_PHONE, password: crypto.md5hex('x') });
  await probe('eapi3 /login/cellphone', E3, '/login/cellphone', { phone: FAKE_PHONE, password: crypto.md5hex('x'), countrycode: '86' });
  await probe('eapi3 /login/email', E3, '/login/email', { email: FAKE_MAIL, password: crypto.md5hex('x') });
  await probe('weapi /login/qrcode/unikey', W, '/login/qrcode/unikey', { type: 1 });
})();
