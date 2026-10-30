# 04: 移动端服务层

**Blocked by:** 03: 共享归一化纯函数

**Status:** done

## 现状与缺口

- 移动端渲染层目前只有四个视图文件（`www/mobile/views/home.js`、`library.js`、`coming.js`）与三个 core 模块（`shell.js`、`router.js`、`snapshot.js`），**没有任何服务层**：没有 `www/mobile/service/` 目录，也没有 `www/mobile/core/service.js`。
- 现状是视图直接缺席数据：`www/mobile/views/library.js:43` 的每个入口点击后只弹一句 toast「将在后续版本开放」，没有真实请求；`www/mobile/views/home.js:44-52` 的三个区块全是 `skeletonGrid` 占位。
- 内核层已经具备全部所需能力：`www/kumone/lib/api.js` 暴露了 `dailyRecommendSongs`（:91）、`recommendResource`（:88）、`personalizedPlaylists`（:84）、`toplists`（:111）、`topArtists`（:186）、`newAlbums`（:166）、`playlistDetail`（:95）、`playlistTracks`（:123）、`userPlaylists`（:49）、`likedTrackIDs`（:54）、`cloudSongs`（:75）、`playRecords`（:71）等入口。
- **具体缺口**：`www/kumone/lib/client.js:192-202` 会把失败翻译成 `kind: 'decoding'` / `kind: 'needLogin'` / `kind: 'business'` 三种内核语义，但移动端目前**没有一处消费它们** —— 没有把它们翻译成 ADR-0003 的契约错误码（`www/mobile/core/errors.js` 的 `fromKernel`，:71）。
- **具体缺口**：`KUMONE_NEED_LOGIN` 这个码已存在（`www/mobile/core/errors.js:16`），`fromKernel` 也已给出「扫码登录后重试」的下一步动作（:83），但没有任何调用方 —— 也就是说「需要登录 → 拉起扫码」这条中断链路目前是**断的**。
- **具体缺口**：没有服务层的 Node 自测脚本，`package.json` 里也没有对应 npm script。

## 要求

- 新增移动端服务层，作为移动端渲染层与内核门面之间的唯一边界。
- 让服务层只通过内核门面 `window.kumone.invoke(channel, args)`（见 `AGENTS.md` 的分层约定）调用网易云能力，保留其统一的成功/失败返回包。
- 让服务层把内核返回的原始结构交给共享归一化层（ticket 03）转换，输出界面可直接使用的形态。
- 让服务层把内核失败统一翻译成 ADR-0003 的契约错误：用 `www/mobile/core/errors.js` 的 `fromKernel()` 产出带稳定错误码、`transient`/`permanent` 分类与五要素消息的错误对象，**不得**在服务层里另造一套错误结构。
- 让服务层把 `KUMONE_NEED_LOGIN` 识别成一次**登录中断**而不是普通错误：中断应携带「恢复后回到被打断的页面并重放该操作」所需的信息，由界面层拉起扫码流程。
- 让服务层只对 `transient` 类错误提供重试入口，`permanent` 类错误直接呈现为「换策略」的提示。
- 补齐常用数据入口：每日推荐、推荐歌单、排行榜、推荐歌手、新碟、歌单详情、歌单曲目、我的歌单、喜欢的音乐、云盘、最近播放、听歌排行。
- 让服务层可在 Node 下用假门面注入固定返回结构进行自测，并为归一化转换、错误传播、`需要登录` → 登录中断三条路径各写一组断言。
- 把服务层的自测脚本接入 `package.json` 的 npm script。

## 明确不做什么

- 不在服务层里写 DOM、不拼 HTML、不持有视图状态；界面渲染属视图层。
- 不在服务层里直接调用 `www/kumone/lib/api.js` 的内部实现，必须走内核门面，保持「内核层零改动」。
- 不在服务层里吞掉错误；失败必须以契约错误对象原样向上传播。
- 不在服务层里实现播放队列与播放状态机，那属 ticket 05。

## Acceptance

- [x] 在 Node 下用假门面注入一组固定的每日推荐返回，调用服务层对应方法，确认输出的每条曲目都带 `id` / `name` / `artists` / `album` / `durationMS` 字段且艺人是拼接后的可展示字符串。
- [x] 用假门面注入 `kind: 'needLogin'` 的失败返回，确认服务层返回的错误对象满足：`code === 'KUMONE_NEED_LOGIN'`、`kind === 'permanent'`、`message` 含「Expected」「State」「Blocked by」「Next」四段、`next` 含「扫码登录」。
- [x] 用假门面注入 `kind: 'decoding'` 与 HTTP 429 的失败返回，确认分别产出 `KUMONE_DECODE_FAILED` 与 `KUMONE_RATE_LIMITED`，且两者 `kind` 均为 `transient`。
- [x] 用假门面注入 HTTP 401/403，确认产出 `KUMONE_AUTH_EXPIRED` 且 `kind === 'permanent'`。
- [x] 执行服务层自测脚本，确认全部 PASS，且脚本执行过程中没有 DOM 访问报错。
- [x] 在 `www/mobile/core/` 或 `www/mobile/service/` 下检索 `document.`、`window.innerWidth`，确认服务层无 DOM 依赖。
- [x] 检索服务层全文，确认没有出现 `kind === 'needLogin'` 这类**按文案/内核字面量分支**的判断，而是按 `code` 分支（ADR-0003）。
- [x] 执行 `npm test` 与 `npm run test:live`，确认均保持通过。

## Comments

本 ticket 是「界面能看见真实数据」与「登录中断能真的被拉起」这两件事的落点。

三个容易做错的地方：

1. **不要在服务层重新发明错误结构。** `www/mobile/core/errors.js` 已经有 14 个稳定码、`make()` 与 `fromKernel()`，服务层的职责只是**调用** `fromKernel()`，不是再造一个 `{ok:false, msg}`。ADR-0003 要求按码分支，重造结构等于把契约撕开。
2. **`needLogin` 不是一个普通的失败分支。** 它是「打断当前流程 → 拉起扫码 → 恢复后重放」。如果服务层把它降级成一个普通错误 toast，ticket 06 与 ticket 10 的「未登录点资料库直接拉起扫码」就永远做不出来。
3. **重试只对 transient 开放。** `errors.retryable()`（`www/mobile/core/errors.js`）已经给了判定依据；服务层若对 permanent 错误也提供「重试」按钮，用户会陷在无效循环里。

### 本轮落地结论

- **落点**：`www/mobile/core/service.js`，UMD 双载（浏览器挂 `Mobile.service`，Node `require`）。浏览器分支在加载时用 `window.kumone` 装配一个实例；门面缺失时不炸页面，而是留一个会明确报错的门面，便于定位接线问题。
- **唯一翻译点**：服务层里的 `call(channel, args, ctx)` 是**唯一**把内核结果转成 `{ok:true,data}` / 契约错误的地方，视图层永远拿不到内核原始错误。
- **登录中断**：`KUMONE_NEED_LOGIN` 的错误对象额外带 `loginInterrupt: true` 与 `resume: { channel, args }` —— 扫码成功后可以原样重放被打断的那个请求。
- **新增错误码（用户拍板）**：业务类失败此前会兜底成 `KUMONE_NETWORK`（transient）→ 界面无限重试。现新增 `KUMONE_BUSINESS_REJECTED`（permanent），`fromKernel()` 新增 `kind === 'business'` 分支，`next` 明说「不要重试：换一个请求参数或换一个数据入口」。错误码总数 13 → 14。
- **可测试性**：`createService({ facade })` 接受注入的假门面，自测用固定返回结构覆盖归一化、错误传播、登录中断三条路径。
- **自测**：`test/service.test.mjs`（`npm run test:service`），21 项断言。
- **踩过的坑**：假门面的 channel 名要跟内核一致 —— 服务层调的是 `userPlaylists`，自测里写成 `myPlaylists` 会静默走到「未预设的通道」分支，表现为「错误码不对」而不是「测试写错」，容易误判成实现有 bug。

数据入口清单以 `www/kumone/lib/api.js` 为准，不新增内核接口。
