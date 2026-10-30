/* 知识包校验器：把「知识包里的硬约束」变成构建期错误。
 *
 * 规则（来自 ego-lite 的 L5 指令层：知识必须是可执行的制品，不是散文）：
 *   1. 知识包里禁止出现临时引用（快照里的短标识）——界面一重建就失效。
 *   2. 每个知识包必须有可解析的 manifest.json，声明的工具文件必须存在。
 *   3. 校验器会真的加载工具模块，检查导出的每个函数都是可调用的异步函数。
 *   4. **码表对齐**：知识包里自持的错误码副本必须与权威码表
 *      （www/mobile/core/errors.js 的 CODES）对齐 —— 码必须存在，
 *      且知识包 locator 的标题必须与权威表逐字相同。
 *      知识包要保持"可独立拷走"，所以它自持一份；代价是可能漂移，
 *      这条规则就是漂移的刹车。
 *
 * 用法：
 *   node test/validate-learnings.mjs
 *
 * 通过时打印知识包与工具清单并以 0 退出；任何一条不满足则报出位置并以 1 退出。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PACKS_DIR = path.join(ROOT, 'www', 'mobile', 'learnings');

const require = createRequire(import.meta.url);

/* 临时引用：@12 / ref=12 这类一次性的观测标识 */
const FORBIDDEN = /(?:@\d+\b|\bref=\d+\b)/;
const SCAN_EXT = new Set(['.js', '.md', '.json']);

const problems = [];
const notes = [];

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function fail(message) {
  problems.push(message);
}

/* ------------------------------------------------------- 扫描 */

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function scanForForbiddenRefs(files) {
  let hits = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = FORBIDDEN.exec(lines[i]);
      if (!m) continue;
      hits += 1;
      fail(`临时引用 ${JSON.stringify(m[0])} 出现在 ${rel(file)}:${i + 1}  —— ${lines[i].trim()}`);
    }
  }
  return hits;
}

/* ------------------------------------------------------- 加载工具模块 */

function loadModule(file) {
  try {
    return { ok: true, exports: require(file) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function isAsyncFunction(fn) {
  return typeof fn === 'function' && fn.constructor && fn.constructor.name === 'AsyncFunction';
}

/** 检查一个模块的导出：每个导出都必须是函数；严格模式下还必须是异步函数。 */
function checkExports(label, exports, strict) {
  const names = Object.keys(exports || {});
  if (!names.length) {
    fail(`${label} 没有导出任何东西`);
    return [];
  }
  const usable = [];
  for (const name of names) {
    const value = exports[name];
    if (typeof value !== 'function') {
      fail(`${label} 的导出 ${JSON.stringify(name)} 不是函数（实际类型 ${typeof value}）`);
      continue;
    }
    if (strict && !isAsyncFunction(value)) {
      fail(`${label} 的导出 ${JSON.stringify(name)} 不是异步函数`);
      continue;
    }
    usable.push(name);
  }
  return usable;
}

/** 真的调用一次，确认函数可调用、返回 Promise、且结果是个结构化对象。 */
async function smokeCall(label, name, fn) {
  let promise;
  try {
    promise = fn();
  } catch (e) {
    fail(`${label} 的导出 ${JSON.stringify(name)} 调用时抛出异常：${e.message}`);
    return null;
  }
  if (!promise || typeof promise.then !== 'function') {
    fail(`${label} 的导出 ${JSON.stringify(name)} 没有返回 Promise`);
    return null;
  }
  let value;
  try {
    value = await promise;
  } catch (e) {
    fail(`${label} 的导出 ${JSON.stringify(name)} 的 Promise 被拒绝：${e.message}`);
    return null;
  }
  if (!value || typeof value !== 'object' || typeof value.ok !== 'boolean') {
    fail(`${label} 的导出 ${JSON.stringify(name)} 没有返回带 ok 字段的结构化结果`);
    return null;
  }
  return value;
}

/* -------------------------------------------------- 码表对齐（权威 vs 副本） */

const AUTHORITATIVE_ERRORS = path.join(ROOT, 'www', 'mobile', 'core', 'errors.js');

/** 权威码表：{ code: { kind, title } }。取不到就返回 null（不阻断其它检查）。 */
function loadAuthoritativeCodes() {
  try {
    const mod = require(AUTHORITATIVE_ERRORS);
    if (!mod || !mod.CODES) return null;
    return mod.CODES;
  } catch (e) {
    fail(`权威码表加载失败：${rel(AUTHORITATIVE_ERRORS)} —— ${e.message}`);
    return null;
  }
}

/**
 * 从 JS 源码里抽出 TITLES / CODES 这类码表字面量。
 * @returns {Array<{ code, title, file, line }>}
 */
function extractCodeLiterals(file) {
  const src = fs.readFileSync(file, 'utf8');
  const out = [];
  const declRe = /(?:var|const)\s+[A-Z_]*(?:TITLES|CODES)\s*=\s*\{([\s\S]*?)\n\s*\};/g;
  let decl;
  while ((decl = declRe.exec(src)) !== null) {
    const body = decl[1];
    const entryRe = /(KUMONE_[A-Z_]+)\s*:\s*'([^']*)'/g;
    let entry;
    while ((entry = entryRe.exec(body)) !== null) {
      const line = src.slice(0, decl.index + decl[0].indexOf(body) + entry.index).split(/\r?\n/).length;
      out.push({ code: entry[1], title: entry[2], file, line });
    }
  }
  return out;
}

/** 在 JSON 文本里定位某个键的行号（报错要指出行）。 */
function jsonKeyLine(text, key) {
  const re = new RegExp(`"${key}"\\s*:`);
  const m = re.exec(text);
  if (!m) return 0;
  return text.slice(0, m.index).split(/\r?\n/).length;
}

/**
 * 校验知识包里的码表副本与权威表对齐。
 *   · 副本里的码必须在权威表里存在
 *   · locator 的标题必须与权威表逐字相同（标题漂移会让人看到两种说法）
 *   · manifest 的 errorCodes 写的是「什么时候用这个码」，措辞可不同，只校验码在不在
 */
function checkCodeTableAlignment(packDir, manifest, manifestPath) {
  const authoritative = loadAuthoritativeCodes();
  if (!authoritative) return { checked: 0 };

  let checked = 0;

  // 副本一：工具文件里自持的 TITLES
  for (const file of walk(packDir).filter((f) => f.endsWith('.js'))) {
    for (const item of extractCodeLiterals(file)) {
      checked += 1;
      const auth = authoritative[item.code];
      if (!auth) {
        fail(`码表漂移：${rel(item.file)}:${item.line} 的 ${item.code} 不在权威码表 ${rel(AUTHORITATIVE_ERRORS)} 里`);
        continue;
      }
      if (auth.title !== item.title) {
        fail(`码表漂移：${rel(item.file)}:${item.line} 的 ${item.code} 标题是「${item.title}」，` +
          `权威表是「${auth.title}」——同一个错误不能有两种说法`);
      }
    }
  }

  // 副本二：manifest.json 的 errorCodes
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const errorCodes = (manifest && manifest.errorCodes) || {};
  for (const code of Object.keys(errorCodes)) {
    checked += 1;
    if (!authoritative[code]) {
      fail(`码表漂移：${rel(manifestPath)}:${jsonKeyLine(raw, code)} 的 ${code} 不在权威码表 ${rel(AUTHORITATIVE_ERRORS)} 里`);
    }
  }

  return { checked, authoritativeCount: Object.keys(authoritative).length };
}

/* ------------------------------------------- 动作白名单对齐（权威 vs 副本） */

const ACTIONS_SOURCE = path.join(ROOT, 'www', 'mobile', 'core', 'snapshot.js');

/**
 * 权威动作白名单：从 snapshot.js 的 ACTIONS 字面量里取出键。
 * 知识包的 manifest 也声明了一份（要能独立拷走），漂移了就没人知道哪个是真的。
 */
function loadAuthoritativeActions() {
  try {
    const src = fs.readFileSync(ACTIONS_SOURCE, 'utf8');
    const m = src.match(/var\s+ACTIONS\s*=\s*\{([\s\S]*?)\n\s*\};/);
    if (!m) return null;
    const keys = [];
    const re = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*function/g;
    let hit;
    while ((hit = re.exec(m[1])) !== null) keys.push(hit[1]);
    return keys;
  } catch (e) {
    fail(`权威动作白名单读取失败：${rel(ACTIONS_SOURCE)} —— ${e.message}`);
    return null;
  }
}

/** 校验 manifest.locator.actions 与 snapshot.js 的 ACTIONS 一致。 */
function checkActionAlignment(manifest, manifestPath) {
  const authoritative = loadAuthoritativeActions();
  if (!authoritative) return null;
  const declared = (manifest && manifest.locator && manifest.locator.actions) || [];
  const a = [...authoritative].sort().join(',');
  const b = [...declared].sort().join(',');
  if (a !== b) {
    fail(`动作白名单漂移：${rel(manifestPath)} 声明的是 [${b}]，` +
      `而 ${rel(ACTIONS_SOURCE)} 实现的是 [${a}] —— 知识包必须能独立拷走，两处得一致`);
  }
  return { authoritative, declared };
}

/* ------------------------------------------------------- 校验知识包 */

async function validatePack(packDir) {
  const manifestPath = path.join(packDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    fail(`知识包缺少 manifest.json：${rel(packDir)}`);
    return null;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    fail(`manifest.json 解析失败：${rel(manifestPath)} —— ${e.message}`);
    return null;
  }

  for (const field of ['site', 'version', 'tools', 'notes']) {
    if (manifest[field] == null) {
      fail(`manifest.json 缺少字段 ${field}：${rel(manifestPath)}`);
    }
  }
  if (!Array.isArray(manifest.tools)) {
    fail(`manifest.json 的 tools 必须是数组：${rel(manifestPath)}`);
    return manifest;
  }
  if (!Array.isArray(manifest.notes)) {
    fail(`manifest.json 的 notes 必须是数组：${rel(manifestPath)}`);
  }

  const report = {
    dir: packDir,
    site: manifest.site,
    name: manifest.name,
    version: manifest.version,
    tools: [],
    helpers: [],
    notes: []
  };

  // 码表对齐：副本必须与权威表一致
  const codeAlign = checkCodeTableAlignment(packDir, manifest, manifestPath);
  report.codeAlignment = codeAlign;

  // 动作白名单对齐：manifest 声明的必须与 snapshot.js 的 ACTIONS 一致
  const actionAlign = checkActionAlignment(manifest, manifestPath);
  if (actionAlign) {
    report.actionAlignment = actionAlign;
  }

  // notes：声明的文件必须存在
  for (const note of manifest.notes || []) {
    const file = path.join(packDir, note.file);
    if (!fs.existsSync(file)) {
      fail(`notes 文件不存在：${rel(file)}`);
      continue;
    }
    report.notes.push({ file: note.file, title: note.title || note.file });
  }

  // helpers：内部构件，必须能加载且导出的是函数
  for (const helper of manifest.helpers || []) {
    const file = path.join(packDir, helper.file);
    if (!fs.existsSync(file)) {
      fail(`helper 文件不存在：${rel(file)}`);
      continue;
    }
    const loaded = loadModule(file);
    if (!loaded.ok) {
      fail(`helper 加载失败：${rel(file)} —— ${loaded.error.message}`);
      continue;
    }
    const usable = checkExports(`${rel(file)}`, loaded.exports, false);
    report.helpers.push({ name: helper.name || path.basename(helper.file), file: helper.file, exports: usable });
  }

  // tools：必须存在、必须能加载、导出必须是可调用的异步函数
  const loadedFiles = new Map();
  for (const tool of manifest.tools || []) {
    const file = path.join(packDir, tool.file);
    if (!fs.existsSync(file)) {
      fail(`工具文件不存在：${rel(file)}`);
      continue;
    }

    let loaded = loadedFiles.get(tool.file);
    if (!loaded) {
      loaded = loadModule(file);
      loadedFiles.set(tool.file, loaded);
    }
    if (!loaded.ok) {
      fail(`工具加载失败：${rel(file)} —— ${loaded.error.message}`);
      continue;
    }
    const usable = checkExports(`${rel(file)}`, loaded.exports, true);
    if (!usable.length) continue;

    report.tools.push({
      name: tool.name || path.basename(tool.file),
      file: tool.file,
      description: tool.description || '',
      args: tool.args || [],
      exports: usable
    });
  }

  // 真的调一次（在没有 Mobile 的 Node 环境里应当优雅降级，而不是崩掉）
  for (const [relFile, loaded] of loadedFiles) {
    if (!loaded.ok) continue;
    for (const name of Object.keys(loaded.exports)) {
      if (typeof loaded.exports[name] !== 'function') continue;
      const value = await smokeCall(relFile, name, loaded.exports[name]);
      if (value) {
        notes.push(`  · ${name}() 可调用，返回 ${value.ok ? 'ok' : '契约错误 ' + value.code}`);
      }
    }
  }

  return report;
}

/* ------------------------------------------------------- 入口 */

async function main() {
  if (!fs.existsSync(PACKS_DIR)) {
    console.error(`知识包目录不存在：${rel(PACKS_DIR)}`);
    process.exit(1);
  }

  const files = walk(PACKS_DIR).filter((f) => SCAN_EXT.has(path.extname(f).toLowerCase()));
  const hits = scanForForbiddenRefs(files);

  const packDirs = fs
    .readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(PACKS_DIR, e.name))
    .filter((d) => fs.existsSync(path.join(d, 'manifest.json')));

  const reports = [];
  for (const dir of packDirs) {
    const report = await validatePack(dir);
    if (report) reports.push(report);
  }

  if (!packDirs.length) {
    fail(`没有找到任何知识包（${rel(PACKS_DIR)} 下缺少含 manifest.json 的目录）`);
  }

  if (problems.length) {
    console.error('知识包校验失败：\n');
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error(`\n共 ${problems.length} 个问题。`);
    process.exit(1);
  }

  console.log(`知识包校验通过：${reports.length} 个知识包，${files.length} 个文件，临时引用命中 ${hits} 处。\n`);
  for (const report of reports) {
    console.log(`▌${report.name || report.site}（${report.site} v${report.version}）  ${rel(report.dir)}`);
    if (report.codeAlignment && report.codeAlignment.checked) {
      console.log(`  码表  ${report.codeAlignment.checked} 个码已与权威表（${report.codeAlignment.authoritativeCount} 码）对齐`);
    }
    if (report.actionAlignment) {
      console.log(`  动作  白名单 [${report.actionAlignment.authoritative.join(' / ')}] 与实现一致`);
    }
    for (const helper of report.helpers) {
      console.log(`  helper ${helper.name}  ${helper.file}  → ${helper.exports.join(', ')}`);
    }
    for (const tool of report.tools) {
      const args = tool.args.map((a) => `${a.name}${a.required ? '' : '?'}`).join(', ');
      console.log(`  tool   ${tool.name}(${args})  ${tool.file}`);
      console.log(`         ${tool.description}`);
    }
    for (const note of report.notes) {
      console.log(`  note   ${note.title}  ${note.file}`);
    }
    console.log('');
  }
  if (notes.length) {
    console.log('可调用性自检：');
    for (const n of notes) console.log(n);
    console.log('');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(`校验器自身异常：${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
