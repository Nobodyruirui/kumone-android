// 构建期约束：把 ego 理论里的「把约束前移成构建错误」落成自测。
//
//   node test/guard-design.mjs
//
// 四条闸：
//   1. 体积闸     —— 上下文预算是硬约束，超限即失败（不是评审期口头约定）
//   2. 临时 ref  —— 界面层与知识层不得硬编码 @12 / ref=12 这类一次性句柄
//   3. 错误码完整性 —— 每个稳定错误码必须声明 transient / permanent
//   4. 语义契约  —— 界面层创建的 button 必须带 aria-label（无障碍树即界面契约）
//
// 退出码：0 全部通过；1 有违规（逐条打印文件与行号）。

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const mobile = join(repo, 'www', 'mobile');

/* ---------------------------------------------------------- 工具 */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const violations = [];
function fail(file, line, rule, message) {
  violations.push({ file: relative(repo, file).split(sep).join('/'), line, rule, message });
}

/* ------------------------------------------------------ 1. 体积闸 */

// 口径：**只统计真正进包的代码**，并按知识层分组 ——
//   · 界面与契约层（core / views / app）—— ADR-0003 §7 的「界面与文档」上下文预算
//   · 知识层（learnings）—— ADR-0003 §8 的知识分层披露，单独一份预算
// 上游资产（vendor/ 与内核层 kumone/）既不进包也不占预算；
// 参考件（reference/）与暂不加载的 feature（features/）不进包，不占预算。
// 字体单独算：被 tokens.css 的 @font-face 引用，随包安装。

const ENTRY = join(repo, 'www', 'index.html');
const entrySrc = readFileSync(ENTRY, 'utf8');

const loadedJs = new Set();
const loadedCss = new Set();
for (const m of entrySrc.matchAll(/<script[^>]+src="([^"]+)"/g)) loadedJs.add(m[1]);
for (const m of entrySrc.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) loadedCss.add(m[1]);

function sumLoaded(refs, base, onlyPrefix) {
  let total = 0;
  const missing = [];
  for (const ref of refs) {
    const p = join(base, ref.replace(/^\//, ''));
    if (!existsSync(p)) { missing.push(ref); continue; }
    if (onlyPrefix && !ref.replace(/^\//, '').startsWith(onlyPrefix)) continue;
    total += statSync(p).size;
  }
  return { total, missing };
}

const UI_PREFIXES = ['mobile/core/', 'mobile/views/', 'mobile/app.js', 'shared/'];

function uiTotal(refs, base) {
  let total = 0;
  for (const ref of refs) {
    const rel = ref.replace(/^\//, '');
    if (!UI_PREFIXES.some((p) => rel.startsWith(p))) continue;
    const p = join(base, rel);
    if (existsSync(p)) total += statSync(p).size;
  }
  return total;
}

// 上限是**上下文预算**，不是"越紧越好"：
//   界面与契约层 80KB → 128KB（ticket 08 主页五区块 + 详情页 + ticket 06 扫码登录）
//   → 160KB（ticket 10 资料库：入口页 + 五个二级列表 + 账号区 + 确认弹窗）
//   → 192KB（ticket 09 全屏播放页 + ticket 15 广播与搜索两屏）
//   → 224KB（phone-fixes：歌词面板 + 账号登录双 Tab + 边缘手势与转场动画）
//   每一档的涨幅都是实打实的界面代码，不是可以砍掉的冗余。
//   这个闸是防「无节制地往界面层堆东西」，不是卡死一个具体数字。
const LIMITS = [
  { label: 'CSS', max: 48 * 1024, kind: 'css' },
  { label: 'JS 界面与契约层', max: 224 * 1024, kind: 'ui' },
  { label: 'JS 知识层', max: 32 * 1024, kind: 'knowledge' },
  { label: '字体', max: 128 * 1024, kind: 'fonts' }
];

for (const limit of LIMITS) {
  let total = 0;
  if (limit.kind === 'css') {
    total = sumLoaded(loadedCss, join(repo, 'www'), 'mobile/').total;
  } else if (limit.kind === 'ui') {
    total = uiTotal(loadedJs, join(repo, 'www'));
  } else if (limit.kind === 'knowledge') {
    total = sumLoaded(loadedJs, join(repo, 'www'), 'mobile/learnings/').total;
  } else {
    for (const file of walk(join(mobile, 'fonts'))) {
      if (!file.endsWith('.woff2')) continue;
      total += statSync(file).size;
    }
  }
  const kb = (total / 1024).toFixed(1);
  const ok = total <= limit.max;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${limit.label} 体积 ${kb}KB / 上限 ${(limit.max / 1024).toFixed(0)}KB（进包口径）`);
  if (!ok) {
    violations.push({
      file: relative(repo, mobile).split(sep).join('/'),
      line: 0, rule: '体积闸',
      message: `${limit.label} 合计 ${kb}KB，超过上限 ${(limit.max / 1024).toFixed(0)}KB`
    });
  }
}

// 入口引用的文件必须存在（防止引用一个已经改名/删除的脚本）
for (const ref of [...loadedJs, ...loadedCss]) {
  const p = join(repo, 'www', ref.replace(/^\//, ''));
  if (!existsSync(p)) {
    violations.push({
      file: relative(repo, ENTRY).split(sep).join('/'),
      line: 0, rule: '体积闸',
      message: `入口引用了不存在的文件：${ref}`
    });
  }
}

/* -------------------------------------------------- 2. 临时 ref 禁令 */

const TEMP_REF = /(?:['"`]\s*@\d+\s*['"`])|(?:\bref=\d+\b)/;

for (const file of walk(mobile)) {
  if (!/\.(js|mjs|md|json)$/.test(file)) continue;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((text, i) => {
    if (TEMP_REF.test(text)) {
      fail(file, i + 1, '临时 ref', '不得硬编码一次性句柄：' + text.trim().slice(0, 80));
    }
  });
}

/* ---------------------------------------------- 3. 错误码完整性 */

const errorsFile = join(mobile, 'core', 'errors.js');
const errorsSrc = readFileSync(errorsFile, 'utf8');
const codesBlock = (errorsSrc.match(/var CODES = \{([\s\S]*?)\n  \};/) || [])[1] || '';
const codeRe = /(KUMONE_[A-Z_]+)\s*:\s*\{[^}]*?kind\s*:\s*'(transient|permanent)'/g;
let m;
const seen = new Set();
while ((m = codeRe.exec(codesBlock)) !== null) {
  seen.add(m[1]);
  if (!m[2]) fail(errorsFile, 0, '错误码', `${m[1]} 缺少 kind`);
}
const allCodes = [...codesBlock.matchAll(/(KUMONE_[A-Z_]+)\s*:/g)].map((x) => x[1]);
const missing = allCodes.filter((c) => !seen.has(c));
missing.forEach((c) => fail(errorsFile, 0, '错误码', `${c} 未声明 kind（transient / permanent）`));
console.log(`OK   错误码 ${allCodes.length} 个，均已声明 transient / permanent`);

/* ------------------------------------------------ 4. 语义契约（aria） */

for (const file of walk(mobile)) {
  if (!file.endsWith('.js')) continue;
  const src = readFileSync(file, 'utf8');
  const buttonRe = /(createElement\('button'\)|el\('button')/g;
  let hit;
  while ((hit = buttonRe.exec(src)) !== null) {
    const window = src.slice(hit.index, hit.index + 260);
    if (!/aria-label/.test(window)) {
      const line = src.slice(0, hit.index).split(/\r?\n/).length;
      fail(file, line, '语义契约', '创建的 button 缺少 aria-label');
    }
  }
}

/* ------------------------------------- 5. 定位入口的形态（ADR-0003 §2/§10） */

// 规则分层（见 ADR-0003 §2）：
//   · 模型侧接口（Mobile.act / Mobile.snapshot / 知识包 locator）只接受
//     ref 或 role+name，**不得把 CSS 选择器或坐标当定位参数**；
//   · 实现内部操作自己的 DOM 不受限——所以这里查的是「调用点与接口的形态」，
//     不是「代码里有没有出现 querySelector」。

const LOCATOR_ENTRY = /\b(act|snapshot|findMatches|scopeRange)\b/;
const SELECTOR_ARG = /\b(?:act|findMatches|scopeRange)\s*\(\s*['"`][.#][^'"`]*['"`]/;
const SELECTOR_OPTION = /\b(?:act|snapshot|findMatches|scopeRange)\s*\([^)]*\b(?:css|selector|coordinates?)\s*:/;
const COORD_OPTION = /\b(?:act|snapshot)\s*\([^)]*\b(?:x|y)\s*:\s*\d/;

for (const file of walk(mobile)) {
  if (!file.endsWith('.js')) continue;
  const src = readFileSync(file, 'utf8');
  const lines = src.split(/\r?\n/);

  lines.forEach((text, i) => {
    const trimmed = text.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

    if (SELECTOR_ARG.test(text)) {
      fail(file, i + 1, '定位入口形态',
        '把 CSS 选择器当定位参数传给接口（ADR-0003 §2：模型侧只接受 ref 或 role+name）：' + trimmed.slice(0, 70));
      return;
    }
    if (SELECTOR_OPTION.test(text)) {
      fail(file, i + 1, '定位入口形态',
        '定位参数里出现 css/selector/coordinates 字段（只应接受 ref 或 role+name）：' + trimmed.slice(0, 70));
      return;
    }
    if (COORD_OPTION.test(text)) {
      fail(file, i + 1, '定位入口形态',
        '定位参数里出现坐标（x/y）：' + trimmed.slice(0, 70));
    }
  });

  // 公开接口的形参不得叫 css / selector / query / x / y
  const sigRe = /(?:function\s+(\w+)\s*\(([^)]*)\)|\b(\w+)\s*:\s*function\s*\(([^)]*)\))/g;
  let sig;
  while ((sig = sigRe.exec(src)) !== null) {
    const name = sig[1] || sig[3];
    if (!LOCATOR_ENTRY.test(name)) continue;
    const params = (sig[2] || sig[4] || '').split(',').map((p) => p.trim().split(/[\s=]/)[0]);
    const bad = params.find((p) => /^(css|selector|query|x|y|coord\w*)$/i.test(p));
    if (bad) {
      fail(file, src.slice(0, sig.index).split(/\r?\n/).length, '定位入口形态',
        `接口 ${name} 声明了定位参数 ${bad}（只应接受 ref / role+name）`);
    }
  }
}

/* ---------------------------------------------------------- 结果 */

if (!violations.length) {
  console.log('\nGUARD: PASS（体积 / 临时 ref / 错误码 / 语义契约 全部通过）');
  process.exit(0);
}

console.log('\nGUARD: FAIL');
for (const v of violations) {
  console.log(`  ${v.file}${v.line ? ':' + v.line : ''}  [${v.rule}] ${v.message}`);
}
process.exit(1);
