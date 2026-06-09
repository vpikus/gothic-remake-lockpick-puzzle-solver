// Compact codec for a puzzle config -> short Base64 string (and back).
//
// Layout:
//   byte 0           : header = (VERSION << 4) | n          (n is 4..7)
//   remaining bytes  : a big-endian integer holding, in mixed radix:
//                        - each start index (0..6)            radix 7
//                        - each off-diagonal link (0/1/2)     radix 3   (row-major, r != c)
//
// Because n is known from the header, the decoder knows exactly how many
// digits to extract, so it does not depend on the byte length. This packs the
// data near its information-theoretic minimum (~11 bytes / ~16 Base64 chars for
// the densest 7-slider config) with zero dependencies.

import { LINK, MIN_SLIDERS, MAX_SLIDERS } from './solver.js';

const VERSION = 1;
const LINK_CODE = { [LINK.NONE]: 0, [LINK.SAME]: 1, [LINK.OPPOSITE]: 2 };
const CODE_LINK = [LINK.NONE, LINK.SAME, LINK.OPPOSITE];

// ---- byte / base64 helpers (browser-safe, no Buffer) ----
function bytesToBase64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bigIntToBytes(x) {
  if (x <= 0n) return new Uint8Array([0]);
  const out = [];
  while (x > 0n) {
    out.push(Number(x & 0xffn));
    x >>= 8n;
  }
  out.reverse(); // big-endian
  return new Uint8Array(out);
}

function bytesToBigInt(bytes) {
  let x = 0n;
  for (const b of bytes) x = (x << 8n) | BigInt(b);
  return x;
}

/**
 * Encode a config to a compact Base64 string.
 * @param {{n:number, start:number[], links:string[][]}} cfg
 * @returns {string}
 */
export function encodeConfig({ n, start, links }) {
  let acc = 0n;
  for (let i = 0; i < n; i++) acc = acc * 7n + BigInt(start[i] - 1);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (r === c) continue;
      acc = acc * 3n + BigInt(LINK_CODE[links[r][c]] ?? 0);
    }
  }
  const body = bigIntToBytes(acc);
  const bytes = new Uint8Array(body.length + 1);
  bytes[0] = (VERSION << 4) | n;
  bytes.set(body, 1);
  return bytesToBase64(bytes);
}

/**
 * Decode a compact Base64 string back to a config. Throws on malformed input.
 * The diagonal of the link matrix is always restored to "Same".
 * @param {string} b64
 * @returns {{n:number, start:number[], links:string[][]}}
 */
export function decodeConfig(b64) {
  const bytes = base64ToBytes(b64);
  if (bytes.length < 1) throw new Error('empty input');

  const header = bytes[0];
  const version = header >> 4;
  const n = header & 0x0f;
  if (version !== VERSION) throw new Error('unsupported version ' + version);
  if (n < MIN_SLIDERS || n > MAX_SLIDERS) throw new Error('invalid slider count ' + n);

  let acc = bytesToBigInt(bytes.subarray(1));

  const linkCount = n * (n - 1);
  const linkFlat = new Array(linkCount);
  for (let i = linkCount - 1; i >= 0; i--) {
    linkFlat[i] = Number(acc % 3n);
    acc /= 3n;
  }
  const startIdx = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    startIdx[i] = Number(acc % 7n);
    acc /= 7n;
  }
  if (acc !== 0n) throw new Error('trailing data — not a valid config string');

  const start = startIdx.map((v) => v + 1);
  const links = [];
  let k = 0;
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(r === c ? LINK.SAME : CODE_LINK[linkFlat[k++]]);
    links.push(row);
  }
  return { n, start, links };
}
