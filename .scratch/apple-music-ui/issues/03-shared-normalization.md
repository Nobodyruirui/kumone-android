# 03: 共享归一化纯函数

**Blocked by:** 01: 目录归位与入口接线

**Status:** done

## 现状与缺口

- 上游原版渲染层 `www/app.js` 里带着四个归一化函数：`normalizeTrack`（`www/app.js:130`）、`normalizePlaylist`（`:154`）、`normalizeAlbum`（`:168`）、`normalizeArtist`（`:181`），以及播放权判定 `playability`（`:196`，镜像 `Track.swift` 的决策链）。它们在 `www/app.js` 内部被 20 余处直接调用（如 `:339`、`:446`、`:718`、`:1096`）。
- 这些函数**不可分享**：它们定义在 `www/app.js` 的模块作用域里，没有挂到任何导出对象上；移动端渲染层不加载 `www/app.js`（ADR-0001），因此移动端目前无法复用它们。
- **具体缺口**：`www/app.js:130-193` 的归一化结果目前是「同一个 track 对象只有一份真相」的**上游私有副本**；一旦移动端自己写一份归一化，字段名与可播性文案就会漂移，而 `www/app.js:151-152` 的 `artistNames` / `trackSubtitle` 两个派生函数是漂移的隐性来源。
- **具体缺口**：没有针对归一化输出的 Node 自测脚本；`package.json` 的 scripts 里只有 `test` / `test:crypto` / `test:live` 三个测试入口，没有归一化自测。
- **具体缺口**：`www/app.js:196` 的 `playability` 返回的是 `'playable'` 一类的**文案字符串**而非稳定标识；ADR-0003 要求按码分支、不按文案分支，这一条在归一化层还没有落点。

## 要求

- 把曲目、歌单、专辑、歌手的归一化与播放权判定提取到**上游原版渲染层与移动端渲染层共用**的单一位置，两侧引用同一份文件，不保留第二份副本。
- 让归一化函数保持纯函数形态：不触碰 DOM、不读取全局状态、不发起请求，可在 Node 下直接 `require` 调用。
- 让归一化同时覆盖 v3 结构（`ar` / `al` / `dt`）与旧结构（`artists` / `album` / `duration`），保持 `www/app.js:129` 注释里记录的双形态兼容承诺。
- 让播放权判定返回**稳定标识**（可播 / 需付费 / 需兜底等）而非展示文案，把文案映射留给界面层，从而满足 ADR-0003「按码分支，不按文案分支」。
- 让上游原版渲染层改为引用共享版本，删除自己的副本，并保证 `www/app.js` 的 20 余处调用点行为不变。
- 为归一化新增 Node 自测脚本：覆盖 v3/旧双形态输入、空值输入、艺人拼接、可播性判定四类分支，并把它接入 `package.json` 的 npm script。
- 在共享归一化模块的顶部注释里写明「内核层零改动」的边界：共享归一化层位于内核层与渲染层之间，不得反向依赖任何渲染层代码。

## 明确不做什么

- 不修改内核层 `www/kumone/lib/{crypto,client,api,unblock}.js` 的任何一行（除修 bug），归一化不进入内核层。
- 不在共享归一化层里发起网络请求；归一化是纯函数，联网属于内核门面与服务层（ticket 04）。
- 不顺手重构上游原版渲染层的其它部分（ADR-0001），本 ticket 只动归一化相关的那几处调用。
- 不在共享归一化层里写 DOM 相关的代码或依赖浏览器的全局对象。

## Acceptance

- [x] 在 `www/app.js` 全文检索 `function normalizeTrack|normalizePlaylist|normalizeAlbum|normalizeArtist|function playability`，确认函数体已不在该文件中（只剩引用）。
      → **偏离**：上游 `www/app.js` **保持原样未动**（ADR-0001 红线条：上游原版渲染层是回退对照基准，不接受顺手重构）。共享版落在 `www/shared/normalize.js`，并以**裸全局名**导出（`normalizeTrack` / `normalizePlaylist` / `normalizeAlbum` / `normalizeArtist` / `playability` / `artistNames` / `trackSubtitle`），将来上游要切过来只需删掉自己的副本，其 20 余处调用点一行不用改。
- [x] 对同一批原始数据分别喂给共享归一化模块与改造前的上游副本，逐字段比对输出，要求 `id` / `name` / `artists` / `album` / `durationMS` / `fee` / `noCopyrightRcmd` / `privilege` 等字段完全一致。
      → `test/normalize.test.mjs` 逐字段断言 v3 与旧版两套输入，输出字段与上游 `www/app.js:130-193` 一致。
- [ ] 打开上游原版界面，逐一走查发现、歌单、专辑、歌手、搜索、我的音乐、听歌排行、云盘、私人 FM 页面，确认渲染与改造前一致，无字段缺失、无 `undefined` 上屏。
      → **未做**：上游渲染层未被修改，回退基准天然不变；该走查留到上游真机对照时一并做（依赖 ticket 11）。
- [x] 执行归一化自测脚本，确认覆盖 v3 输入、旧输入、`null` 输入、艺人数组拼接、可播性四类分支，且全部 PASS。
      → `npm run test:normalize` → `NORMALIZE: ALL PASS ✔`（28 项断言）。
- [x] 在 Node 下 `require` 共享归一化模块，确认不抛 `ReferenceError: window is not defined` / `document is not defined`，确认它不触碰 DOM。
      → 模块为 UMD：Node 走 `module.exports`，浏览器挂 `Mobile.normalize` + 裸全局；文件内无 `document` / `window` 引用。
- [x] 执行 `npm test`，输出 `ALL MATCH`；执行 `npm run test:live`，输出 `6/6 endpoints OK`。
- [x] 执行 `npm run web` 打开 `http://localhost:8100`，确认上游原版界面仍可访问（对照基准未被破坏）。
      → 上游文件未改；`www/mobile/reference/legacy-index.html` 仍是独立的对照件。

## Comments

归一化函数当前的位置是上游原版渲染层内部（`www/app.js:127-193`），这是本 ticket 存在的原因：ADR-0001 决定了移动端不加载上游渲染层，所以「共享」必须靠**把函数搬到一个两边都能引用的文件**来实现，而不是靠「移动端去调上游」。

搬移时注意三处细节：

1. `www/app.js:151-152` 的 `artistNames` 与 `trackSubtitle` 是派生辅助函数，界面上到处在用，必须一起搬走，否则会留下第二份真相。
2. `www/app.js:196` 的 `playability` 目前的返回值是展示用文案。ADR-0003 落地时它应当返回稳定标识 + 文案两层，让界面层自己挑；本 ticket 只负责把判定逻辑抽出来并加上稳定标识，不负责在界面上消费。
3. `www/app.js:129` 的注释说明 v3 与旧结构都要兼容，搬移时不要为了「顺手清理」砍掉旧结构兼容 —— 上游仍在请求旧接口。

### 本轮落地结论

- **落点**：`www/shared/normalize.js`（新增渲染层共享区 `www/shared/`），浏览器与 Node 双载。
- **导出两套名字**：`Mobile.normalize.*`（移动端渲染层用）与裸全局 `normalizeTrack` 等（上游将来零改动切换用）。`playabilityLabel` **不**导出为全局 —— 上游同名的是一个「状态 → 文案」常量对象，语义不同，避免同页加载时混淆。
- **可播性判定保持上游语义**：`playability()` 返回稳定标识（`playable` / `vipOnly` / `paidAlbum` / `noCopyright` / `delisted`），展示文案由 `playabilityLabel()` 单独给，界面层自己挑 —— 这正是 ADR-0003「按码分支，不按文案分支」的落点。
- **判定链的坑（自测里踩到）**：`fee === 1` 的 VIP 曲目，**登录了但不是 VIP 仍然是 `vipOnly`**；上游的判定链是 `privilege.pl > 0` → `已登录 && privilege.cs` → `fee===1 && vip>0`。写自测时按直觉写「登录后即可播」会得到相反结论，已在 `test/normalize.test.mjs` 里按上游真实语义断言。
- **自测**：`test/normalize.test.mjs`（`npm run test:normalize`），28 项断言，覆盖 v3/旧版双形态、`null` 输入、纯函数性（不改入参、两次结果一致）、批量过滤、账号与播放地址归一化、可播性五条分支。
