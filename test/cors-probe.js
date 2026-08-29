'use strict';
// Probe NetEase CORS headers from an origin (simulates a WebView page origin).
async function probe(name, url) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Origin': 'https://localhost',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://music.163.com',
      },
    });
    const acao = res.headers.get('access-control-allow-origin');
    console.log(`${name}: status=${res.status} ACAO=${acao || '(none)'}`);
  } catch (e) {
    console.log(`${name}: ERROR ${e.message}`);
  }
}

(async () => {
  await probe('weapi-unikey ', 'https://music.163.com/weapi/login/qrcode/unikey');
  await probe('eapi-toplist  ', 'https://interface.music.163.com/eapi/toplist');
})();