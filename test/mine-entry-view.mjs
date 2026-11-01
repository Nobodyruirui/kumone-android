// 回归测试：导航改造后的信息架构（phone-fixes-4 / issues 02）。
//
//   node test/mine-entry-view.mjs
//
// 探针在 test/fixtures/probe-mine-entry.html。
// 断言：底部三键没有「资料库」；左上角一次性「我的」入口；抽屉里有歌单与收藏；
//       用过一次入口消失；账号胶囊开同一个抽屉。
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-mine-entry.html', {
  label: '「我的」入口自检',
  budget: 20000
});
