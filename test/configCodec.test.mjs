import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeConfig, decodeConfig } from '../src/configCodec.js';
import { LINK, MIN_SLIDERS, MAX_SLIDERS, POSITIONS } from '../src/solver.js';

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LINKS = [LINK.SAME, LINK.OPPOSITE, LINK.NONE];

function randomConfig(rng, n) {
  const start = Array.from({ length: n }, () => 1 + Math.floor(rng() * POSITIONS));
  const links = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => (r === c ? LINK.SAME : LINKS[Math.floor(rng() * 3)]))
  );
  return { n, start, links };
}

test('round-trips random configs for every n', () => {
  const rng = mulberry32(2024);
  let maxLen = 0;
  for (let i = 0; i < 2000; i++) {
    const n = MIN_SLIDERS + Math.floor(rng() * (MAX_SLIDERS - MIN_SLIDERS + 1));
    const cfg = randomConfig(rng, n);
    const encoded = encodeConfig(cfg);
    maxLen = Math.max(maxLen, encoded.length);
    const decoded = decodeConfig(encoded);
    assert.deepEqual(decoded, cfg, `mismatch on case ${i} (n=${n}), encoded=${encoded}`);
  }
  console.log(`  round-tripped 2000 configs; longest Base64 string = ${maxLen} chars`);
  assert.ok(maxLen <= 16, `expected <= 16 chars for the densest n=7 case, got ${maxLen}`);
});

test('extremes round-trip', () => {
  for (const n of [4, 5, 6, 7]) {
    const allNone = {
      n,
      start: Array(n).fill(1),
      links: Array.from({ length: n }, (_, r) =>
        Array.from({ length: n }, (_, c) => (r === c ? LINK.SAME : LINK.NONE))
      ),
    };
    assert.deepEqual(decodeConfig(encodeConfig(allNone)), allNone);

    const allOpp = {
      n,
      start: Array(n).fill(7),
      links: Array.from({ length: n }, (_, r) =>
        Array.from({ length: n }, (_, c) => (r === c ? LINK.SAME : LINK.OPPOSITE))
      ),
    };
    assert.deepEqual(decodeConfig(encodeConfig(allOpp)), allOpp);
  }
});

test('rejects malformed strings', () => {
  assert.throws(() => decodeConfig(''), /empty/);
  // header with version 0 (our VERSION is 1)
  const badVersion = btoa(String.fromCharCode(0x07)); // version 0, n 7
  assert.throws(() => decodeConfig(badVersion), /version/);
  // header with out-of-range n (version 1, n=2)
  const badN = btoa(String.fromCharCode((1 << 4) | 2));
  assert.throws(() => decodeConfig(badN), /slider count/);
  // valid header but extra high-order bytes -> trailing data
  const trailing = btoa(String.fromCharCode((1 << 4) | 4, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff));
  assert.throws(() => decodeConfig(trailing), /trailing data/);
});

test('not parseable as old JSON format (confirms format changed)', () => {
  const encoded = encodeConfig({
    n: 4,
    start: [2, 6, 2, 7],
    links: Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 4 }, (_, c) => (r === c ? LINK.SAME : LINK.NONE))
    ),
  });
  // The compact string should NOT begin with the base64 of '{' (old JSON started with "ey...").
  assert.ok(!encoded.startsWith('ey'), `unexpectedly looks like JSON base64: ${encoded}`);
});
