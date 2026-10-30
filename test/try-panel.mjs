// 回归测试：试用台的按钮全部点得通。
//
//   node test/try-panel.mjs
//
// 探针在 test/fixtures/probe-try.html：把试用台的三组按钮各点一遍，
// 看「模型可读界面 / 知识包工具 / 真实网易云数据」三块输出是否都有内容。
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-try.html', {
  label: '试用台自检',
  budget: 25000,
  timeout: 120000
});
