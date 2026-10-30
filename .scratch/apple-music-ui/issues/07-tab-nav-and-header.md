# 07: 底部导航与吸顶标题接线

**Blocked by:** 02: 设计令牌与外壳（ego 风格）, 04: 移动端服务层

**Status:** ready-for-agent

## 现状与缺口

- 底部导航的**骨架已经建好但没有接线**：`www/mobile/core/shell.js:54-64` 的 `buildNav()` 已创建 `#m-nav` 与四个 `<button class="m-tab">`（主页 / 广播 / 资料库 / 搜索，见 `:21-26` 的 `TABS`），每个按钮已带 `aria-label` 与 `data-view`；但点击处理是 `b.addEventListener('click', function () { M.goTab(t.view); })`（`:60`），而 `M.goTab` 在 `www/mobile/core/router.js:32-41` 里把视图切成 `M.views[view]`，**当前 `M.views` 只注册了 `home` / `library` / `fm` / `search`**（`www/mobile/views/home.js:38`、`library.js:28`、`coming.js:31-32`），其中 `fm` 与 `search` 是占位页。
- 吸顶标题的**骨架也已经建好**：顶栏 `#m-header`（`www/mobile/core/shell.js:43-52`）含 `#m-title`（`role="heading"` `aria-level="1"`）与 `#m-back`（返回按钮）；`sync()`（`:83-104`）负责把 `def.title` 写进 `#m-title` 并同步 `aria-label`；滚动收缩由 `boot()` 里的 `scroll` 监听完成（`:160-164`，阈值 `scrollTop > 12`）。
- **具体缺口**：`M.render()`（`www/mobile/core/router.js:52-58`）每次都 `root.textContent = ''` 清空 `#m-view` 再重建 —— 视图里的 DOM 元素**每次切换都被销毁重建**，这意味着快照的 ref 会随视图重建而失效（与 `www/mobile/core/snapshot.js:39-53` 的 `KUMONE_STALE_REF` 判定直接相关，模型侧契约见 ticket 12）。
- **具体缺口**：`sync()` 里的当前项判定（`www/mobile/core/shell.js:93`）把 `playlist` / `album` / `artist` 一律回落到 `home` 选中态，但这些视图类型**尚未注册**，导航栈也没有承载它们的视图实现（属 ticket 08/09/10）。
- **具体缺口**：返回按钮的显隐由 `sync()` 依据 `M.state.history.length` 决定（`:102-103`），但**没有**「栈空时回到主页」的显式路径；`M.back()`（`www/mobile/core/router.js:26-29`）在空栈时靠 `|| { type: 'home' }` 兜底，行为正确但没有测试。
- **具体缺口**：`www/mobile/core/router.js` 的 `M.goTab` 在当前页时只把 `scrollTop` 归零（`:33-36`），**不重新渲染**，因此在当前页的区块内跳转后导航选中态可能不同步。

## 要求

- 让底部导航四项可真正切换，选中态跟随当前视图，并用 `aria-current="page"` 标记当前项。
- 让每个页面顶部显示该页名称，切换视图时同步更新 `#m-title` 的文本与 `aria-label`。
- 让内容滚动后吸顶标题收缩为小标题，回到顶部后恢复大标题。
- 让未实现的广播与搜索显示占位页（`www/mobile/views/coming.js` 已有），**不出现死链接**：四项导航都有落点。
- 保持导航栈语义与上游一致：进入下一视图入栈、返回出栈、栈空时回到主页；返回按钮只在有历史时可见。
- 让视图重建后的状态处理明确：切换视图时清空 `#m-view` 是当前实现，但**必须**保证模型侧拿到的 ref 与实际可见元素一致（视图重建导致的 ref 失效按 `KUMONE_STALE_REF` 处理，不得静默指向已卸载的元素）。
- 让移动端渲染层不加载上游原版渲染层，结构上排除「两套渲染同时写同一个容器」的冲突。
- 为导航栈语义补一组 Node 自测：入栈、出栈、栈空回主页、切根视图清栈、`#view` 深链进入。

## 明确不做什么

- 不实现广播与搜索的真实功能，本轮只做占位页（spec 的 Deferred 条目）。
- 不在本 ticket 里实现歌单详情、专辑详情、歌手详情等二级视图，它们属 ticket 08/10。
- 不在导航栈里引入新的路由语义（如查询参数、嵌套路由），保持与上游一致。
- 不在底部导航引入任何品牌色或额外图标风格；选中态只用重墨与强描边。

## Acceptance

- [ ] 依次点击底部导航「主页 / 广播 / 资料库 / 搜索」，确认每次 `#m-view` 内容都变成对应视图，且当前项的 `aria-current="page"` 唯一。
- [ ] 在「主页」「资料库」之间来回切换，确认每页顶部的 `#m-title` 文本与当前页一致（主页 / 资料库 / 广播 / 搜索）。
- [ ] 在主页向下滚动超过 12px，确认 `#m-header` 出现 `.compact` 类、顶栏小标题可见；滚回 `scrollTop = 0` 确认恢复大标题。
- [ ] 点击「广播」与「搜索」，确认显示占位页文案而非空白页，也没有任何指向不存在功能的链接。
- [ ] 从主页进入一个二级视图，确认返回按钮出现；点击返回回到主页且返回按钮消失（栈空）。
- [ ] 在栈空时触发一次 `M.back()`，确认当前视图仍是主页，不出现空白页。
- [ ] 打开 `www/index.html#library` 与 `www/index.html#home`，确认分别直接进入资料库与主页，且导航历史栈为空。
- [ ] 在同一页内再次点击当前导航项，确认页面滚动回顶部而不是重新入栈。
- [ ] 执行导航栈自测脚本，确认入栈 / 出栈 / 栈空回主页 / 切根清栈 / 深链五条断言全部 PASS。
- [ ] 执行 `npm test` 与 `npm run test:live`，确认均保持通过。

## Comments

本 ticket 的骨架比其它 ticket 完整 —— 导航与吸顶标题的 DOM 与样式都已存在（`www/mobile/core/shell.js`、`www/mobile/css/shell.css:139-175`），**缺的是接线与验证**，不是从零做。

一个与 ADR-0003 直接相关、动手时容易忽略的点：`www/mobile/core/router.js:52-58` 的 `M.render()` 每次清空并重建 `#m-view`，所以**每个 DOM 元素的新生命都是一次新的 ref**。这不是 bug —— `www/mobile/core/snapshot.js:39-53` 正是用 `el.isConnected` 判定 ref 过期并给出 `KUMONE_STALE_REF` 与「重新取一次快照」的下一步动作。但前提是**界面不得让模型拿着旧 ref 继续操作**：旧 ref 必须明确报 stale，而不是静默失败或指向新元素。ticket 12 会把这条写成验收。

另外 `sync()` 的 `playlist` / `album` / `artist` → `home` 回落（`www/mobile/core/shell.js:93`）是**为尚未实现的二级视图预留**的，等 ticket 08/10 注册这些视图后要回来核对：那时应该回落到「资料库」还是「主页」，取决于二级视图的来源，动手时确认一下。
