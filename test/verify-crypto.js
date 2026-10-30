'use strict';
// Verify the browser kernel's weapi/eapi output.
//
// Historically this compared the browser kernel against the original Node kernel
// on the author's machine (a hard-coded F:/ path), so it could only ever run there.
// Now it works anywhere:
//
//   1. If KUMONE_ORIGINAL_KERNEL points at the original Node kernel, compare against
//      that (the strongest check — byte-for-byte equality with the reference).
//   2. Otherwise compare against a committed golden baseline, so any change to the
//      encryption algorithm still trips the test.
//
// Regenerate the baseline deliberately with:
//   node test/verify-crypto.js --update
const fs = require('fs');
const path = require('path');

const browser = require('../www/kumone/lib/crypto.js');
const GOLDEN_PATH = path.join(__dirname, 'fixtures', 'crypto-golden.json');
const EAPI_PATH = '/song/enhance/player/url/v1';

const payloads = [
  '{"type":1}',
  '{"key":"abc123"}',
  '{"uid":123456,"limit":2000,"offset":0,"includeVideo":true}',
  '{"id":123}',
  '{"s":"测试搜索","type":1,"limit":50,"offset":0,"total":true}',
  '{"header":{"os":"pc","appver":"3.1.17"},"logs":"[]"}',
];

const compute = (kernel) => payloads.map((p) => ({
  payload: p,
  weapiParams: kernel.weapi(p).params,
  encSecKey: kernel.weapi(p).encSecKey,
  eapiParams: kernel.eapi(EAPI_PATH, p).params,
}));

const current = compute(browser);

function loadGolden() {
  if (!fs.existsSync(GOLDEN_PATH)) return null;
  return JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
}

function saveGolden() {
  fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
  fs.writeFileSync(GOLDEN_PATH, JSON.stringify(current, null, 2) + '\n', 'utf8');
  console.log(`baseline written -> ${GOLDEN_PATH}`);
}

function compare(label, expected) {
  let allPass = true;
  expected.forEach((exp, i) => {
    const got = current[i];
    const weapiOk = exp.weapiParams === got.weapiParams && exp.encSecKey === got.encSecKey;
    const eapiOk = exp.eapiParams === got.eapiParams;
    console.log(`payload=${exp.payload.slice(0, 40)}...  weapi:${weapiOk ? 'OK' : 'FAIL'}  eapi:${eapiOk ? 'OK' : 'FAIL'}`);
    if (!weapiOk || !eapiOk) {
      allPass = false;
      console.log('  expected weapi:', exp.weapiParams);
      console.log('  actual   weapi:', got.weapiParams);
      console.log('  expected eapi :', exp.eapiParams);
      console.log('  actual   eapi :', got.eapiParams);
    }
  });
  console.log(allPass ? `\nRESULT: ALL MATCH (${label})` : `\nRESULT: MISMATCH (${label})`);
  return allPass;
}

if (process.argv.includes('--update')) {
  saveGolden();
  process.exit(0);
}

// 1) Original Node kernel, if the reference is available.
const originalPath = process.env.KUMONE_ORIGINAL_KERNEL;
if (originalPath && fs.existsSync(originalPath)) {
  const original = require(originalPath);
  process.exit(compare('against original Node kernel', compute(original)) ? 0 : 1);
}

// 2) Golden baseline.
let golden = loadGolden();
if (!golden) {
  console.log('no baseline found — writing one from the current implementation');
  saveGolden();
  console.log('RESULT: BASELINE CREATED (run again to compare)');
  process.exit(0);
}
process.exit(compare('against committed baseline', golden) ? 0 : 1);
