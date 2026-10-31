// 回归测试：登录页（.scratch/phone-fixes/issues/03-password-login）。
//
//   node test/login-view.mjs
//
// 探针在 test/fixtures/probe-login.html：把登录的两个通道都换成**假服务**
// （不打真网络），但假服务的行为跟真的一致（成功 / 凭据不对 / 等待扫码）。
// 断言：
//   1. 登录页有「账号登录 / 扫码登录」两个 Tab，默认落在账号登录
//   2. 账号登录有手机号与密码两个输入框
//   3. 密码错 → 错误卡按错误码分支
//   4. 密码不落盘（localStorage 里没有密码）
//   5. 登录成功 → 回到原页面
//   6. 扫码那条路仍然可用
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-login.html', {
  label: '登录页自检',
  budget: 14000
});
