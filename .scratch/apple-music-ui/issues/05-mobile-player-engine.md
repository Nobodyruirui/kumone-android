# 05: 移动端播放引擎

**Blocked by:** 04: 移动端服务层

**Status:** done

## 现状与缺口

- 移动端渲染层目前**没有任何播放引擎**：`www/mobile/core/` 下只有 `errors.js`、`shell.js`、`router.js`、`snapshot.js` 四个文件；`www/mobile/core/shell.js:107-123` 的 `setMini(track)` 与 `:126-131` 的 `setMiniProgress(ratio)` 是**等着被喂数据的空壳**，仓库里没有任何调用它们的地方。
- 上游原版渲染层有一套跑通的播放能力（队列、下一首播放、三种播放模式、音质降级、进度持久化），但它与上游的 `state` / `player` / `audio` 绑死，且这些是上游的 `const`，**不挂 `window`**（`AGENTS.md` 的分层约定），移动端无法直接引用。
- 内核层已经提供音质与音源解锁的能力：`www/kumone/lib/api.js:143` 的 `songURL(ids, level)` 与 `www/kumone/lib/unblock.js` 的音源解锁。
- **具体缺口**：没有 `player.state()` 这类状态查询接口 —— ADR-0003 明确要求「状态可查询，转移可命名」，而目前连状态容器本身都不存在。
- **具体缺口**：没有 `play` / `pause` / `seek` / `next` / `prev` / `queue` / `setQuality` 这组命名动词；ADR-0003 禁止「通过直接改 DOM 来模拟状态变化」，而当前没有可用的替代手段。
- **具体缺口**：没有播放进度持久化的实现；上游的持久化方式与上游状态绑死，不能直接搬。
- **具体缺口**：没有 Node 自测脚本覆盖这六类行为。

## 要求

- 新增移动端播放引擎，独立于上游原版渲染层，自持一份播放上下文。
- 让播放引擎维护播放队列、当前索引、下一首播放插入列表与三种播放模式（顺序 / 单曲 / 随机），并在状态变化时以**事件 / 订阅**方式对外输出，不直接写 DOM。
- 提供 `player.state()` 状态查询接口，返回当前曲目、队列、索引、播放位置、音质与播放状态。
- 用 `play` / `pause` / `seek` / `next` / `prev` / `queue` / `setQuality` 这组**命名动词**表达状态转移；不提供任何「直接改 DOM 模拟播放」的口子。
- 让所选音质不可用时自动降级到可播放音质，并对外报告**实际生效的音质**，而不是只报告用户选的音质。
- 让无版权或会员专属曲目在音源解锁兜底开启时尝试第三方音源，成功与失败两条路径都对外发出可区分的结果。
- 让播放位置与当前曲目可持久化，重启后能恢复；持久化键与上游不冲突。
- 让播放控制与媒体会话（锁屏、耳机按键）接线完成。
- 为六类行为各写一组 Node 自测：队列推入与出队、下一首播放插入、三种播放模式的循环行为、音质降级时的回退选择、音源解锁兜底的成功与失败路径、播放进度持久化与恢复；并接入 `package.json` 的 npm script。
- 让播放引擎产生的失败遵守 ADR-0003：无版权且兜底失败时产出 `KUMONE_UNBLOCK_FAILED`，没有可操作的播放时产出 `KUMONE_NO_ACTIVE_PLAYER`。

## 明确不做什么

- 不在播放引擎里写 DOM，不直接更新迷你播放条或全屏播放页的文本；界面订阅事件来刷新自己。
- 不加载或引用上游原版渲染层的 `state` / `player` / `audio`（ADR-0001），不修改上游任何一行。
- 不在播放引擎里实现逐字歌词与歌词加载钩子（spec 的 Deferred 条目）。
- 不在播放引擎里做手势（上滑出队列、下滑收起播放页、左右滑切歌）。

## Acceptance

- [x] 在 Node 下向引擎推入 3 首曲目，订阅状态变化事件，确认收到队列长度与当前索引变化，且事件载荷里**不含任何 DOM 引用**。
- [x] 向「下一首播放」列表插入 1 首，确认它排在当前曲目的下一位而不在队列末尾。
- [x] 三种播放模式各跑到队列末尾：顺序模式回到队首，单曲模式重播当前曲，随机模式换一首，确认三者行为各不相同。
- [x] 请求一个不可用的音质，确认引擎降级到可播放音质，且 `player.state()` 报告的**实际生效音质**是降级后的值。
- [x] 构造一条无版权曲目且兜底开启：分别让解锁成功与失败，确认成功路径产出可播放地址、失败路径产出 `code === 'KUMONE_UNBLOCK_FAILED'` 且 `kind === 'permanent'`。
- [x] 播放到中途后写入持久化，重建引擎实例，确认当前曲目与播放位置被恢复。
- [x] 执行播放引擎自测脚本，确认六类行为全部 PASS。
- [x] 在引擎源码中检索 `document.`、`getElementById`、`querySelector`，确认无命中（引擎不写 DOM）。
- [x] 检索引擎源码，确认存在 `player.state()` 与 `play` / `pause` / `seek` / `next` / `prev` / `queue` / `setQuality` 命名动词，且不存在直接改 DOM 的状态转移入口。
- [x] 执行 `npm test` 与 `npm run test:live`，确认均保持通过。

## Comments

本 ticket 承接上游「已经跑通」的那部分能力，但**不复用它的实现** —— 上游的播放状态与 `www/app.js` 的单文件作用域绑死，不挂 `window`，移动端引不到（`AGENTS.md` 明确记录了这一点）。

ADR-0003 给本 ticket 增加了两条硬约束，动手前先确认它们不是事后补丁：

1. **状态可查询、转移可命名。** 引擎一落地就要有 `player.state()`，因为模型侧（ticket 12）要靠它判断「现在在放什么」，而不是靠解析 DOM。
2. **不通过直接改 DOM 来模拟状态变化。** 这条会直接影响「拖动进度条」的实现方式：UI 层的滑块不是直接写 `audio.currentTime` 再改显示，而是调 `seek(t)` 然后由事件驱动刷新。

音质降级与音源解锁兜底是**两条不同的路径**，不要合并：前者是「同一首歌换个能放的码率」，后者是「换来源」。合并后错误码就分不出来了（`KUMONE_UNBLOCK_FAILED` 只对后者有意义）。

### 本轮落地结论

- **落点**：`www/mobile/core/player.js`，UMD 双载（浏览器挂 `Mobile.player`，Node `require`）。浏览器分支用 `new Audio()` + `api.makeStore()` 装配。
- **命名动词**：`playQueue` / `queue` / `play` / `pause` / `toggle` / `next` / `prev` / `seek` / `setVolume` / `setRepeat` / `setQuality`；只读读数 `state()`（等价 `snapshot()`）与 `queueItems()`。
  **注意**：`queue()` 现在是**动词**（推入队列），不是读数；读数是 `queueItems()`。
- **四种播放模式**：`off` / `all` / `one` / `shuffle`。非法模式被拒并报 `KUMONE_UNSUPPORTED`（不静默接受）。随机模式在队列 ≥3 首时不会连着同一首，只有 2 首时严格交替。
- **两条兜底路径分开**：
  - 音质降级链 `exhigh → lossless → standard`（请求音质排在最前），成功后 `state().quality` 报告**实际生效**音质，`state().requestedQuality` 保留用户选的。
  - 音源解锁兜底走服务层 `unblock(track)`；成功用第三方地址（`quality` 为 null），失败报 `KUMONE_UNBLOCK_FAILED`（permanent，不重试）。登录中断（`KUMONE_NEED_LOGIN`）**不**被兜底掩盖。
- **没有可播对象**：`play()` 在队列为空时报 `KUMONE_NO_ACTIVE_PLAYER`；`queue([])` 报 `KUMONE_EMPTY_RESULT`。
- **事件**：`subscribe(fn)` 返回退订函数；载荷是纯数据快照，不含 DOM 引用；订阅者自己的异常不影响引擎。
- **持久化**：键一律加 `mobile.` 前缀（`kumone.mobile.playback` / `kumone.mobile.repeat` / `kumone.mobile.quality` / `kumone.mobile.volume`），**刻意与上游 `kumone.playback` 等键错开** —— 上游 `www/app.js` 写的是同前缀不带 `mobile.` 的键，两边同时存在时移动端不会覆盖上游那份。
- **MediaSession**：metadata（标题/艺人/专辑/封面）+ play / pause / previoustrack / nexttrack / seekbackward / seekforward 处理器。
- **自测**：`test/player.test.mjs`（`npm run test:player`），59 项断言，覆盖队列、插播、四种模式、音质降级、解锁兜底、持久化、命名动词、订阅事件、无 DOM 依赖。
- **踩过的坑（浏览器侧）**：UMD 包装里在**工厂函数外部**调用了工厂内部的 `makeStore()`，浏览器分支直接 ReferenceError，`Mobile.player` 整个挂不上 —— 而 Node 自测走 `module.exports` 分支，测不出来。只有浏览器探针能抓到这种「包装层引用越界」的错误。
