# 01: 目录归位与入口接线

**Blocked by:** None (can start immediately)

**Status:** in-progress

## 现状与缺口

- 仓库根目录曾有一套「Apple Music 观感」的皮肤层草稿（`apple-theme.js`、`style.css`、`style-mobile.css`、`index.html`、`apple-lyrics.js`），但构建只打包 `www/`（`capacitor.config.json` 的 `webDir: "www"`），那套代码从未进入过安装包；现已 `git mv` 归位到 `www/mobile/reference/` 与 `www/mobile/features/lyrics/`（`git status` 可见五个 R 重命名）。
- 入口页面 `www/index.html` 已改为加载移动端渲染层：`mobile/core/errors.js`（`:32`）→ `mobile/core/shell.js`（`:33`）→ `mobile/core/router.js`（`:34`）→ `mobile/core/snapshot.js`（`:35`）→ 知识包工具三件（`:38-40`）→ `mobile/views/*`（`:42-44`）→ `mobile/app.js`（`:45`）；不再加载上游原版渲染层 `www/app.js`。上游 `www/app.js`、`www/style.css`、`www/style-mobile.css` 仍完整保留在仓库中但不参与加载（ADR-0001）。
- **具体缺口**：`www/index.html:8` 的 `theme-color` 已同步为 `#f4f4f6`，与 ego 画布一致 —— 这一项**已闭环**，保留为不可回退的约束。
- **具体缺口**：`www/index.html:18` 的 `#m-view` 已带 `role="region"` + `aria-label="当前页面"`，快照能读到它；但 `www/mobile/core/router.js:52-58` 的 `M.render()` 每次切换都清空并重建 `#m-view`，因此元素在切换后是新节点、新的 ref（与 ticket 12 的稳定定位诉求直接相关）。
- **具体缺口**：安装到真机后确认启动正常这一项仍未完成 —— 仓库**是** git 仓库且 `.github/workflows/build-android.yml` 已配置（推 `main` 出 artifact、推 `v*` 标签发公开 Release），但**尚无任何 `v*` 标签**，发布链路从未演练，拿不到可下载的安装包（见 ticket 11）。
- **具体缺口**：`test/smoke.js` 的硬编码绝对路径**已修复**（`:3` 起用 `path.join(__dirname, ...)` 相对路径）并已接入 `npm run test:smoke` —— 这一项**已闭环**。

## 要求

- 把所有界面文件保持在 `www/` 内，仓库根目录只放构建产物之外的元信息（文档、脚本、`.scratch/`），不再在根目录出现入口页面或样式文件。
- 让 `www/index.html` 只加载移动端渲染层，不加载上游原版渲染层 `www/app.js`。
- 保持 `www/index.html:8` 的 `theme-color` 为 `#f4f4f6`，与 `www/mobile/css/tokens.css:46` 对齐，不可回退。
- 保留上游原版渲染层与配套脚本在仓库中完整可读，可随时切回对照与回退。
- 保留 hash 深链（`#home` / `#library` / `#fm`），用于预览与调试直接进入某个页面。
- 在每次改动后运行 `npm test`（期望 ALL MATCH）与 `npm run test:live`（期望 6/6 endpoints OK），两者都通过才算完成。
- 保持 `npm run test:smoke` 可运行并输出 `SMOKE: ALL PASS`，且脚本中不含任何硬编码的绝对路径。
- 保持 `test/smoke.js` 与 `test/verify-crypto.js` 在任意机器上可运行（相对路径），不再依赖原作者机器的目录布局。

## 明确不做什么

- 不删除、不就地改造上游原版渲染层 `www/app.js` 与 `www/style.css`（ADR-0001）。
- 不让移动端渲染层与上游原版渲染层同时加载，不做「运行时二选一」开关。
- 不把 `www/mobile/reference/` 下的旧皮肤层与桌面主题接回入口页面，它们只作对照。
- 不在本 ticket 内实现任何界面细节；外壳归 ticket 02，数据归 ticket 04/05。
- 不在本 ticket 内推送 `v*` 标签 —— 出包属于 ticket 11，且必须在真机验收通过之后。

## Acceptance

- [ ] 在仓库根目录执行文件列举，确认没有第二套入口页面或样式文件（只有 `www/` 内有一套可加载的界面）。
- [ ] 打开 `www/index.html`，确认 Network/控制台里加载的是 `mobile/core/*.js`、`mobile/learnings/netease/tools/*.js` 与 `mobile/views/*.js`，且**没有** `app.js`、`style.css`、`style-mobile.css`。
- [ ] 确认 `www/index.html` 源码中 `theme-color` 的值为 `#f4f4f6`。
- [ ] 在浏览器中打开 `www/index.html#library`，确认直接进入资料库页；再打开 `#home` 确认进入主页。
- [ ] 执行 `npm test`，输出 `ALL MATCH`；执行 `npm run test:live`，输出 `6/6 endpoints OK`。
- [ ] 执行 `npm run test:smoke`，输出 `SMOKE: ALL PASS`，且脚本中不含任何 `F:/` 或其它绝对路径。
- [ ] 执行 `npm run web` 后打开 `http://localhost:8100`，确认渲染出 ego 白底外壳（底部导航 + 吸顶标题 + 迷你播放条）且控制台无脚本错误。
- [ ] 在真机安装包上启动一次，确认启动正常、无白屏；该项若本轮无 Android 环境，须在 ticket 11 关闭前完成。

## Comments

根目录的五个草稿文件已用 `git mv` 归位，保留了提交历史：

- `apple-theme.js` → `www/mobile/reference/legacy-apple-theme.js`（仅作对照，不加载）
- `style.css` / `style-mobile.css` → `www/mobile/reference/legacy-desktop-theme*.css`（仅作对照，不加载）
- `index.html` → `www/mobile/reference/legacy-index.html`（那份引用了根目录并不存在的脚本，单独打开必坏）
- `apple-lyrics.js` → `www/mobile/features/lyrics/apple-lyrics.js`（下一轮逐字歌词 feature 的起点，暂不加载）

新增移动端渲染层骨架：`www/mobile/{app.js,core/,views/,css/,fonts/,learnings/}`，`www/index.html` 改为加载它。

**本轮按新基线重写后的实测结论与偏离项**：

1. **视觉基线已切走，且已闭环。** 设计令牌不再是「纯黑底 + `#1c1c1e` 面板 + `#fa2d48` 品牌红 + 毛玻璃」，现在是 ego 风格：`www/mobile/css/tokens.css:37-95` 定义白底画布 `#f4f4f6`、卡片面 `#ffffff` + 1px `#e3e3e7` 描边、卡片圆角 16px、五个角色色（策展橙/我的黄/自动蓝/工具粉/中性灰）；`www/mobile/css/shell.css:190-193` 的迷你播放条用 1px `var(--line-strong)` 黑描边 + `--radius-card`。**品牌红已从移动端样式中彻底移除**（`www/mobile/css/*.css` 中检索不到 `#fa2d48`，仅 `www/mobile/reference/legacy-desktop-theme.css:21` 作为对照件保留）。
2. **偏离项（已修）：状态栏色。** `www/index.html:8` 的 `theme-color` 原为深色 `#000000`，现已同步为 `#f4f4f6`；真机状态栏不再压出黑边。这一条从「待办」转为「不可回退的约束」。
3. **偏离项（已修）：`test/smoke.js` 的绝对路径。** 它原本 require `F:/test/kumone-android/...`，现改为 `path.join(__dirname, ...)`（`:3` 起）并接入 `npm run test:smoke`。`test/verify-crypto.js` 与 `test/live.js` 此前已完成同样的相对路径改造。
4. **新的偏离项：知识包加载顺序。** `www/index.html:37-40` 现在按 `manifest.loadOrder` 加载 `locator.js` → `playlist.js` → `playback.js` 三件知识包工具，注释写明顺序不可调 —— 这三条 `<script>` 的先后是契约，加载顺序错了 `playlist.js` 会在工厂里 throw（`www/mobile/learnings/netease/tools/playlist.js:19`）。
5. **偏离项：发布链路配置就绪但未演练。** 仓库已是 git 仓库（origin `https://github.com/Nobodyruirui/kumone-android.git`），`.github/workflows/build-android.yml` 已配好 `v*` 标签 → 公开 Release；但**没有任何 `v*` 标签**，所以链路从未跑通过。这是 ticket 11 的前置阻塞项，不是本 ticket 的缺陷。
6. **依赖图未动，但标签已同步。** 本 ticket 的 `Blocked by` 保持 `None (can start immediately)`。下游 ticket 07 的 `Blocked by` 原先写着 ticket 02 的旧标题「设计令牌与移动端基础样式」；ticket 02 改名为「设计令牌与外壳（ego 风格）」后，该标签已一并更新为新标题 —— **依赖边（谁依赖谁）一个字没动，只换了名字**，否则会让人以为仓库里还有一张叫「移动端基础样式」的票。
7. 顺带修的两处误导：`test/verify-crypto.js` 与 `test/live.js` 的硬编码 `F:/test/...` 路径（原命令在别的机器上从未成立），以及新增 hash 深链 `index.html#library`。

预览图见 `.scratch/apple-music-ui/preview-shell.png`（390×844 三屏并排），重出图跑 `.scratch/apple-music-ui/shoot-preview.ps1`。
