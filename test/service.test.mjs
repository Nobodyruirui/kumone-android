// 回归测试：移动端服务层（ticket 04）。
//
//   node test/service.test.mjs
//
// 用**假门面**注入固定返回，不打真网络。断言三条主线：
//   1. 归一化：服务层把内核原始结构交给共享归一化层，输出统一形态
//   2. 错误传播：内核失败被翻译成稳定错误码 + 五要素消息，且按码分支（不按文案）
//   3. 登录中断：needLogin 不是普通失败，而是带 resume 信息的打断
//
// 退出码：0 通过；1 不通过。

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createService } = require('../www/mobile/core/service.js');
const errors = require('../www/mobile/core/errors.js');

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log(`PASS - ${name}`);
  else { failed++; console.log(`FAIL - ${name}${extra ? ' :: ' + extra : ''}`); }
}

/** 造一个假门面：按 channel 返回预设结果，并记录调用参数。 */
function fakeFacade(handlers) {
  const calls = [];
  return {
    calls,
    invoke(channel, args) {
      calls.push({ channel, args });
      const h = handlers[channel];
      if (!h) return Promise.resolve({ ok: false, error: '未预设的通道 ' + channel, kind: 'business' });
      return Promise.resolve(typeof h === 'function' ? h(args) : h);
    }
  };
}

/* ------------------------------------------------ 1. 归一化路径 */

const rawSong = { id: 1, name: '曲目', ar: [{ id: 1, name: '甲' }], al: { id: 2, name: '专辑' }, dt: 1000 };
let svc = createService({
  facade: fakeFacade({
    dailyRecommendSongs: { ok: true, data: [rawSong] },
    topArtists: { ok: true, data: [{ id: 3, name: '歌手', picUrl: 'http://p' }] },
    userAccount: { ok: true, data: { userId: 9, nickname: '某人', vipType: 0 } }
  })
});

let r = await svc.dailyRecommend();
check('归一化：每日推荐返回统一形态',
  r.ok && r.data.length === 1 && r.data[0].artists[0].name === '甲' && r.data[0].album.name === '专辑',
  JSON.stringify(r));

r = await svc.topArtists();
check('归一化：推荐歌手返回统一形态', r.ok && r.data[0].name === '歌手' && r.data[0].pic === 'http://p');

r = await svc.account();
check('归一化：账号返回统一形态', r.ok && r.data.userId === 9 && r.data.nickname === '某人');

/* ------------------------------------------------ 2. 错误传播 */

svc = createService({
  facade: fakeFacade({
    dailyRecommendSongs: { ok: false, error: '数据解析失败', kind: 'decoding' },
    toplists: { ok: false, error: '网络错误 (429)', kind: null, httpStatus: 429 },
    userPlaylists: { ok: false, error: '网络错误 (401)', kind: null, httpStatus: 401 },    topArtists: { ok: false, error: '接口错误 (400)', kind: 'business', code: 400 },
    cloudSongs: { ok: false, error: '网络错误 (0)', kind: null }
  })
});

r = await svc.dailyRecommend();
check('错误：decoding → KUMONE_DECODE_FAILED', !r.ok && r.code === 'KUMONE_DECODE_FAILED');
check('错误：decoding 是 transient（可重试）', r.kind === 'transient');
check('错误：消息含五要素 Expected/State/Blocked by/Next',
  /Expected:/.test(r.message) && /State:/.test(r.message) && /Blocked by:/.test(r.message) && /Next:/.test(r.message),
  r.message);
check('错误：retryable 与 kind 一致', errors.retryable(r) === true);

r = await svc.toplists();
check('错误：429 → KUMONE_RATE_LIMITED', !r.ok && r.code === 'KUMONE_RATE_LIMITED' && r.kind === 'transient');

r = await svc.myPlaylists();
check('错误：401 → KUMONE_AUTH_EXPIRED（permanent）', !r.ok && r.code === 'KUMONE_AUTH_EXPIRED' && r.kind === 'permanent');
check('错误：permanent 不可重试', errors.retryable(r) === false);

r = await svc.topArtists();
check('错误：business → KUMONE_BUSINESS_REJECTED（permanent）',
  !r.ok && r.code === 'KUMONE_BUSINESS_REJECTED' && r.kind === 'permanent',
  JSON.stringify(r));
check('错误：业务拒绝的 next 说「不要重试」', /不要重试/.test(r.next || ''), r.next);

r = await svc.cloudSongs();
check('错误：网络失败 → KUMONE_NETWORK（transient）', !r.ok && r.code === 'KUMONE_NETWORK' && r.kind === 'transient');

/* ------------------------------------------ 3. 登录中断 */

svc = createService({
  facade: fakeFacade({
    userPlaylists: { ok: false, error: '需要登录', kind: 'needLogin' }
  })
});
r = await svc.myPlaylists(9);
check('登录中断：needLogin → KUMONE_NEED_LOGIN', !r.ok && r.code === 'KUMONE_NEED_LOGIN');
check('登录中断：带 loginInterrupt 标记', r.loginInterrupt === true);
check('登录中断：带恢复信息（哪个请求被打断）',
  r.resume && r.resume.channel === 'userPlaylists' && r.resume.args.uid === 9,
  JSON.stringify(r.resume));
check('登录中断：kind 为 permanent（不能原地重试）', r.kind === 'permanent');

/* ------------------------------------------ 4. 分层纪律 */

const facade = fakeFacade({});
svc = createService({ facade });
await svc.toplists();
check('分层：只经内核门面调用', facade.calls.length === 1 && facade.calls[0].channel === 'toplists');
check('分层：服务层源码不含 document.', !/document\./.test(require('node:fs').readFileSync(
  new URL('../www/mobile/core/service.js', import.meta.url), 'utf8')));
check('分层：服务层源码不含 window.innerWidth', !/window\.innerWidth/.test(require('node:fs').readFileSync(
  new URL('../www/mobile/core/service.js', import.meta.url), 'utf8')));
check('分层：服务层不按内核字面量分支（不出现 kind === \'needLogin\'）',
  !/kind\s*===\s*'needLogin'/.test(require('node:fs').readFileSync(
    new URL('../www/mobile/core/service.js', import.meta.url), 'utf8')));

console.log(failed ? `\nSERVICE: ${failed} 项失败` : '\nSERVICE: ALL PASS ✔');
process.exit(failed ? 1 : 0);
