// 取证 2：网易云几个登录端点现在还活着吗？
const path = require('path');
const root = path.join(__dirname, '..');
const crypto = require(path.join(root, 'www/kumone/lib/crypto.js'));
const client = require(path.join(root, 'www/kumone/lib/client.js')).client;

async function probe(tag, ep, payload) {
  try {
    const text = await client.perform(
      'https://music.163.com/weapi' + ep,
      crypto.weapi(JSON.stringify(payload))
    );
    console.log('[' + tag + '] ' + String(text).slice(0, 300));
  } catch (e) {
    console.log('[' + tag + '] EXC ' + (e && e.message));
  }
}

(async () => {
  await probe('login/email', '/login/email', {
    email: 'nobody@example.com', password: 'x', captcha: '', verifyCode: ''
  });
  await probe('login/password', '/login/password', {
    email: 'nobody@example.com', password: 'x', captcha: '', verifyCode: ''
  });
  await probe('login/cellphone-plain', '/login/cellphone', {
    phone: '13000000000', password: 'wrongpass', captcha: '', verifyCode: '', countrycode: '86'
  });
  await probe('login/cellphone-md5', '/login/cellphone', {
    phone: '13000000000', password: crypto.md5hex('wrongpass'), captcha: '', verifyCode: '', countrycode: '86'
  });
  await probe('login/status', '/login/status', { csrf_token: '' });
  await probe('user/account', '/w/nuser/account/get', {});
})();
