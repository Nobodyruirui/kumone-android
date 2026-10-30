# 06: 扫码登录

**Blocked by:** 04: 移动端服务层

**Status:** in-progress（扫码闭环已通；资料库拉起扫码、登录过期恢复留给 ticket 10 与后续轮次）

## 现状与缺口

- 内核层已具备扫码三件套：`www/kumone/lib/api.js:25` 的 `qrKey()`、`:28` 的 `qrLoginURL(unikey)`、`:31` 的 `qrCheck(unikey)`；二维码渲染库 `www/vendor/qrcode.bundle.js` 已随包引入 `www/index.html:30`。
- 移动端渲染层目前**没有任何登录视图**：`www/mobile/views/` 只有 `home.js`、`library.js`、`coming.js` 三个文件，`M.views` 里注册的视图类型是 `home` / `library` / `fm` / `search`（`www/mobile/views/coming.js:31-32`）。
- **具体缺口**：登录 Cookie 存在 `localStorage` 的 `MUSIC_U`（`AGENTS.md` 的登录约定），但移动端渲染层里**没有任何读写 `MUSIC_U` 的代码** —— 登录态的读取与登录态失效的检测都不存在。
- **具体缺口**：服务层已经能把 `needLogin` 翻译成 `KUMONE_NEED_LOGIN` 并给出「扫码登录后重试」的下一步动作（`www/mobile/core/errors.js:79-84`），但**没有任何调用方**去执行这个下一步动作 —— 也就是说错误消息里写着「扫码登录后重试」，界面上却无处可扫码。
- **具体缺口**：没有登录相关的 Node 自测；`www/kumone/lib/api.js:41` 的 `refreshLogin()` 与 `:38` 的 `logout()` 也没有移动端侧的消费方。
- **具体缺口**：登录状态机（获取二维码 → 等待扫码 → 登录成功 / 已过期）还没有承载者。

## 要求

- 新增扫码登录视图，把扫码做成**完整闭环**：拉起、二维码、状态提示、过期刷新、成功后回到原页面，以及登录过期后的恢复。
- 让登录状态机显式区分四个状态并把它们呈现出来：正在获取二维码、等待扫码、登录成功、已过期。
- 让二维码过期时可通过刷新重新获取，并让状态回到「正在获取二维码」。
- 让登录成功后拉取账号信息（`userAccount()`）与用户数据（`userPlaylists()`、`likedTrackIDs()`、`playRecords()`、`cloudSongs()`），并回到用户**原本所在的页面**。
- 让登录过期时提示用户并重新拉起扫码，登录成功后**恢复被打断的操作**（从服务层 `KUMONE_NEED_LOGIN` 中断里带回来的目标）。
- 让登录态（`MUSIC_U`）的读取与清除集中在一处，退出登录时清除本地登录态并回到未登录态。
- 让「未登录时点击资料库直接拉起扫码登录」这条路径成立：资料库入口检测到未登录时，**不渲染一个空资料库页**，而是直接拉起扫码。
- 让登录相关逻辑可在 Node 下用假门面自测：二维码获取、状态推进、过期刷新、成功后恢复、过期后重扫五条路径各写一组断言，并接入 `package.json` 的 npm script。
- 让登录失败与过期遵守 ADR-0003：登录态失效产出 `KUMONE_AUTH_EXPIRED`（permanent），网络抖动产出 `KUMONE_NETWORK`（transient），错误消息含五要素与「下一步动作」。

## 明确不做什么

- 不实现账号密码登录、手机号登录、邮箱登录；只用网易云官方扫码流程。
- 不把 Cookie 写进 `document.cookie` 或除 `localStorage` 以外的任何位置；登录态只存 `localStorage` 的 `MUSIC_U`。
- 不实现验证码、图形验证等风控绕过手段。
- 不在登录视图里直接请求网易云接口，一律经服务层（ticket 04）。

## Acceptance

- [ ] 未登录状态下点击底部导航「资料库」，确认**直接出现扫码登录界面**，而不是一个空资料库页或错误提示页。
- [ ] 扫码界面显示二维码图片，并显示当前状态文字「正在获取二维码」→ 切换为「等待扫码」。
- [ ] 让二维码过期，确认界面显示「已过期」并出现刷新入口；点击刷新后状态回到「正在获取二维码」并拿到新二维码。
- [ ] 用网易云音乐 App 扫码并确认，确认状态变为「登录成功」，界面拿到账号头像与昵称，并自动回到点击资料库之前所在的页面。
- [ ] 在登录成功后强制让服务端返回 401，确认界面提示登录已过期并重新拉起扫码；重新登录成功后回到被中断的那次操作（例如「资料库 → 喜欢的音乐」）。
- [ ] 在 `localStorage` 中确认存在 `MUSIC_U`，且退出登录后该键被清除，界面回到未登录态。
- [ ] 执行登录自测脚本，确认五条路径（获取、推进、过期刷新、成功恢复、过期重扫）全部 PASS。
- [ ] 检索登录相关源码，确认没有把 `MUSIC_U` 写到 `document.cookie` 或 `sessionStorage`。
- [ ] 执行 `npm test` 与 `npm run test:live`，确认均保持通过。

## Comments

扫码登录不是「多加一个页面」，而是**跨页面的中断恢复机制**：它会从资料库、主页区块、甚至播放请求的中间被拉起来，然后必须把人送回原处并重放被打断的动作。所以本 ticket 与 ticket 04 的契约是硬的 —— 服务层必须把 `KUMONE_NEED_LOGIN` 连同「被中断的目标」一起交上来。

三个落地时的坑：

1. **恢复靠的是栈，不是靠猜。** `www/mobile/core/router.js:18-29` 的 `M.nav` / `M.back` 已经维护了导航栈，登录成功后应当回到栈里的那个视图，而不是重置到主页。
2. **二维码有有效期。** `qrKey` / `qrLoginURL` 拿到的二维码会过期，界面必须有一个明确的过期态和刷新入口，否则用户只会看到一张转不出来的二维码。
3. **登录态检测要区分「没登录」和「登录过期」。** 前者走 `KUMONE_NEED_LOGIN`，后者走 `KUMONE_AUTH_EXPIRED`（`www/mobile/core/errors.js:17`），两者的下一步动作不同：前者拉起扫码，后者提示并重新拉起扫码。

二维码渲染用已随包引入的 `www/vendor/qrcode.bundle.js`，不新增依赖。

### 本轮落地结论（核心闭环已完成）

- **状态机**：`www/mobile/core/login.js`（新）—— 纯逻辑，不碰 DOM、不碰计时器，轮询由外部调 `tick()`，所以能在 Node 里逐条断言。
  阶段：`idle → fetching → waiting → scanned → success`，`waiting → expired → (刷新) → fetching`，任何一步失败进 `error`。
  网易云扫码返回码映射：`800 → expired`、`801 → waiting`、`802 → scanned`、`803 → success`。
- **视图**：`www/mobile/views/login.js`（新）—— 二维码 + 状态文字 + 过期刷新按钮 + 失败重试。成功态拉一次 `account()` 显示昵称，600ms 后 `M.back()` 送回原处（栈里那个视图会被重新渲染，被打断的动作自然重放）。
- **服务层**：新增 `qrKey()` / `qrCheck(key)` / `qrImage(text)` 三个方法，走同一条 `call()` 翻译点，失败照样是契约错误。
- **离场钩子**：`www/mobile/core/router.js` 新增 `leave()` —— 视图可以声明离场收尾，扫码页用它停掉轮询定时器（否则离开登录页后定时器还在转）。
- **登录态的读写集中在服务层**：`service.isLoggedIn()` 读、`service.logout()` 清；cookie 本身由内核的 client 持有（`localStorage` 的 cookie jar）。移动端渲染层**没有**任何 `document.cookie` / `sessionStorage` 写入 —— 已 grep 确认（`MUSIC_U` 只出现在一条错误消息文案里）。
- **自测**：`test/login.test.mjs`（`npm run test:login`），25 项断言，覆盖获取、推进、过期刷新、成功恢复、过期重扫一条龙、网络抖动不判死、码表完整性。

**还没做的（留给后续）**：

- [ ] 未登录时点击底部导航「资料库」直接拉起扫码 —— `views/library.js` 目前仍是入口占位，属 ticket 10。
- [ ] 登录过期（`KUMONE_AUTH_EXPIRED`）时自动重新拉起扫码并恢复被打断的操作 —— 错误卡已经能给出「去登录」按钮，但「自动重拉 + 自动恢复」这条链还没接。
- [ ] 登录成功后预取 `userPlaylists` / `likedTrackIDs` / `playRecords` / `cloudSongs` —— 归属资料库（ticket 10）。
- [ ] 真人拿网易云 App 扫码走一遍（当前环境无法真机扫码，只能用假服务验证状态机）。
