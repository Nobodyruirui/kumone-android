/* 同一份离线数据供基线与原型使用。服务层、队列和界面均来自 www。 */
(() => {
  'use strict';

  const artist = { id: 51, name: '潮间带' };
  const album = { id: 52, name: '潮汐手记', picUrl: 'tide-cover.png' };
  const durationSeconds = 204;
  const songs = [
    '天光', '始发站', '向海', '小径', '拾贝', '南风', '旧堤', '沿岸公路',
    '雾灯', '候潮', '盐田', '回港', '入夜', '潮声', '熄灯之后', '黎明之前'
  ].map((name, index) => ({
    id: 1001 + index, name, ar: [artist], al: album, dt: durationSeconds * 1000
  }));

  function matches(keywords) {
    return songs.filter(song => [song.name, artist.name, album.name].some(
      field => field.includes(keywords.trim())
    ));
  }

  let requests = 0;
  window.KumoneFixture = { requestCount: () => requests };
  window.kumone = {
    async invoke(channel, args) {
      requests++;
      switch (channel) {
        case 'isLoggedIn': return { ok: true, data: false };
        case 'userAccount': return { ok: true, data: null };
        case 'searchDefaultKeyword': return { ok: true, data: '潮汐' };
        case 'search':
        case 'searchSuggest': {
          const found = matches(args.keywords);
          return { ok: true, data: { songs: found, songCount: found.length } };
        }
        case 'songURL':
          return { ok: true, data: { url: 'fixture:track/' + args.id, level: args.level } };
        case 'lyric':
          return { ok: true, data: { lrc: '[00:00.00]海风吹过堤岸\n[00:08.00]沿着潮线慢慢走' } };
        default:
          return { ok: false, kind: 'business', error: '此原型仅提供本地搜索与播放数据' };
      }
    }
  };

  // 播放引擎仍处理切歌、队列、seek 和按钮订阅。时钟只替代 HTMLAudioElement。
  window.Audio = class extends EventTarget {
    paused = true;
    currentTime = 0;
    duration = durationSeconds;
    timer = null;

    set src(value) { this.currentTime = 0; }

    async play() {
      if (!this.paused) return;
      this.paused = false;
      this.dispatchEvent(new Event('play'));
      this.timer = setInterval(() => {
        this.currentTime = Math.min(this.duration, this.currentTime + 1);
        this.dispatchEvent(new Event('timeupdate'));
        if (this.currentTime === this.duration) {
          this.pause();
          this.dispatchEvent(new Event('ended'));
        }
      }, 1000);
    }

    pause() {
      if (this.paused) return;
      clearInterval(this.timer);
      this.paused = true;
      this.dispatchEvent(new Event('pause'));
    }
  };

  // 阻止预览曲目写入同源真实预览页的历史、播放队列和系统媒体会话。
  const memory = new Map();
  Object.defineProperty(window, 'localStorage', { value: {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value))
  } });
  Object.defineProperty(navigator, 'mediaSession', { value: null });
})();
