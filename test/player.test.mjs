// 回归测试：移动端播放引擎（ticket 05）。
//
//   node test/player.test.mjs
//
// 注入假音频元素与假服务层，不碰真实网络与真实 <audio>。断言：
//   1. 队列：playQueue 建立队列并定位到指定下标
//   2. 插播：「下一首播放」插到当前曲目之后，且插一次后不再重复
//   3. 播放模式：顺序 / 列表循环 / 单曲循环
//   4. 音质降级：请求音质不可用时自动退到标准音质，并如实上报实际音质
//   5. 失败：取址失败时不静默，报出契约错误码
//   6. 持久化：队列与进度写进 store，restore 能读回来
//   7. 对外只暴露一个 state()，且字段足够界面与模型使用
//
// 退出码：0 通过；1 不通过。

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPlayer } = require('../www/mobile/core/player.js');

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log(`PASS - ${name}`);
  else { failed++; console.log(`FAIL - ${name}${extra ? ' :: ' + extra : ''}`); }
}

/* --------------------------------------------------- 假音频元素 */

function fakeAudio() {
  const listeners = {};
  return {
    src: '',
    currentTime: 0,
    duration: 180,
    paused: true,
    volume: 0.9,
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    fire(name) { (listeners[name] || []).forEach((fn) => fn()); }
  };
}

function fakeStore() {
  const mem = {};
  return {
    get: (k, f) => (mem[k] == null ? f : mem[k]),
    set: (k, v) => { mem[k] = v; },
    _mem: mem
  };
}

const track = (id, name) => ({
  id, name: name || ('曲目' + id),
  artists: [{ id: 1, name: '甲' }],
  album: { id: 2, name: '专辑', picUrl: 'http://p/c.jpg' },
  durationMS: 180000
});

/* ------------------------------------------ 1. 队列 */

let requested = [];
let service = {
  songUrl(id, level) {
    requested.push({ id, level });
    return Promise.resolve({ ok: true, data: { url: 'https://x/' + id + '.mp3', level } });
  }
};
let audio = fakeAudio();
let store = fakeStore();
let player = createPlayer({ service, audio, store });

await player.playQueue([track(1), track(2), track(3)], 1);
check('队列：长度正确', player.queueItems().length === 3);
check('队列：定位到指定下标', player.index() === 1);
check('队列：状态读数带曲目名', player.state().trackName === '曲目2');
check('队列：状态读数带艺人（可展示字符串）', player.state().artist === '甲');
check('队列：状态读数带专辑名', player.state().album === '专辑');
check('队列：状态读数带封面', player.state().cover === 'http://p/c.jpg');
check('队列：播放后 paused 为 false', audio.paused === false);
check('队列：真实设置了 src', audio.src === 'https://x/2.mp3');

/* ------------------------------------------ 2. 插播 */

player.addPlayNext(track(9, '插播曲'));
check('插播：队列长度 +1', player.state().playNextLength === 1);
player.addPlayNext(track(9, '插播曲'));
check('插播：同一首不重复入队', player.state().playNextLength === 1);
await player.next(true);
check('插播：下一首先播插播曲', player.state().trackName === '插播曲');
check('插播：插播后队列里留下它', player.state().playNextLength === 0);

/* ------------------------------------------ 3. 播放模式 */

await player.playQueue([track(1), track(2)], 0);
await player.next(true);
check('模式：顺序走到第二首', player.state().trackName === '曲目2');
await player.next(true);
check('模式：顺序到底后停下', player.state().index === 1);

await player.setRepeat('all');
await player.next(true);
check('模式：列表循环回到第一首', player.state().trackName === '曲目1');

await player.setRepeat('one');
await player.playQueue([track(1), track(2)], 0);
await player.next(false);
check('模式：单曲循环非用户主动时重播当前', player.state().trackName === '曲目1');
await player.next(true);
check('模式：单曲循环用户主动时仍切下一首', player.state().trackName === '曲目2');

/* ------------------------------------------ 4. 音质降级 */

requested = [];
service = {
  songUrl(id, level) {
    requested.push({ id, level });
    if (level === 'lossless') return Promise.resolve({ ok: false, code: 'KUMONE_EMPTY_RESULT' });
    return Promise.resolve({ ok: true, data: { url: 'https://x/' + id + '.mp3', level } });
  }
};
audio = fakeAudio();
player = createPlayer({ service, audio, store: fakeStore() });
player.setQuality('lossless');
await player.playQueue([track(7)], 0);
check('降级：先请求想要的音质', requested[0] && requested[0].level === 'lossless');
check('降级：失败后退到别的音质', requested.length >= 2 && requested[1].level !== 'lossless');
check('降级：如实上报实际音质', player.state().quality === requested[requested.length - 1].level);
check('降级：保留了请求音质', player.state().requestedQuality === 'lossless');

/* ------------------------------------------ 5. 失败不静默 */

service = {
  songUrl() { return Promise.resolve({ ok: false, code: 'KUMONE_NETWORK', kind: 'transient' }); }
};
audio = fakeAudio();
player = createPlayer({ service, audio, store: fakeStore() });
await player.playQueue([track(8)], 0);
check('失败：状态里带契约错误码', player.state().error && player.state().error.code === 'KUMONE_NETWORK');

/* ------------------------------------------ 6. 持久化 */

store = fakeStore();
service = { songUrl: (id, level) => Promise.resolve({ ok: true, data: { url: 'https://x/' + id + '.mp3', level } }) };
audio = fakeAudio();
player = createPlayer({ service, audio, store });
await player.playQueue([track(1), track(2)], 1);
audio.currentTime = 42;
player.persist();
check('持久化：写进 store', !!store._mem['mobile.playback'] && store._mem['mobile.playback'].queue.length === 2);
check('持久化：记录下标', store._mem['mobile.playback'].index === 1);
check('持久化：记录进度', store._mem['mobile.playback'].time === 42);

const player2 = createPlayer({ service, audio: fakeAudio(), store });
const restored = player2.restore();
check('持久化：restore 读回队列', restored.queueLength === 2);
check('持久化：restore 读回下标', restored.index === 1);
check('持久化：restore 读回曲目', restored.trackName === '曲目2');

/* ------------------------------------------ 7. 对外接口 */

check('接口：暴露 state()', typeof player.state === 'function');
check('接口：暴露 toggle()', typeof player.toggle === 'function');
check('接口：暴露 setVolume()', typeof player.setVolume === 'function');
check('接口：暴露 seek()', typeof player.seek === 'function');
check('接口：暴露命名动词 queue()', typeof player.queue === 'function');
check('接口：暴露订阅 subscribe()', typeof player.subscribe === 'function');
player.setVolume(0.5);
check('接口：音量写入音频元素', audio.volume === 0.5);
player.seek(30);
check('接口：seek 生效', audio.currentTime === 30);

/* ------------------------------------------ 8. 随机模式 */

service = { songUrl: (id, level) => Promise.resolve({ ok: true, data: { url: 'https://x/' + id + '.mp3', level } }) };
audio = fakeAudio();
player = createPlayer({ service, audio, store: fakeStore() });
await player.playQueue([track(1), track(2), track(3)], 0);
player.setRepeat('shuffle');
check('随机：模式已生效', player.state().repeat === 'shuffle');
const before = player.state().index;
await player.next(false);
check('随机：切到了另一首', player.state().index !== before);
player.setRepeat('nonsense');
check('随机：非法模式被拒（KUMONE_UNSUPPORTED）', player.state().error && player.state().error.code === 'KUMONE_UNSUPPORTED');
check('随机：非法模式不改变当前模式', player.state().repeat === 'shuffle');

/* ------------------------------------------ 9. queue 动词与事件 */

const events = [];
const unsub = player.subscribe((snap) => events.push(snap));
player.setRepeat('all');
check('事件：订阅后能收到状态变化', events.length > 0);
check('事件：载荷不含 DOM 引用', events.every((e) => !('node' in e) && !('element' in e)));
unsub();
const countBefore = events.length;
player.setVolume(0.3);
check('事件：退订后不再收到', events.length === countBefore);

audio = fakeAudio();
player = createPlayer({ service, audio, store: fakeStore() });
await player.queue([track(1), track(2)]);
check('queue 动词：推入后队列长度 2', player.state().queueLength === 2);
check('queue 动词：只读读数拿到 2 首', player.queueItems().length === 2);
await player.queue([track(3)]);
check('queue 动词：追加而非替换', player.state().queueLength === 3);
await player.queue([]);
check('queue 动词：空列表报 KUMONE_EMPTY_RESULT',
  player.state().error && player.state().error.code === 'KUMONE_EMPTY_RESULT');

/* ------------------------------------------ 10. 音源解锁兜底 */

service = {
  songUrl: () => Promise.resolve({ ok: false, code: 'KUMONE_UNBLOCK_FAILED', kind: 'permanent' }),
  unblock: (t) => Promise.resolve({ ok: true, data: { url: 'https://third/' + t.id + '.mp3', source: 'kuwo' } })
};
audio = fakeAudio();
player = createPlayer({ service, audio, store: fakeStore() });
await player.playQueue([track(5)], 0);
check('解锁兜底：成功路径用上第三方地址', audio.src === 'https://third/5.mp3');
check('解锁兜底：成功时不留错误', !player.state().error);

service = {
  songUrl: () => Promise.resolve({ ok: false, code: 'KUMONE_UNBLOCK_FAILED', kind: 'permanent' }),
  unblock: () => Promise.resolve({ ok: false, code: 'KUMONE_UNBLOCK_FAILED', kind: 'permanent' })
};
audio = fakeAudio();
player = createPlayer({ service, audio, store: fakeStore() });
await player.playQueue([track(6)], 0);
check('解锁兜底：失败路径产出 KUMONE_UNBLOCK_FAILED',
  player.state().error && player.state().error.code === 'KUMONE_UNBLOCK_FAILED');
check('解锁兜底：失败是 permanent（不重试）', player.state().error.kind === 'permanent');

/* ------------------------------------------ 11. 本机播放历史 */

service = {
  songUrl: (id) => Promise.resolve({ ok: true, data: { url: 'https://x/' + id + '.mp3', level: 'standard' } })
};
audio = fakeAudio();
player = createPlayer({ service, audio, store: fakeStore() });
await player.playQueue([track(7), track(8)], 0);
check('播放历史：播过的第一首进了历史', player.history().length === 1 && player.history()[0].id === 7);
check('播放历史：最近的在最前', player.history()[0].id === 7);

await player.next();
check('播放历史：切到下一首后历史变两条', player.history().length === 2);
check('播放历史：最新的在最前', player.history()[0].id === 8);

await player.playQueue([track(7)], 0);
check('播放历史：同一首不重复记', player.history().filter((t) => t.id === 7).length === 1);
check('播放历史：重复播放后把旧记录挪到前面', player.history()[0].id === 7);

player.clearHistory();
check('播放历史：清空后为空', player.history().length === 0);

/* ------------------------------------------ 12. 引擎不写 DOM */

const src = require('node:fs').readFileSync(
  new URL('../www/mobile/core/player.js', import.meta.url), 'utf8');
check('分层：引擎源码不含 document.', !/document\./.test(src));
check('分层：引擎源码不含 getElementById', !/getElementById/.test(src));
check('分层：引擎源码不含 querySelector', !/querySelector/.test(src));

console.log(failed ? `\nPLAYER: ${failed} 项失败` : '\nPLAYER: ALL PASS ✔');
process.exit(failed ? 1 : 0);
