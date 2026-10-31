'use strict';
// 取证：网易云的「账号密码登录」接口现在还接不接得住？用假账号看返回结构。
const api = require('../www/kumone/lib/api.js');

(async () => {
  const probes = [
    ['/login/cellphone (手机号+密码)', () => api.client.weapi('/login/cellphone', {
      phone: '13800000000', password: 'Aa123456', captcha: '', verifyCode: ''
    })],
    ['/login/cellphone (邮箱+密码)', () => api.client.weapi('/login/cellphone', {
      phone: 'nobody@example.com', password: 'Aa123456', captcha: '', verifyCode: ''
    })],
    ['/login/password', () => api.client.weapi('/login/password', {
      user: 'nobody@example.com', password: 'Aa123456', type: 1
    })],
    ['/login/email', () => api.client.weapi('/login/email', {
      email: 'nobody@example.com', password: 'Aa123456'
    })],
    ['/login/status (当前登录态)', () => api.client.weapi('/login/status', {})]
  ];
  for (const [name, fn] of probes) {
    try {
      const text = await fn();
      let out = text;
      try { out = JSON.stringify(JSON.parse(text)).slice(0, 300); } catch (_) { out = String(text).slice(0, 300); }
      console.log(`${name}\n  -> ${out}\n`);
    } catch (e) {
      console.log(`${name}\n  -> ERROR ${e.kind || ''} ${e.message}\n`);
    }
  }
})();
