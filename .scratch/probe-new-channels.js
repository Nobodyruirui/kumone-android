'use strict';
// 真接口验证：本轮新增的两条内核通道
//   1. cellphoneLogin —— 手机号+密码（用假账号，只看通道是否通、结论是否可读）
//   2. lyric —— 是否真能取回逐字歌词 yrc
const api = require('../www/kumone/lib/api.js');

(async () => {
  const login = await api.cellphoneLogin('13800000000', 'not-a-real-password');
  console.log('cellphoneLogin ->', JSON.stringify({
    code: login.code, msg: login.message || login.msg
  }));

  // 找一首有逐字歌词的歌：先取每日推荐，再逐首问歌词
  const daily = await api.dailyRecommendSongs();
  let yrcHit = 0, lrcOnly = 0, none = 0;
  for (const t of daily.slice(0, 8)) {
    const l = await api.lyric(t.id);
    const hasYrc = !!(l.yrc && l.yrc.lyric && l.yrc.lyric.trim());
    const hasLrc = !!(l.lrc && l.lrc.lyric && l.lrc.lyric.trim());
    if (hasYrc) yrcHit++;
    else if (hasLrc) lrcOnly++;
    else none++;
    if (hasYrc) {
      const first = l.yrc.lyric.split('\n').find((x) => x.trim());
      console.log('  yrc 命中:', t.name, '|', String(first).slice(0, 70));
    }
  }
  console.log(`lyric: 8 首里 逐字=${yrcHit} 仅整行=${lrcOnly} 无歌词=${none}`);
})();
