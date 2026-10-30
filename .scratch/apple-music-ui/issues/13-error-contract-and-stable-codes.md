# 13: 错误契约与稳定错误码

**Blocked by:** 03: 共享归一化纯函数, 04: 移动端服务层

**Status:** in-progress

## 现状与缺口

- `www/mobile/core/errors.js` 已经存在并实现契约的骨架：错误码表 `CODES`（14 个码）、契约错误构造 `make()`（`:36-52`）、五要素消息拼装 `compose()`（`:54-65`，缺省部分不出现以免制造噪音）、内核错误映射 `fromKernel()`（`:71-132`）、可重试判定 `retryable()`（`:135-137`）。
- 分类已经按「下一步该干什么」而不是按成因划分（`errors.js:16-28`）：`transient` 有 `KUMONE_NETWORK`（`:18`）、`KUMONE_TIMEOUT`（`:19`）、`KUMONE_DECODE_FAILED`（`:20`）、`KUMONE_RATE_LIMITED`（`:21`）；`permanent` 有 `KUMONE_NEED_LOGIN`（`:16`）、`KUMONE_AUTH_EXPIRED`（`:17`）、`KUMONE_EMPTY_RESULT`（`:22`）、`KUMONE_NOT_FOUND`（`:23`）、`KUMONE_UNBLOCK_FAILED`（`:24`）、`KUMONE_STALE_REF`（`:25`）、`KUMONE_AMBIGUOUS_TARGET`（`:26`）、`KUMONE_NO_ACTIVE_PLAYER`（`:27`）、`KUMONE_UNSUPPORTED`（`:28`）。
- 已经有部分产出点：`www/mobile/core/snapshot.js:45` 产出 `KUMONE_STALE_REF`，`:243` 产出 `KUMONE_UNSUPPORTED`。
- **具体缺口一**：**契约在界面层仍然没有任何调用方**。`fromKernel()` 只在 `errors.js` 内部定义；`www/mobile/views/home.js` 与 `library.js` 对 `M.errors` 的引用数为 **0** —— 码表是一张**没接线的表**。`KUMONE_NEED_LOGIN` 在 `errors.js:79-85` 已经准备好了「扫码登录后重试」的下一步动作，但界面上无处可扫码。
- ~~**具体缺口二：`business` kind 没被覆盖**~~ → **已关闭**（本轮随 ticket 04/05 一起修掉）：`www/kumone/lib/client.js:202` 会产出 `kind: 'business'`，此前 `fromKernel()` 没有对应分支，落到网络兜底产出 `KUMONE_NETWORK`（transient）→ 业务失败被当成网络抖动 → 无限重试。现在 `fromKernel()` 新增 `business` 分支，产出 `KUMONE_BUSINESS_REJECTED`（permanent，用户拍板新增），`next` 明说「不要重试」。
- **具体缺口三（新增，因知识包落地而出现）**：**错误码表现在有三份**。权威表在 `www/mobile/core/errors.js:15-29`（13 码）；知识包 `www/mobile/learnings/netease/tools/locator.js:35-41` 自持一份 5 码子集 `TITLES`（注释 `:33-34` 自称「与 core/errors.js 同构」）；`www/mobile/learnings/netease/manifest.json:39-43` 又用 `errorCodes` 写了第三份 5 码说明。**没有任何校验器把三者对齐** —— 码表漂移是已经发生的事实，不是风险。
- **具体缺口四**：**五要素没有强制校验**。`compose()`（`errors.js:54-65`）的设计是「缺省的部分不出现，不制造噪音」，因此一条只带 `next` 的错误是合法的；但 ADR-0003 要求消息含五要素（期望签名 / 当前状态 / 候选 / 阻塞原因 / 下一步动作）。缺省与缺失之间没有区分，**无法判断一条错误消息是否合格**。
- **具体缺口五**：**码表没有回归保护**。`test/guard-design.mjs:78-93` 只检查**每个码都声明了 `kind`**，不检查码的数量、集合、语义，也不检查与知识包的两份副本是否一致 —— 删一个码、把 `KUMONE_NETWORK` 的 `kind` 从 transient 改成 permanent，都不会被现有闸门发现。
- **具体缺口六**：**没有按码分支的证明**。ADR-0003 要求「按码分支，不按文案分支」，但仓库里**没有任何断言**能检查调用方看的是 `err.code` 而不是 `err.message`。现有的 `test/model-actions.mjs` 验证的是动作层返回契约错误（码正确），不是「调用方按码分支」。
- **具体缺口七**：`KUMONE_NO_ACTIVE_PLAYER`（`errors.js:27`）与 `KUMONE_UNBLOCK_FAILED`（`:24`）尚无产出点 —— 前者等播放引擎（ticket 05），后者等音源解锁兜底。

## 要求

- 让 `www/mobile/core/errors.js` 的 14 个错误码成为**唯一权威**的持久契约：码的含义与 `kind` 分类不可随意更改；新增码必须同时更新码表、自测与文档三处。
- 让知识包的两份副本（`www/mobile/learnings/netease/tools/locator.js:35-41` 的 `TITLES`、`www/mobile/learnings/netease/manifest.json:39-43` 的 `errorCodes`）由校验器与 `www/mobile/core/errors.js:15-29` **逐码对齐**：码集合、`kind`、标题三者一致才算通过；不允许知识包自持一份「同构但独立」的码表。
- 让所有内核错误进入界面层时都经 `fromKernel()` 统一翻译成契约错误，界面层不得自造错误结构。
- ~~让 `fromKernel()` 补齐 `business` kind 的映射，并把它归到 `permanent`~~ → **已做**（`errors.js` 新增 `business` 分支 + `KUMONE_BUSINESS_REJECTED`）；同时确认内核 kind 与 HTTP 状态的优先级不冲突（`errors.js` 目前先看 `kind` 再看 `status`，`business` 分支插在 `decoding` 之后、HTTP 状态判断之前）。
- 让错误消息的**五要素**成为可校验的契约：按错误类别规定必备要素（歧义类必须带 `candidates`，过期类必须带 `expected` 与 `next`，鉴权类必须带 `next`），缺失即不合格；不要求所有错误都塞满五段。
- 让等待循环**只对 `transient` 重试**：`permanent` 错误必须直接失败并给出「换策略」的下一步动作。
- 让调用方一律**按 `code` 分支**：`if (err.code === 'KUMONE_NEED_LOGIN')` 是唯一允许的写法；`err.message.indexOf('登录')` 一类按文案分支的写法在自测里失败。
- 让 `KUMONE_AMBIGUOUS_TARGET` 在核心层也有产出路径（当前只有知识包侧 `www/mobile/learnings/netease/tools/playlist.js:78` 产出），配合 ticket 12 的核心 locator。
- 让 `KUMONE_NO_ACTIVE_PLAYER` 与 `KUMONE_UNBLOCK_FAILED` 在各自的实现落地时接上（ticket 05）。
- 新增错误契约自测：14 个码的存在性与分类、**与知识包副本的一致性**、`fromKernel()` 对内核各 kind / HTTP 状态的映射、错误消息五要素的分类必备性、按码分支的反例检测；并接入 `package.json` 的 npm script。
- 让「按码分支」的反例检测覆盖 `www/mobile/` 全目录：检索对 `message` / `title` 做包含判断来决定行为的写法并报失败。

## 明确不做什么

- 不修改已发布码的语义或 `kind` 分类；确需调整时先改 `docs/adr/0003` 或本 ticket 的需求，再改实现。
- 不为每个界面场景单独发明错误码；新码只在语义上不可归入既有码时新增。
- 不用错误消息文案做程序分支；文案可漂移，码不可。
- 不在错误契约层实现具体的退避算法；本层只判定「该不该重试」。
- 不把 `KUMONE_UNSUPPORTED` 用作「功能暂未实现」的通用码 —— 那是 spec 的 Deferred（广播 / 搜索占位），与「动作不在白名单」是两件事。
- 不把知识包的码表当成「独立的一份实现」来维护；它必须是核心码表的投影。

## Acceptance

- [ ] 执行错误契约自测脚本，确认 14 个码全部存在，且每个码的 `kind` 与 `www/mobile/core/errors.js` 的 `CODES` 一致（4 个 transient、10 个 permanent），全部 PASS。
- [ ] 确认校验器会**逐码比对** `www/mobile/core/errors.js:15-29` 与 `www/mobile/learnings/netease/tools/locator.js:35-41`、`www/mobile/learnings/netease/manifest.json:39-43`：在知识包里改一个标题或加一个码，确认校验**失败**并指出文件与行号（反向验证检测器有效）。
- [x] 用假门面注入内核 `kind: 'business'` 的失败，确认产出的错误是 `permanent` 且**不是** `KUMONE_NETWORK`；确认它不会被自动重试。
      → **已做**：`fromKernel()` 新增 `kind === 'business'` 分支，产出 `KUMONE_BUSINESS_REJECTED`（permanent，用户拍板新增）；断言在 `test/service.test.mjs`（`npm run test:service`）。
- [ ] 用假门面分别注入 `needLogin` / `decoding` / HTTP 401 / HTTP 429 / timeout / 网络错误，确认分别产出 `KUMONE_NEED_LOGIN` / `KUMONE_DECODE_FAILED` / `KUMONE_AUTH_EXPIRED` / `KUMONE_RATE_LIMITED` / `KUMONE_TIMEOUT` / `KUMONE_NETWORK`，且分类与预期一致。
- [ ] 逐类检查错误消息，确认含该类**必备**要素：歧义类带 `Candidates`（`errors.js:59-61`）、过期类带 `Expected` 与 `Next`、鉴权类带 `Next`。
- [ ] 在 `www/mobile/` 全目录检索按文案分支的写法（对 `message` / `title` 做 `includes` / `indexOf` 后决定行为），确认自测报**失败**并指出文件与行号。
- [ ] **反向验证检测器**：故意把某处临时改成按文案分支，确认自测确实抓得到；改回后重新通过。
- [ ] 确认一条 `permanent` 错误进入等待循环时被**立即抛出**而不是继续轮询；一条 `transient` 错误允许重试。
- [ ] 确认 `errors.retryable()`（`www/mobile/core/errors.js:135-137`）只对 `kind === 'transient'` 返回 true。
- [ ] 确认在 `www/mobile/` 全目录不存在自造的错误结构（形如 `{ ok: false, msg: ... }` 这类绕过码表的写法）。
- [ ] 执行 `npm test` 与 `npm run test:live`，确认均保持通过。

## Comments

本 ticket 与 ticket 12 是 ADR-0003 的两半：错误契约回答「失败了该怎么办」，模型可读界面回答「怎么不失败 / 怎么重试」。

现状不是「没有错误契约」，而是**契约已经写好但没接线**，外加一个**分类错误**和一份**正在发生的漂移**：

1. **`business` kind 会被误分类。** `www/kumone/lib/client.js:202` 产出 `kind: 'business'`，而 `www/mobile/core/errors.js` 的 `fromKernel()` 没有对应分支，落到 `:126-131` 的兜底产出 `KUMONE_NETWORK`（transient）。后果是：业务失败被当成网络抖动 → 调用方按 transient 重试 → 无限重试。**这是本 ticket 最该先修的一条**，因为它直接违反 ADR-0003 的分类原则。
2. **码表已经有三份了。** 知识包落地后，`www/mobile/learnings/netease/tools/locator.js:35-41` 的 `TITLES` 与 `www/mobile/learnings/netease/manifest.json:39-43` 的 `errorCodes` 各自持有一份码表，而 `www/mobile/core/errors.js:15-29` 是权威表。知识包在 Node 侧自持一份是为了能脱离浏览器 require（`locator.js:32-34` 有注释说明），这个动机是对的，但**结果是不可校验的漂移**。解决办法不是让知识包去 require 浏览器全局（那会破坏 Node 可加载性），而是**加一条逐码比对的校验**。
3. **13 个码目前是「备而不用」**：`KUMONE_NEED_LOGIN` 有 `fromKernel` 的产出点（`errors.js:79`），`KUMONE_STALE_REF` 与 `KUMONE_UNSUPPORTED` 有 `snapshot.js:45` / `:243` 的产出点，知识包侧还有 `KUMONE_EMPTY_RESULT` / `KUMONE_NOT_FOUND` / `KUMONE_AMBIGUOUS_TARGET` 三个产出点（`playlist.js:43` / `:68` / `:78`），其余码还没有调用方。随着 ticket 04/06/08/09/10 接入，它们会陆续被用上；本 ticket 的作用是**把码表钉死并加断言**，防止接线过程中悄悄改语义。
4. **五要素与「不制造噪音」有张力。** `compose()` 的设计是缺省部分不出现，这与 ADR-0003 的「消息含五要素」表面冲突。实际解法不是让所有消息都塞满五段，而是**按错误类别规定必需要素**（歧义必须给候选、过期必须给下一步），缺失即不合格。本 ticket 的自测要按这个口径写。
5. **按码分支的自测要写成「反向验证」**：先故意写一处按文案分支的代码，确认自测抓得到，再改回按码分支。只测正向用例无法证明检测器有效 —— 这是 ego「约束前移成构建错误」的关键：检测器本身必须被验证。

错误码的**新增**要克制：语义上能归入既有码的，就用既有码 + 不同的 `cause` 表达，不要为了「说得更准」而扩表。码表越大，调用方要记的分支越多。
