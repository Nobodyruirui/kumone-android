// 回归测试：扫码登录状态机（ticket 06）。
//
//   node test/login.test.mjs
//
// 用**假服务层**注入固定返回，不打真网络。断言六条主线：
//   1. 获取二维码  —— 拿到 unikey 与图片后停在「等待扫码」
//   2. 状态推进    —— 801 等待 / 802 已扫码 / 803 登录成功
//   3. 过期刷新    —— 800 过期后 refresh() 回到「等待扫码」并换新码
//   4. 成功恢复    —— 803 之后停在 success，可以送回原处
//   5. 过期重扫    —— 过期 → 刷新 → 成功，一条龙走通
//   6. 网络抖动    —— 查询失败不判死，留在原阶段等下一拍
//
// 退出码：0 通过；1 不通过。

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createMachine, PHASES, CHECK_CODES } = require('../www/mobile/core/login.js');

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log(`PASS - ${name}`);
  else { failed++; console.log(`FAIL - ${name}${extra ? ' :: ' + extra : ''}`); }
}

/** 假服务层：每个方法可以给固定返回或一个函数。 */
function fakeService(handlers) {
  const calls = [];
  const svc = { calls };
  ['qrKey', 'qrImage', 'qrCheck'].forEach((fn) => {
    svc[fn] = (arg) => {
      calls.push({ fn, arg });
      const h = handlers[fn];
      if (!h) return Promise.resolve({ ok: false, error: '未预设的 ' + fn, code: 'KUMONE_NETWORK' });
      return Promise.resolve(typeof h === 'function' ? h(arg) : h);
    };
  });
  return svc;
}

/* --------------------------------------------- 1. 获取二维码 */

{
  let keyN = 0;
  const svc = fakeService({
    qrKey: () => ({ ok: true, data: 'unikey-' + (++keyN) }),
    qrImage: (text) => ({ ok: true, data: 'data:image/png;base64,' + Buffer.from(text).toString('base64') })
  });
  const m = createMachine({ service: svc });
  const snap = await m.start();

  check('取到二维码后停在 waiting', snap.phase === 'waiting', snap.phase);
  check('拿到 unikey', snap.unikey === 'unikey-1', String(snap.unikey));
  check('拿到二维码图片', typeof snap.image === 'string' && snap.image.indexOf('data:image/png') === 0);
  check('二维码图片里带的是登录地址',
    Buffer.from(snap.image.split(',')[1], 'base64').toString().indexOf('music.163.com/login?codekey=') >= 0);
  check('waiting 的中文标签是「等待扫码」', PHASES.waiting === '等待扫码');
}

/* --------------------------------------------- 1b. 取二维码失败 */

{
  const svc = fakeService({
    qrKey: () => ({ ok: false, code: 'KUMONE_NETWORK', message: '断了' })
  });
  const m = createMachine({ service: svc });
  const snap = await m.start();
  check('拿不到 unikey 时进 error 而不是干等', snap.phase === 'error', snap.phase);
  check('error 态带上了契约错误', !!(snap.error && snap.error.code === 'KUMONE_NETWORK'));
}

/* --------------------------------------------- 2. 状态推进 */

{
  const svc = fakeService({
    qrKey: () => ({ ok: true, data: 'uk' }),
    qrImage: () => ({ ok: true, data: 'img' }),
    qrCheck: () => ({ ok: true, data: { code: 801, message: '等待扫码' } })
  });
  const m = createMachine({ service: svc });
  await m.start();
  const snap = await m.tick();
  check('801 仍然是 waiting', snap.phase === 'waiting', snap.phase);
}

{
  const svc = fakeService({
    qrKey: () => ({ ok: true, data: 'uk' }),
    qrImage: () => ({ ok: true, data: 'img' }),
    qrCheck: () => ({ ok: true, data: { code: 802, message: '扫码待确认' } })
  });
  const m = createMachine({ service: svc });
  await m.start();
  const snap = await m.tick();
  check('802 进 scanned', snap.phase === 'scanned', snap.phase);
  check('scanned 的中文标签是「已扫码，请在手机上确认」', PHASES.scanned === '已扫码，请在手机上确认');
}

/* --------------------------------------------- 3. 过期刷新 */

{
  let keyN = 0;
  const svc = fakeService({
    qrKey: () => ({ ok: true, data: 'uk-' + (++keyN) }),
    qrImage: () => ({ ok: true, data: 'img-' + keyN }),
    qrCheck: () => ({ ok: true, data: { code: 800, message: '二维码已过期' } })
  });
  const m = createMachine({ service: svc });
  await m.start();
  const expired = await m.tick();
  check('800 进 expired', expired.phase === 'expired', expired.phase);

  const again = await m.refresh();
  check('刷新后回到 waiting', again.phase === 'waiting', again.phase);
  check('刷新后换了新的 unikey', again.unikey === 'uk-2', String(again.unikey));
}

/* --------------------------------------------- 4. 成功恢复 */

{
  const svc = fakeService({
    qrKey: () => ({ ok: true, data: 'uk' }),
    qrImage: () => ({ ok: true, data: 'img' }),
    qrCheck: () => ({ ok: true, data: { code: 803, message: '登录成功' } })
  });
  const m = createMachine({ service: svc });
  await m.start();
  const snap = await m.tick();
  check('803 进 success', snap.phase === 'success', snap.phase);
  check('success 的中文标签是「登录成功」', PHASES.success === '登录成功');
  check('成功后没有残留错误', !snap.error);
}

/* --------------------------------------------- 5. 过期重扫一条龙 */

{
  let keyN = 0;
  let checkCode = 800;
  const svc = fakeService({
    qrKey: () => ({ ok: true, data: 'uk-' + (++keyN) }),
    qrImage: () => ({ ok: true, data: 'img' }),
    qrCheck: () => ({ ok: true, data: { code: checkCode, message: '' } })
  });
  const m = createMachine({ service: svc });
  await m.start();
  check('第一次扫码：过期', (await m.tick()).phase === 'expired');
  check('刷新后重新等待', (await m.refresh()).phase === 'waiting');
  checkCode = 803;
  check('重扫后成功', (await m.tick()).phase === 'success');
  check('整条链路只取了两次 unikey', keyN === 2, String(keyN));
}

/* --------------------------------------------- 6. 网络抖动不判死 */

{
  const svc = fakeService({
    qrKey: () => ({ ok: true, data: 'uk' }),
    qrImage: () => ({ ok: true, data: 'img' }),
    qrCheck: () => ({ ok: false, code: 'KUMONE_NETWORK', message: '抖了一下' })
  });
  const m = createMachine({ service: svc });
  await m.start();
  const snap = await m.tick();
  check('查询失败时留在 waiting，不进 error', snap.phase === 'waiting', snap.phase);
  check('但把错误记下来了', !!(snap.error && snap.error.code === 'KUMONE_NETWORK'));
}

/* --------------------------------------------- 7. 码表 */

{
  check('扫码返回码映射齐全',
    CHECK_CODES[800] === 'expired' && CHECK_CODES[801] === 'waiting' &&
    CHECK_CODES[802] === 'scanned' && CHECK_CODES[803] === 'success');
  check('每个阶段都有中文标签',
    Object.keys(PHASES).every((k) => typeof PHASES[k] === 'string' && PHASES[k].length > 0));
}

console.log(failed ? `\nLOGIN: ${failed} 条断言失败` : '\nLOGIN: ALL PASS ✔');
process.exit(failed ? 1 : 0);
