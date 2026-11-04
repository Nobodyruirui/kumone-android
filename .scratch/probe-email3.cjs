// 取证 7：/weapi/login（邮箱登录）参数矩阵，找出服务端要的字段组合
const path = require('path');
const root = path.join(__dirname, '..');
const crypto = require(path.join(root, 'www/kumone/lib/crypto.js'));
const client = require(path.join(root, 'www/kumone/lib/client.js')).client;

const MAIL = 'nobody@163.com';
const MD5 = crypto.md5hex('wrongpass');

async function probe(tag, url, payload) {
  try {
    const text = await client.perform(url, crypto.weapi(JSON.stringify(payload)));
    console.log('[' + tag + '] ' + String(text).slice(0, 200));
  } catch (e) {
    console.log('[' + tag + '] EXC ' + (e && e.message));
  }
}

(async () => {
  const U = 'https://music.163.com/weapi/login';
  await probe('email+password(md5)', U, { email: MAIL, password: MD5 });
  await probe('email+password(md5)+rememberMe', U, { email: MAIL, password: MD5, rememberMe: true });
  await probe('email+md5_password', U, { email: MAIL, md5_password: MD5 });
  await probe('email+md5_password+rememberMe+type', U, { email: MAIL, md5_password: MD5, rememberMe: true, type: 1 });
  await probe('username+password', U, { username: MAIL, password: MD5 });
  await probe('email+plain', U, { email: MAIL, password: 'wrongpass' });
  await probe('email+password+type2', U, { email: MAIL, password: MD5, type: 2 });

  // 手机号端点再确认一次现在的返回（看是否已被限流）
  await probe('cellphone md5 again', 'https://music.163.com/weapi/login/cellphone', { phone: '13000000000', countrycode: '86', password: MD5 });
})();
