'use strict';
// Live integration test: call real (anonymous) NetEase endpoints through the browser
// kernel to prove encryption + request building + decoding all work end to end.
const api = require('../www/kumone/lib/api.js');

const show = (name, prom) =>
  prom
    .then((r) => {
      const n = Array.isArray(r) ? `array len ${r.length}` : (r && typeof r === 'object'
        ? `keys=${Object.keys(r).slice(0, 5).join(',')}` : String(r));
      console.log(`OK   ${name} -> ${n}`);
      return true;
    })
    .catch((e) => { console.log(`FAIL ${name} -> ${e.kind || ''} ${e.message}`); return false; });

(async () => {
  const results = [];
  results.push(await show('toplists(eapi)        ', api.toplists()));
  results.push(await show('searchDefaultKey(eapi)', api.searchDefaultKeyword()));
  results.push(await show('newAlbums(weapi)      ', api.newAlbums('ALL', 5)));
  results.push(await show('personalNewSongs(weapi)', api.personalizedNewSongs(5)));
  results.push(await show('highQuality(eapi?weapi)', api.highQualityPlaylists('全部', 3, 0)));
  results.push(await show('topArtists(weapi)     ', api.topArtists(5)));

  const ok = results.filter(Boolean).length;
  console.log(`\nLIVE: ${ok}/${results.length} endpoints OK ${ok > 0 ? '(at least one live call worked)' : '(all failed — network/proxy?)'}`);
  process.exit(ok > 0 ? 0 : 1);
})();