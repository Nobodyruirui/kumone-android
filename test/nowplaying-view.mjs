// 回归测试：全屏播放页（ticket 09）。
//
//   node test/nowplaying-view.mjs
//
// 探针在 test/fixtures/probe-nowplaying.html：把播放引擎换成**假播放器**
// （真引擎要真音频与真地址），但假播放器的接口与状态字段跟真的一致。
// 断言：
//   1. 点迷你条进全屏，底部导航与迷你条同时消失
//   2. 大封面 / 歌名 / 艺人 / 专辑 四项都在
//   3. 拖进度条 → seek 生效，时间显示跟着更新
//   4. 播放 / 暂停 / 上一首 / 下一首 → 状态变化且界面自动刷新
//   5. 音量可调、音质可切，且**降级看得见**
//   6. 队列能打开能看到内容，收起能回到来源页
//   7. 没有曲目时是空状态
//   8. 快照里能读到各控件的语义名与 ref
//
// 退出码：0 通过；1 不通过。

import { probe } from './browser.mjs';

await probe('test/fixtures/probe-nowplaying.html', {
  label: '全屏播放页自检',
  budget: 14000
});
