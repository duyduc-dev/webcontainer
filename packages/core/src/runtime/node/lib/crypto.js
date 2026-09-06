// crypto — a minimal, pure-JS subset (hash/hmac/random only).
//
// Real Node's crypto module is a C++ wrapper around OpenSSL; there is no
// native crypto backend here (no Rust/Wasm codec, unlike vivari's design this
// was adapted from). Node's crypto API is synchronous
// (hash.update().digest() has no async variant), and WebCrypto's
// `crypto.subtle.digest()` is async-only, so it can't back that contract —
// hashing is done with pure-JS digest cores instead (md5/sha1/sha256, ported
// from vivari's codec-less fallback path). `randomBytes`/`randomUUID` DO use
// the real, synchronous `crypto.getRandomValues`/`crypto.randomUUID`.
//
// Deliberately NOT implemented (throws loudly rather than silently degrading):
// sha224/sha384/sha512 and any other digest, ciphers (createCipheriv/
// createDecipheriv), sign/verify, DH/ECDH, KeyObject/JWK — all need either a
// real crypto backend or substantially more code than this phase's scope
// (network egress for a package-manager-style client) calls for.
// Adapted from vivari (github.com/maitrungduc1410/vivari, MIT), packages/runtime/node/bindings/crypto.js (pure-JS fallback cores).
export default function (exports, require, module, process, internalBinding, primordials) {
  "use strict";
  const { Buffer } = require("buffer");

  function concat(chunks) {
    let n = 0;
    for (const c of chunks) n += c.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }

  // --- pure-JS digest cores (md5 / sha1 / sha256), all 64-byte block size ----
  function md5(bytes) {
    const s = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    const K = new Int32Array(64);
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
    const len = bytes.length;
    const withOne = len + 1;
    const total = withOne + ((56 - (withOne % 64) + 64) % 64) + 8;
    const msg = new Uint8Array(total);
    msg.set(bytes);
    msg[len] = 0x80;
    const bitLen = len * 8;
    msg[total - 8] = bitLen & 0xff;
    msg[total - 7] = (bitLen >>> 8) & 0xff;
    msg[total - 6] = (bitLen >>> 16) & 0xff;
    msg[total - 5] = (bitLen >>> 24) & 0xff;
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const M = new Int32Array(16);
    const rol = (x, c) => (x << c) | (x >>> (32 - c));
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) {
        const j = off + i * 4;
        M[i] = msg[j] | (msg[j + 1] << 8) | (msg[j + 2] << 16) | (msg[j + 3] << 24);
      }
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + M[g]) | 0;
        A = D; D = C; C = B;
        B = (B + rol(F, s[i])) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    const out = new Uint8Array(16);
    [a0, b0, c0, d0].forEach((v, i) => {
      out[i * 4] = v & 0xff;
      out[i * 4 + 1] = (v >>> 8) & 0xff;
      out[i * 4 + 2] = (v >>> 16) & 0xff;
      out[i * 4 + 3] = (v >>> 24) & 0xff;
    });
    return out;
  }

  function sha1(bytes) {
    const len = bytes.length;
    const withOne = len + 1;
    const total = withOne + ((56 - (withOne % 64) + 64) % 64) + 8;
    const msg = new Uint8Array(total);
    msg.set(bytes);
    msg[len] = 0x80;
    const bitLen = len * 8;
    const dv = new DataView(msg.buffer);
    dv.setUint32(total - 4, bitLen >>> 0, false);
    dv.setUint32(total - 8, Math.floor(bitLen / 4294967296), false);
    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    const w = new Int32Array(80);
    const rol = (x, c) => (x << c) | (x >>> (32 - c));
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false);
      for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        const t = (rol(a, 5) + f + e + k + w[i]) | 0;
        e = d; d = c; c = rol(b, 30); b = a; a = t;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    const out = new Uint8Array(20);
    const odv = new DataView(out.buffer);
    [h0, h1, h2, h3, h4].forEach((v, i) => odv.setInt32(i * 4, v, false));
    return out;
  }

  const K256 = new Int32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  function sha256(bytes) {
    const len = bytes.length;
    const withOne = len + 1;
    const total = withOne + ((56 - (withOne % 64) + 64) % 64) + 8;
    const msg = new Uint8Array(total);
    msg.set(bytes);
    msg[len] = 0x80;
    const bitLen = len * 8;
    const dv = new DataView(msg.buffer);
    dv.setUint32(total - 4, bitLen >>> 0, false);
    dv.setUint32(total - 8, Math.floor(bitLen / 4294967296), false);
    const h = new Int32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    const w = new Int32Array(64);
    const rr = (x, c) => (x >>> c) | (x << (32 - c));
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (let i = 0; i < 64; i++) {
        const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + K256[i] + w[i]) | 0;
        const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setInt32(i * 4, h[i], false);
    return out;
  }

  // All three supported digests share a 64-byte HMAC block size.
  const CORES = { md5: { fn: md5, blockSize: 64 }, sha1: { fn: sha1, blockSize: 64 }, sha256: { fn: sha256, blockSize: 64 } };

  const coreFor = (algorithm) => {
    const core = CORES[String(algorithm).toLowerCase()];
    if (!core) {
      throw new Error(
        `digest method '${algorithm}' is not supported without a native crypto backend (available: ${Object.keys(CORES).join(", ")})`,
      );
    }
    return core;
  };

  const toBytes = (data, encoding) => (Buffer.isBuffer(data) ? data : Buffer.from(data, encoding || "utf8"));

  class Hash {
    constructor(algorithm) {
      this._core = coreFor(algorithm);
      this._chunks = [];
    }
    update(data, encoding) {
      this._chunks.push(toBytes(data, encoding));
      return this;
    }
    digest(encoding) {
      const out = Buffer.from(this._core.fn(concat(this._chunks)));
      return encoding ? out.toString(encoding) : out;
    }
  }

  class Hmac {
    constructor(algorithm, key) {
      this._core = coreFor(algorithm);
      let keyBytes = toBytes(key);
      if (keyBytes.length > this._core.blockSize) keyBytes = this._core.fn(keyBytes);
      const padded = new Uint8Array(this._core.blockSize);
      padded.set(keyBytes);
      this._ipad = padded.map((b) => b ^ 0x36);
      this._opad = padded.map((b) => b ^ 0x5c);
      this._chunks = [];
    }
    update(data, encoding) {
      this._chunks.push(toBytes(data, encoding));
      return this;
    }
    digest(encoding) {
      const inner = this._core.fn(concat([this._ipad, ...this._chunks]));
      const out = Buffer.from(this._core.fn(concat([this._opad, inner])));
      return encoding ? out.toString(encoding) : out;
    }
  }

  const createHash = (algorithm) => new Hash(algorithm);
  const createHmac = (algorithm, key) => new Hmac(algorithm, key);

  const randomBytes = (size, callback) => {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    const buf = Buffer.from(bytes);
    if (typeof callback !== "function") return buf;
    process.nextTick(callback, null, buf);
    return undefined;
  };

  // Unbiased via rejection sampling: draw a random value in [0, range) by
  // discarding draws that would skew the modulo toward the low end.
  const randomInt = (min, max, callback) => {
    if (max === undefined) {
      max = min;
      min = 0;
    }
    const run = () => {
      const range = max - min;
      const bytesNeeded = Math.ceil(Math.log2(range) / 8) || 1;
      const maxValid = Math.floor(256 ** bytesNeeded / range) * range;
      let value;
      do {
        const bytes = new Uint8Array(bytesNeeded);
        crypto.getRandomValues(bytes);
        value = bytes.reduce((acc, b) => acc * 256 + b, 0);
      } while (value >= maxValid);
      return min + (value % range);
    };
    if (typeof callback !== "function") return run();
    process.nextTick(() => {
      try {
        callback(null, run());
      } catch (error) {
        callback(error);
      }
    });
    return undefined;
  };

  const randomUUID = () => crypto.randomUUID();

  module.exports = { createHash, createHmac, randomBytes, randomInt, randomUUID, Hash, Hmac };
}
