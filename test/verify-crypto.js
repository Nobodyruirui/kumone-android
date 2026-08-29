'use strict';
// Verify the browser kernel's weapi/eapi output matches the original Node kernel exactly.
const original = require('F:/test/Kumone-analyze/lib/crypto.js');
const browser = require('F:/test/kumone-android/www/kumone/lib/crypto.js');

const payloads = [
  '{"type":1}',
  '{"key":"abc123"}',
  '{"uid":123456,"limit":2000,"offset":0,"includeVideo":true}',
  '{"id":123}',
  '{"s":"周杰伦","type":1,"limit":50,"offset":0,"total":true}',
  '{"header":{"os":"pc","appver":"3.1.17"},"logs":"[]"}',
];

let allPass = true;
payloads.forEach((p) => {
  const o = original.weapi(p);
  const b = browser.weapi(p);
  const weapiOk = o.params === b.params && o.encSecKey === b.encSecKey;

  const oe = original.eapi('/song/enhance/player/url/v1', p);
  const be = browser.eapi('/song/enhance/player/url/v1', p);
  const eapiOk = oe.params === be.params;

  const line = `payload=${p.slice(0, 40)}...  weapi:${weapiOk ? 'OK' : 'FAIL'}  eapi:${eapiOk ? 'OK' : 'FAIL'}`;
  console.log(line);
  if (!weapiOk || !eapiOk) {
    allPass = false;
    console.log('  orig weapi:', o);
    console.log('  brow weapi:', b);
    console.log('  orig eapi :', oe);
    console.log('  brow eapi :', be);
  }
});

console.log(allPass ? '\nRESULT: ALL MATCH ✔ (crypto port is correct)' : '\nRESULT: MISMATCH ✘');
process.exit(allPass ? 0 : 1);