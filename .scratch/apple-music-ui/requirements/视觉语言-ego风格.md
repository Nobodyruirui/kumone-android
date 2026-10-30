# 视觉语言：ego 风格

> 载体：`.scratch/apple-music-ui/requirements/视觉语言-ego风格.md`
> 决策依据：`docs/adr/0003-双模态界面与ego视觉语言.md`（视觉语言表 / Consequences）
> 理论来源：`docs/ego-lite-UI设计理论.md`（§2 视觉语言：三个隐喻 / §3 准则 1、7）
> 对应 ticket：`.scratch/apple-music-ui/issues/02-design-tokens-and-base-styles.md`

## 1. 现状与缺口

- 视觉基线**已经切换完成**：设计令牌集中在 `www/mobile/css/tokens.css:37-95`，取值为 ego 风格 —— 白底画布 `--canvas: #f4f4f6`（`:46`）、卡片面 `--surface: #ffffff`（`:47`）、次级面 `--surface-2: #fafafa`（`:48`）、常规描边 `--line: #e3e3e7`（`:42`）、强描边 `--line-strong: #0a0a0a`（`:43`）、文字三档 `--ink` / `--ink-2` / `--ink-3`（`:39-41`）、按压态 `--wash`（`:49`）。
- 圆角与尺寸已成体系：卡片 16px、小件 10px、超椭圆图标 22%、大圆角色块 28%（`:70-74`）；顶栏 46px / 导航 56px / 迷你条 60px 与安全区变量（`:77-81`）。
- 角色色已落地且「颜色即角色」：策展橙 `#f2c489`、我的黄 `#f5dea9`、自动蓝 `#a9cbe8`、工具粉 `#f3c3c0`、中性灰 `#dcdcdc`（`:54-58`），并在 `www/mobile/css/shell.css:308-318` 建立了 `[data-role]` 到角色色的映射，在 `www/mobile/views/library.js:8-12` 用 `data-role` 标注了资料库五个入口的角色。
- 字重对比已落地：主字 800 / 700（`--fw-display` / `--fw-title`，`:61-62`）、副标 300 斜体（`--fs-note: 13px` + `--fw-note: 300`，`:66`），并在 `www/mobile/css/shell.css:129-135` 的 `.m-section-note` 上以 `font-style: italic` 呈现。
- 外壳四构件已成型：吸顶栏 `#m-header`（`shell.css:56`）、内容大标题 `.m-display`（`:110`）、区块标题 `.m-section-title`（`:123`）、底部导航 `#m-nav`（`:139`，当前项用重墨 `--ink` + 字重 700，见 `:173-174`，**不引入颜色**）、迷你播放条 `#m-mini`（`:179`，白卡面 + 1px `var(--line-strong)` 黑描边 + `--radius-card`，`:190-193`）、极细进度线（`:198-210`，填充为重墨 `--ink`）、吐司 `.m-toast`（`:370`）。
- **卡片本体已补齐**：`.m-card`（`shell.css:299-305`）定义了白面 + 1px 描边 + `--radius-card` + `--shadow-card` + padding，角色色变体只改背景色（`:308-318`）—— 令牌里的 `--shadow-card`（`tokens.css:84`）因此有了消费方。
- **状态栏色已同步**：`www/index.html:8` 的 `<meta name="theme-color">` 已是 `#f4f4f6`，与画布一致，真机状态栏不再压出黑边。
- **具体缺口一**：**语义契约的自动检查只覆盖 `button`**。`test/guard-design.mjs:100-108` 的正则只匹配 `createElement('button')` / `el('button')`；`link`、`tab` 等可交互元素的 `aria-label` 缺失不会被拦下。而 ADR-0003 §2 的要求是「可交互元素一律用语义标签并带 `aria-label`」。
- **具体缺口二**：**裸 CSS 选择器仍然存在，且没有任何闸门拦住**。`www/mobile/core/shell.js:94` 的 `document.querySelectorAll('#m-nav .m-tab')` 与 `:127` 的 `document.querySelector('#m-mini-line > i')` 属于「实现内部面」（外壳操作自身 DOM）—— 按 ego 规则应当允许，但**规则本身没有划边界，也没有登记机制**（ADR-0003 §2 只写了「禁止裸 CSS 选择器与硬编码坐标」，没写边界）。
- **具体缺口三**：**字体只有一个字重轴，且无回退层级测试**。`www/mobile/css/tokens.css:14-35` 声明了 Inter 可变字重 400–800 的正常体与 300–500 的斜体变体，`unicode-range` 覆盖拉丁与数字（`:21-23`、`:32-34`），中文交给系统字体 —— 「拉丁优先、中文回退」已成立；但不同安卓机型的中文字形差异无记录。
- **具体缺口四**：**「视图层不得硬编码」只是一句注释**。`www/mobile/css/tokens.css:11` 写着这条规则，但**没有执行器**，该规则当前靠人自觉（构建期自测归 ticket 14）。

## 2. 要求

- 让设计令牌集中保持在 `www/mobile/css/tokens.css` 一处：画布、卡片面、次级面、常规描边、强描边、文字三档、角色色、字号与字重、圆角、尺寸与安全区、阴影、字体栈、动效。
- 让视图层不出现硬编码的颜色、字号与圆角，一律引用 `var(--*)` 令牌；这条规则从注释升级为构建期失败项。
- 让界面呈现 ego 视觉语言：白底画布、1px 描边、大圆角卡片、克制单色系、粗体主字配细斜体副标。
- 让**品牌红 `#fa2d48` 不再使用**：导航选中态与强调一律用重墨 `--ink` 与强描边 `--line-strong` 表达；这是 ego 风格与 Apple Music 风格的分界。
- 让「颜色即角色」成立：策展=橙、我的=黄、自动=蓝、工具=粉、中性=灰；一个颜色只承载一种含义；新增区块必须先确定其角色色，不允许引入新颜色。
- 让字体保持打包进安装包的 Inter 可变字重拉丁子集（含斜体变体），中文回退到系统字体，声明顺序拉丁优先，字体不依赖网络。
- 保持 `www/index.html:8` 的 `theme-color` 与画布一致（`#f4f4f6`），不可回退。
- 保持 `.m-card` 本体与角色色变体的分层（形状与描边继承本体，颜色只改背景），使新增区块有可依附的载体。
- 让底部导航选中态用重墨与字重对比表达（**不用颜色**），并保持 `aria-current="page"` 标记。
- 让迷你播放条用「白卡 + 1px 黑描边 + 大圆角 + 极细重墨进度线」呈现播放状态，**不用品牌红**。
- 让内容区的区块标题走「粗体主标 + 细斜体副标」的组合（沿用 `.m-section-title` / `.m-section-note` 的既有写法）。
- 让 ego 白底成为唯一主题（深色变体为 Deferred，见 spec 的 D4）。
- 把语义契约的自动检查从「只查 button」扩展到全部可交互元素（`link` / `tab` / `switch` 等），并划清「模型定位面」与「实现内部面」的边界。

## 3. 明确不做什么

- 不做深色主题，也不做跟随系统明暗（spec 的 Deferred D4）。
- 不引入品牌红或任何新的品牌色；新颜色只能作为**角色色**引入，且必须先说明它承载什么含义。
- 不在 `www/mobile/css/` 之外新增样式文件；令牌与外壳各一处，不散落。
- 不把阴影做成装饰性效果：阴影预算只有 `--shadow-card` 与 `--shadow-pop` 两级，超出即视为新增视觉语言。
- 不在内容区组件（主页卡片、资料库列表、歌单详情）里实现数据逻辑，那是 ticket 08 / 10 的范围。
- 不在闸门里禁止实现内部的一切选择器 —— 那会让规则不可执行；只禁模型定位面。

## 4. Acceptance

- [ ] 打开 `www/index.html`，确认画布为浅灰白（`#f4f4f6`）、卡片面纯白并带 1px 浅灰描边，**不是**纯黑底 + 深灰面板。
- [ ] 确认 `www/index.html` 源码中 `theme-color` 的值为 `#f4f4f6`，且真机状态栏与画布同色、无黑边。
- [ ] 在 `www/mobile/css/` 全目录检索 `#fa2d48`、`#FA243C`、`brand` 等品牌红取值，确认**无命中**（`www/mobile/reference/` 下的对照件除外）。
- [ ] 在 DevTools 取底部导航当前项的 `color` 与 `font-weight`，确认是重墨 `--ink` 与 700 字重、**不是红色**；且该按钮带 `aria-current="page"`。
- [ ] 确认迷你播放条是白卡面 + 1px 黑描边 + 16px 圆角，顶部 2px 进度线填充色为重墨 `--ink`（不是红色）。
- [ ] 确认区块标题是粗体主标 + 300 斜体副标，且副标颜色为 `--ink-2`。
- [ ] 确认资料库五个入口的 `data-role` 分别是 `owned` / `owned` / `neutral` / `auto` / `curated`，且渲染出的点色与令牌里的角色色一致，**没有任何第五种颜色**。
- [ ] 确认 `.m-card` 有本体规则（圆角 / 描边 / padding / 阴影），五个 `[data-role]` 变体只改背景色、不重复定义形状。
- [ ] 检索 `www/mobile/views/*.js` 与 `www/mobile/core/shell.js`，确认没有硬编码的十六进制颜色字面量（角色色与令牌值除外）。
- [ ] 在 Network 面板确认字体请求全部本地命中 `mobile/fonts/inter-latin-var.woff2` 等，无外网字体请求。
- [ ] 确认中文确实回退到系统字体（DevTools Computed 里中文字符的 `font-family` 落到 `PingFang SC` / `Noto Sans CJK SC` / `Microsoft YaHei` / `system-ui` 之一）。
- [ ] 确认语义契约的自动检查已覆盖 `link` / `tab` 等非 button 的可交互元素：故意去掉一个 link 的 `aria-label`，确认自测失败并指出位置（反向验证检测器有效）。

## 附：证据索引

| 结论 | 证据 |
| --- | --- |
| 视觉基线（白底 / 描边 / 角色色 / 字重对比） | `docs/adr/0003-双模态界面与ego视觉语言.md` 视觉语言表 |
| 品牌红不再使用 | `docs/adr/0003-双模态界面与ego视觉语言.md`（品牌红段落） |
| 令牌集中与「禁硬编码」规则 | `www/mobile/css/tokens.css:11`、`:37-95` |
| 画布 / 卡片面 / 描边 / 文字三档 | `www/mobile/css/tokens.css:39-49` |
| 五个角色色 | `www/mobile/css/tokens.css:51-58` |
| 字号与字重（含 300 斜体副标） | `www/mobile/css/tokens.css:60-67` |
| 圆角 / 尺寸 / 安全区 | `www/mobile/css/tokens.css:69-81` |
| 阴影两级预算 | `www/mobile/css/tokens.css:83-85` |
| 字体声明与拉丁优先 | `www/mobile/css/tokens.css:14-35`、`:88-90` |
| 卡片本体与角色色分层 | `www/mobile/css/shell.css:299-305`、`:308-318` |
| 角色色 → `[data-role]` 映射 | `www/mobile/css/shell.css:309-318` |
| 资料库入口的角色标注 | `www/mobile/views/library.js:8-12` |
| 底部导航选中态用重墨不用颜色 | `www/mobile/css/shell.css:163-164`、`:173-174` |
| 迷你播放条的黑描边与极细进度线 | `www/mobile/css/shell.css:190-193`、`:198-210` |
| 粗体主标 + 细斜体副标 | `www/mobile/css/shell.css:123-135` |
| `theme-color` 已同步 | `www/index.html:8` |
| 品牌红仅存于对照件 | `www/mobile/reference/legacy-desktop-theme.css:21` |
| 语义契约闸只覆盖 button | `test/guard-design.mjs:100-108` |
| 裸选择器现状（实现内部面） | `www/mobile/core/shell.js:94`、`:127` |
