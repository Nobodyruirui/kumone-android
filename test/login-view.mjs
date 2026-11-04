// 回归测试：登录页 —— **只有扫码**这一条路
//   （.scratch/phone-fixes/issues/03-password-login 的密码那条已按 ADR-0005 移除）
//
//   node test/login-view.mjs
//
// 探针在 test/fixtures/probe-login.html：把扫码的三个通道换成**假服务**
// （不打真网络），但行为跟真的一致（等待扫码 / 过期 / 成功）。
// 断言：
//   1. 登录页**没有**账号/密码输入框，也没有「账号登录 / 扫码登录」双 Tab
//   2. 显示二维码 + 扫码状态文案
//   3. 状态轮询在跑
//   4. 二维码过期 → 有「刷新二维码」按钮
//   5. 扫码成功 → 登录成功 → 离开登录页
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-login.html', {
  label: '登录页（只扫码）自检',
  budget: 16000
});
