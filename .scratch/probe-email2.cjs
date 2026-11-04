// 取证 6：邮箱登录还有没有活路？以及「手机号是否已注册」这个诊断接口。
const path = require('path');
const root = path.join(__dirname, '..');
const crypto = require(path.join(root, 'www/kumone/lib/crypto.js'));
const client = require(path.join(root, 'www/kumone/lib/client.js')).client;

const MAIL = 'nobody@163.com';

async function probe(tag, url, payload, enc, raw) {
  try {
    const form = raw ? raw : (enc === 'eapi' ? crypto.eapi(url.replace(/^https?:\/\/[^/]+/, ''), JSON.stringify(payload)) : crypto.weapi(JSON.stringify(payload)));
    const text = await client.perform(url, form);
    console.log('[' + tag + '] ' + String(text).slice(0, 240));
  } catch (e) {
    console.log('[' + tag + '] EXC ' + (e && e.message));
  }
}

function formEncode(obj) {
  return Object.keys(obj).map(k => k + '=' + encodeURIComponent(obj[k])).join('&');
}

(async () => {
  // 邮箱：weapi /api/login（上游 DeepWiki 给的 URL）
  await probe('api/login email+md5', 'https://music.163.com/api/login', { email: MAIL, password: crypto.md5hex('x'), rememberMe: true, type: 1 });
  await probe('api/login email+plainform', 'https://music.163.com/api/login', null, 'raw', formEncode({ email: MAIL, password: 'x', type: 1 }));
  await probe('weapi/login email+md5', 'https://music.163.com/weapi/login', { email: MAIL, password: crypto.md5hex('x'), rememberMe: true, type: 1 });

  // 诊断：手机号是否已注册（eapi）
  await probe('eapi cellphone/existence/check', 'https://music.163.com/eapi/cellphone/existence/check', { phone: '13000000000', countrycode: '86' }, 'eapi');

  // 诊断：短信验证码通道是否活着（能发短信 → 说明走验证码登录可行）
  await probe('weapi captcha/sent', 'https://music.163.com/weapi/captcha/sent', { phone: '13000000000', ctcode: '86' });
})();
