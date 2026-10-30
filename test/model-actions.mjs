// 回归测试：模型可读界面的动作层与错误契约。
//
//   node test/model-actions.mjs
//
// 以「模型」的视角驱动这个 App：
//   1. Mobile.snapshot() 能拿到带稳定 ref 的语义树
//   2. Mobile.act(ref, 'click') 能真的驱动界面
//   3. 过期 ref → 稳定错误码 KUMONE_STALE_REF + 五要素消息（含下一步动作）
//   4. 白名单外的动作 → KUMONE_UNSUPPORTED，不静默忽略
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-actions.html', {
  label: '动作层与错误契约自检',
  budget: 12000
});
