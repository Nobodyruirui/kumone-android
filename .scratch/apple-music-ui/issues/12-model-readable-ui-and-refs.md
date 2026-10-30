# 12: 模型可读界面与稳定 ref 体系

**Blocked by:** 03: 共享归一化纯函数, 04: 移动端服务层

**Status:** ready-for-agent

## 现状与缺口

- 感知层与动作层**已经就位**：`www/mobile/core/snapshot.js` 实现了 ref 分配与复用（`refFor`，`:28-36`）、ref 解析与过期判定（`resolve`，`:39-53`，报 `KUMONE_STALE_REF`）、语义抽取与折叠（`extract`，`:131-169`）、动作白名单 `click` / `scroll` / `focus` / `fill`（`ACTIONS`，`:221-229`）、动作执行（`act`，`:235-261`，白名单外报 `KUMONE_UNSUPPORTED`）。入口 `www/index.html:35` 已加载它。
- **只读已经是真的**：`refFor` 用 `WeakMap`（`:21`）保存 element → ref，**不往 DOM 写任何东西**（`:26` 的注释明确写了这一点）；快照根从 `#m-app` 改成 `document.body`（`:195`），否则模型看不到挂在 body 上的底部导航与迷你播放条；`live` 映射在每次快照时清理已卸载节点（`:211`）。已有只读回归测试 `test/snapshot-readonly.mjs`，动作层回归测试 `test/model-actions.mjs`，两者都已接入 `npm run test:readonly` / `npm run test:model`。
- 预览侧已经能读到这棵树：`.scratch/apple-music-ui/preview-harness.html:36-38` 在 iframe 里调 `M.snapshot()` 并把 `snap.tree` 渲染到右侧面板。
- **具体缺口一**：**核心层没有 locator API**。role + name 的匹配实现放在知识包 `www/mobile/learnings/netease/tools/locator.js`（`parseTree` `:104-140`、`findMatches` `:200-213`、`candidateNames` `:216-226`），也就是说**稳定定位只在「加载了知识包」时可用**；`Mobile.snapshot()` / `Mobile.act()` 本身仍只认 ref。ADR-0003 §2 规定的「快照 ref > 语义 locator > 裸 CSS」三层优先级，模型侧目前只用到第一层。
- **具体缺口二**：**视图重建导致 ref 断裂**。`www/mobile/core/router.js:52-58` 的 `M.render()` 每次都 `root.textContent = ''` 再重建 `#m-view`，因此同一语义元素在切换视图后是**新的 DOM 节点**、新的 ref。`resolve()` 能正确报 `KUMONE_STALE_REF`（`snapshot.js:39-53`），但这只把「静默失败」变成「明确报错」，没有提供任何稳定的重新定位手段 —— 核心层需要能按 role + name 重新解析到等价目标。
- **具体缺口三**：**语义标签覆盖不全**。`www/mobile/views/home.js:20` 的区块用了 `role="region"` + `aria-label`（正确示范），但 `home.js:44-52` 的区块内容全是 `skeletonGrid` 占位（`:27-36`），模型读不到真实内容；`www/mobile/views/library.js:37` 把 `role="listitem"` 压在 `<button>` 上，快照里该节点的角色与实际可交互性不符（`snapshot.js:69-73` 的 `roleOf()` 显式 `role` 优先）。
- **具体缺口四**：**没有「按码分支」的自测**。`snapshot.js` 与 `errors.js` 都按码分支，但仓库里没有任何断言能证明**调用方**看的是 `err.code` 而不是 `err.message`（归 ticket 13 的检测器）。
- **具体缺口五**：**没有「禁裸 CSS 选择器」的闸**（归 ticket 14）。注意现状里 `www/mobile/core/shell.js:94` / `:127` 有两处裸选择器 —— 它们是「实现内部面」，规则必须区分模型定位面与实现内部面，否则一刀切会误伤正常实现。

## 要求

- 让 `Mobile.snapshot()` 保持为模型侧唯一的观察入口：返回当前界面的语义文本树（带缩进的纯文本，不是 JSON），节点带 ref，并以 `[view "..." | refs live]` 作为上下文头（沿用 `snapshot.js:214` 的现有形态）。
- 让同一元素在同一视图内重复快照时 ref 保持不变（由 `WeakMap` + `test/snapshot-readonly.mjs` 保障，不得回退）。
- 让**核心层**暴露一层稳定 locator：支持按 role + name 定位（例如 `loc=role=button[name="资料库"]`），使视图重建后语义上同一个元素能重新解析到等价目标。知识包 `www/mobile/learnings/netease/tools/locator.js` 已有的匹配能力（`parseTree` / `findMatches` / `candidateNames`）应被提升到核心层或由核心层复用，**不允许知识包与核心层各写一套**。
- 让 locator 的解析优先级高于裸 CSS 选择器；坐标是最后手段，本轮不提供坐标定位。
- 让 `Mobile.act(ref, action, args)` 的动作严格受白名单约束，当前白名单为 `click` / `scroll` / `focus` / `fill`（`snapshot.js:221-229`）；白名单外的动作必须返回 `KUMONE_UNSUPPORTED` 并在 `cause` 里列出可用动作，**不得静默忽略**。
- 让观察保持只读：`snapshot()` 不改变播放状态、不发请求、不改焦点、**不写 DOM**；维持 `test/snapshot-readonly.mjs` 为回归闸，并把「不写 DOM」纳入断言。
- 让降噪遵守红线：可折叠结构（无名空容器删除、单子节点容器用子节点替换自身），但**永远不许删改非空页面文本**（`snapshot.js:128-129`）。
- 让「按码分支」成为硬规则：调用方一律按 `err.code` / `err.kind` 分支，禁止按消息文案分支。
- 让语义契约可验证：可交互元素必须带语义标签 + `aria-label`；把「禁止裸 CSS 选择器与硬编码坐标」落成自测断言（构建期失败，而非评审时口头约定）。
- 为 `www/mobile/core/snapshot.js` 与核心 locator 层补齐 Node 自测：ref 复用、ref 过期报 `KUMONE_STALE_REF`、白名单外动作报 `KUMONE_UNSUPPORTED`、错误消息五要素齐全、快照不改变播放状态/不发请求/不改焦点/不写 DOM、locator 能跨视图重建重新命中；并接入 `package.json` 的 npm script。

## 明确不做什么

- 不为模型提供「直接改 DOM」的接口；状态转移只走命名动词（`play` / `pause` / `seek` / `next` / `prev` / `queue` / `setQuality`），见 ADR-0003。
- 不提供像素坐标定位；坐标是最后手段，本轮不引入。
- 不把 `www/mobile/core/snapshot.js` 重写成通用浏览器自动化框架；它只服务本 App 的界面。
- 不实现逐字歌词页与手势动作（spec 的 Deferred D1 / D2），它们不进入本轮模型动作白名单。
- 不在知识包（`www/mobile/learnings/`）里收录任何临时 ref —— 那是 ticket 14 的范围，与本 ticket 的「稳定 locator」互补而非重叠。

## Acceptance

- [ ] 在浏览器控制台执行 `Mobile.snapshot()`，返回对象含 `ok: true`、`scope: 'full'`、`tree`；tree 首行是 `[view "home" | refs live]`。
- [ ] 连续执行两次 `Mobile.snapshot()`，确认同一元素在两次输出中 ref 相同（例如两次都是 `button "资料库" [ref=@12]`）。
- [ ] 切到资料库页后执行 `Mobile.snapshot()`，确认 tree 首行变成 `[view "library" | refs live]`，且「播放列表」「喜欢的音乐」「云盘」「最近播放」「听歌排行」五个节点各带 name 与 ref。
- [ ] 用上一步得到的 ref 执行 `Mobile.act("@N", "click")`，确认返回 `{ ok: true, action: 'click', ref: '@N', role: ..., name: ... }`，且界面发生了对应变化。
- [ ] 切走视图使原元素被卸载，再执行 `Mobile.act("@N", "click")`，确认返回 `ok: false`、`code === 'KUMONE_STALE_REF'`、`kind === 'permanent'`，且 message 的 `Next` 段给出「重新取一次快照」。
- [ ] 执行 `Mobile.act("@N", "swipe")`，确认返回 `ok: false`、`code === 'KUMONE_UNSUPPORTED'`，且 message 的 `Blocked by` 段列出 `click / scroll / focus / fill`。
- [ ] 用 role + name 的稳定 locator 定位「资料库」导航项并点击，确认无需记住上一次的 ref 也能命中同一元素；**且该 locator 由核心层提供，不要求额外加载知识包**。
- [ ] 切换一次视图（触发 `M.render()` 重建）后，再用同一 locator 重新命中「资料库」，确认仍能命中 —— 这条是「ref 会断但 locator 不断」的直接证据。
- [ ] 执行 `Mobile.snapshot()` 前后各读一次播放状态，确认两次读数**完全一致**；调用期间 Network 面板**无新增请求**；`document.activeElement` 未改变；**DOM 未被写入**（不产生 `data-mref` 之类的标记属性）。
- [ ] 在 `www/mobile/` 全目录检索硬编码坐标（如 `getBoundingClientRect` 配固定数字、`clientX` / `clientY` 固定值），确认无命中。
- [ ] 执行 snapshot 与 locator 自测脚本，确认上述断言全部 PASS，并接入 npm script 后可一条命令跑完。

## Comments

本 ticket 是 ADR-0003 的一半，另一半是 ticket 13（错误契约）。两者互相引用：动作失败要报什么码，由错误契约定义；错误消息里的「下一步动作」要给出可执行的模型调用，由动作层定义。

现状不是「从零做」而是「补齐最后一层」：`www/mobile/core/snapshot.js` 的 ref 体系、动作白名单、语义抽取（折叠规则见 `:128-129`，红线是「任何非空文本都不被删改」）都已经在了，只读也已经是真的（`WeakMap`，`:21` 与 `:26`）。真正缺的三件事：

1. **把稳定 locator 提升到核心层。** ego 的原文区分得很清楚：**ref 是短命的、locator 才是稳定的**（`docs/ego-lite-UI设计理论.md` L2/L3）。现在 role + name 的匹配已经在知识包里实现了（`www/mobile/learnings/netease/tools/locator.js`），但核心层的 `Mobile.snapshot()` / `Mobile.act()` 不认它 —— 模型必须额外加载知识包才能稳定定位。要么把匹配能力提到 `core/`，要么让核心层直接复用知识包的 helper，**但不能两处各写一套**（那是 ADR-0003 §10「约束前移」要防的事）。
2. **「只读」的口径已经落定。** 上一轮这里还有个待拍板的问题（`snapshot()` 是否允许写 `data-mref` 标记属性）—— 现在实现已用 `WeakMap` 解决，DOM 零写入，`test/snapshot-readonly.mjs` 是回归闸。**这条口径不再需要拍板，但需要写进本 ticket 的要求防止回退。**
3. **构建期断言。** ADR-0003 §10 说「违反约定的写法在自测里失败，而不是靠代码评审发现」。本 ticket 的自测是起点，ticket 14 会把它扩展成完整的构建期纪律（裸 CSS 选择器、界面层直接改状态、按文案分支）。

关于依赖：本 ticket 依赖 ticket 03/04，是因为语义树里最有价值的部分（曲目名、歌手名、歌单名）来自归一化与服务层；在这两张票完成前，快照只能读到骨架与占位符。ref 体系与 locator 本身可以先行，但它拿不到值得验证的内容。
