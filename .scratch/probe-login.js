// 登录接口的复现回路（phone-fixes-4）：
//   node .scratch/probe-login.js <phone> <password>
// 用内核打**真实**接口，把服务端返回的 code / message 打出来（密码不回显）。
//
// 目的：把「没法用密码登入」变成一条可复现、可断言的信号，
// 而不是靠猜（明文 / MD5 / 端点下线 / 风控码）。

const path = require('path');
const repo = path.join(__dirname, '..');
const api = require(path.join(repo, 'www', 'kumone', 'lib', 'api.js'));

const phone = process.argv[2] || '138-0000-0000';
const password = process.argv[3] || 'not-a-real-password';

function show(label, obj) {
  const o = obj || {};
  console.log(label, JSON.stringify({
    code: o.code,
    message: o.message || o.msg || null,
    hasCookie: typeof o.cookie === 'string' && o.cookie.length > 0,
    keys: Object.keys(o).slice(0, 8)
  }));
}

(async () => {
  console.log('端点：weapi /login/cellphone   手机号尾号：' + String(phone).slice(-4));

  // 1) 内核当前的尝试顺序：明文 → 502 再试 MD5
  const r = await api.cellphoneLogin(phone, password);
  show('内核 cellphoneLogin →', r);

  // 2) 直接看明文一次的真实返回（内核会吞掉第一次的结果，这里单独打）
  const raw = await api.client.weapi('/login/cellphone', {
    phone: String(phone),
    password: String(password),
    captcha: '',
    verifyCode: ''
  });
  show('明文直连 →', JSON.parse(raw));

  // 3) MD5 一次
  const cryptoMod = require(path.join(repo, 'www', 'kumone', 'lib', 'crypto.js'));
  const md5 = (cryptoMod.md5hex || cryptoMod.default && cryptoMod.default.md5hex || (s => s))(String(password));
  const raw2 = await api.client.weapi('/login/cellphone', {
    phone: String(phone),
    password: md5,
    captcha: '',
    verifyCode: ''
  });
  show('MD5 直连 →', JSON.parse(raw2));
})().catch((e) => {
  console.log('请求失败：', e && e.message ? e.message : String(e));
  process.exit(1);
});
