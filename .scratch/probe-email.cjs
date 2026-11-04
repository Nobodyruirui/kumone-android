// 取证 5：按上游 DeepWiki 给的真实 URL / 字段名探测邮箱登录
//   邮箱：POST https://music.163.com/api/login   crypto: weapi
//   手机：POST https://music.163.com/weapi/login/cellphone  crypto: weapi
//   字段：password(明文) / md5_password(预哈希) / captcha
const path = require('path');
const root = path.join(__dirname, '..');
const crypto = require(path.join(root, 'www/kumone/lib/crypto.js'));
const client = require(path.join(root, 'www/kumone/lib/client.js')).client;

const MAIL = 'nobody@example.com';
const PW = 'wrongpass';
const MD5 = crypto.md5hex(PW);

async function probe(tag, url, payload) {
  try {
    const text = await client.perform(url, crypto.weapi(JSON.stringify(payload)));
    console.log('[' + tag + '] ' + String(text).slice(0, 240));
  } catch (e) {
    console.log('[' + tag + '] EXC ' + (e && e.message));
  }
}

(async () => {
  const A = 'https://music.163.com/api/login';
  await probe('api/login pw=md5', A, { email: MAIL, password: MD5 });
  await probe('api/login md5_password', A, { email: MAIL, md5_password: MD5 });
  await probe('api/login pw=plain', A, { email: MAIL, password: PW });

  const C = 'https://music.163.com/weapi/login/cellphone';
  const PH = '13000000000';
  await probe('weapi/login/cellphone pw=md5', C, { phone: PH, countrycode: '86', password: MD5 });
  await probe('weapi/login/cellphone md5_password', C, { phone: PH, countrycode: '86', md5_password: MD5 });
  await probe('weapi/login/cellphone pw=plain', C, { phone: PH, countrycode: '86', password: PW });
})();
