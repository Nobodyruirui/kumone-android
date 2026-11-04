// 取证脚本：直接对网易云发真实请求，看 weapi 通道与密码登录各自的真实返回码。
// 用法：node .scratch/probe-login.cjs [手机号] [密码]
const path = require('path');
const root = path.join(__dirname, '..');
const crypto = require(path.join(root, 'www/kumone/lib/crypto.js'));
const clientMod = require(path.join(root, 'www/kumone/lib/client.js'));
const client = clientMod.client;

function show(tag, text) {
  console.log('--- ' + tag + ' ---');
  console.log(typeof text === 'string' ? text.slice(0, 600) : JSON.stringify(text).slice(0, 600));
}

(async () => {
  // 1) 通道自检：/login/status 不需要登录
  try {
    const text = await client.perform(
      'https://music.163.com/weapi/login/status',
      crypto.weapi(JSON.stringify({ csrf_token: '' }))
    );
    show('login/status', text);
  } catch (e) {
    show('login/status FAILED', (e && e.message) + ' | ' + (e && e.stack || '').split('\n')[1]);
  }

  // 2) 密码登录（不传参数时用假号，只看返回码结构）
  const phone = process.argv[2] || '13000000000';
  const pwd = process.argv[3] || 'wrongpass';
  const api = require(path.join(root, 'www/kumone/lib/api.js'));

  try {
    const md5 = crypto.md5hex(pwd);
    console.log('md5(' + pwd + ') = ' + md5);
    const r = await api.cellphoneLogin(phone, pwd);
    show('cellphoneLogin(md5-first)', r);
  } catch (e) {
    show('cellphoneLogin FAILED', (e && e.message) + ' | ' + (e && e.stack || '').split('\n')[1]);
  }
})();
