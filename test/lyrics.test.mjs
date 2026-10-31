// 回归测试：歌词解析纯函数（.scratch/phone-fixes/issues/02-nowplaying-lyrics）。
//
//   node test/lyrics.test.mjs
//
// 断言要点：
//   1. 整行歌词（LRC）解析出时间与文本
//   2. 逐字歌词（YRC）解析出词级时间片
//   3. 逐字优先：有 yrc 用逐字，没有则退回整行，都没有就是 none
//   4. 翻译行按时间就近对齐
//   5. 当前行判定
//
// 退出码：0 通过；1 不通过。

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../www/mobile/core/lyrics.js');

let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    console.log(`PASS - ${name}`);
  } else {
    failed++;
    console.log(`FAIL - ${name}${extra ? ' :: ' + extra : ''}`);
  }
}

/* 1. 整行歌词 */
const lrc = '[00:01.50]第一行歌词\n[00:05.00]第二行歌词\n[00:09.25]第三行';
const lines = L.parseLrc(lrc);
check('LRC：行数', lines.length === 3, `实际 ${lines.length}`);
check('LRC：时间换算', Math.abs(lines[0].time - 1.5) < 0.001, `实际 ${lines[0].time}`);
check('LRC：文本', lines[1].text === '第二行歌词');
check('LRC：按时间排序', lines[2].time > lines[1].time);
check('LRC：空输入返回空数组', L.parseLrc('').length === 0 && L.parseLrc(null).length === 0);

/* 2. 同一行多个时间标签 */
const multi = L.parseLrc('[00:01.00][00:31.00]副歌');
check('LRC：一行多时间标签展开成两行', multi.length === 2 && Math.abs(multi[1].time - 31) < 0.001);

/* 3. 元信息行不算歌词 */
const meta = L.parseLrc('[00:00.00]作词 : 某人\n[00:03.00]真歌词');
check('LRC：作词行被跳过', meta.length === 1 && meta[0].text === '真歌词');

const meta2 = L.parseLrc('[00:03.39]填词：周萌@大创作家\n[00:05.23]作曲：Kim Se Jin\n[00:10.00]第一句歌词');
check('LRC：填词 / 作曲行被跳过', meta2.length === 1 && meta2[0].text === '第一句歌词',
  '行数=' + meta2.length);

/* 4. 逐字歌词 */
const yrc = '[1000,2000](1000,500,0)你(1500,500,0)好';
const ylines = L.parseYrc(yrc);
check('YRC：行数', ylines.length === 1);
check('YRC：行起始时间（毫秒→秒）', ylines[0].time === 1);
check('YRC：行时长', ylines[0].dur === 2);
check('YRC：词数', ylines[0].words.length === 2);
check('YRC：词级时间', ylines[0].words[1].t === 1.5 && ylines[0].words[1].d === 0.5);
check('YRC：整行文本', ylines[0].text === '你好');
check('YRC：空输入返回空数组', L.parseYrc(null).length === 0);

/* 4b. YRC 的元信息行要拦掉（时长不为 0 也拦） */
const yrcMeta = L.parseYrc('[0,1000](0,1000,0)作词 : 某人\n[1000,3000](1000,1000,0)真(2000,1000,0)歌词');
check('YRC：作词行被跳过', yrcMeta.length === 1 && yrcMeta[0].text === '真歌词',
  '行数=' + yrcMeta.length);

/* 5. build：逐字优先 */
const builtWord = L.build({ lrc: '[00:01.00]整行', tlyric: null, yrc: yrc });
check('build：有逐字时 kind=word', builtWord.kind === 'word');
check('build：逐字行带词级时间', builtWord.lines[0].words && builtWord.lines[0].words.length === 2);

const builtLine = L.build({ lrc: lrc, tlyric: null, yrc: null });
check('build：没逐字时 kind=line', builtLine.kind === 'line');
check('build：整行行没有词级时间', builtLine.lines[0].words === null);

const builtNone = L.build({ lrc: null, tlyric: null, yrc: null });
check('build：什么都没有时 kind=none', builtNone.kind === 'none' && builtNone.lines.length === 0);
check('build：空输入不炸', L.build().kind === 'none');

/* 6. 翻译行就近对齐 */
const withTr = L.build({
  lrc: '[00:01.00]Hello\n[00:10.00]World',
  tlyric: '[00:01.10]你好\n[00:10.05]世界',
  yrc: null
});
check('翻译：按时间就近对齐', withTr.lines[0].translation === '你好' && withTr.lines[1].translation === '世界');

const trFar = L.build({ lrc: '[00:01.00]Hello', tlyric: '[00:30.00]你好', yrc: null });
check('翻译：差太远就不挂', trFar.lines[0].translation === null);

/* 7. 当前行判定 */
const arr = [{ time: 0 }, { time: 5 }, { time: 10 }];
check('当前行：未到第一行是 -1', L.activeIndex(arr, -1) === -1);
check('当前行：落在第二行', L.activeIndex(arr, 6) === 1);
check('当前行：超过末行停在末行', L.activeIndex(arr, 99) === 2);
check('当前行：空数组是 -1', L.activeIndex([], 3) === -1);

console.log(failed ? `\nLYRICS: ${failed} 项失败` : '\nLYRICS: ALL PASS ✔');
process.exit(failed ? 1 : 0);
