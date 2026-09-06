// internal/inflate — a pure-JS, synchronous, whole-buffer DEFLATE (RFC 1951)
// decoder, plus the gzip (RFC 1952) and zlib (RFC 1950) container formats
// built on top of it.
//
// Real Node's zlib module wraps a native (C) zlib binding whose *compression*
// classes (Gzip/Deflate/DeflateRaw) this runtime doesn't reimplement here —
// only decompression, and only synchronously. Both restrictions come from
// the same traced need: real npm's own tar dependency extracts a downloaded
// tarball through `minizlib`, which does NOT use zlib's public, documented
// streaming API (`.pipe()`) — it reaches into a zlib instance's internal,
// undocumented-but-stable shape (a synchronous `_processChunk(chunk,
// flushFlag)` method plus an internal `._handle`) to decompress each chunk
// without any async round-trip. That shape has no async equivalent to
// bridge against (there's no synchronous browser decompression API either),
// so it has to be backed by a real decoder implemented here instead.
//
// This is a whole-buffer decoder, not a byte-by-byte streaming state
// machine: every input chunk is buffered, and the actual DEFLATE decode only
// runs once the caller's final ("Z_FINISH") chunk arrives, returning the
// complete output in one shot. Real streaming decompression exists to avoid
// holding a whole (potentially huge) payload in memory at once; a package
// tarball extracted inside this sandbox is never that large, so trading
// that property away is a deliberate simplification, not an oversight — it
// turns "implement an incremental Huffman decoder state machine" into
// "implement a plain decoder function," which is much smaller and far
// easier to verify correct.
export default function (exports, require, module) {
  "use strict";

  // ---- CRC-32 (gzip trailer) / Adler-32 (zlib trailer) ----------------

  let CRC_TABLE = null;
  const crcTable = () => {
    if (CRC_TABLE) return CRC_TABLE;
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    CRC_TABLE = table;
    return table;
  };

  const crc32 = (bytes) => {
    const table = crcTable();
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };

  const adler32 = (bytes) => {
    let a = 1;
    let b = 0;
    const MOD = 65521;
    for (let i = 0; i < bytes.length; i++) {
      a = (a + bytes[i]) % MOD;
      b = (b + a) % MOD;
    }
    return ((b << 16) | a) >>> 0;
  };

  // ---- bit-level reader (DEFLATE packs bits LSB-first within each byte) --

  class BitReader {
    constructor(bytes, startByte) {
      this.bytes = bytes;
      this.pos = startByte;
      this.bitBuf = 0;
      this.bitCount = 0;
    }
    readBit() {
      if (this.bitCount === 0) {
        this.bitBuf = this.bytes[this.pos++];
        this.bitCount = 8;
      }
      const bit = this.bitBuf & 1;
      this.bitBuf >>= 1;
      this.bitCount--;
      return bit;
    }
    readBits(n) {
      let value = 0;
      for (let i = 0; i < n; i++) value |= this.readBit() << i;
      return value;
    }
    alignToByte() {
      this.bitBuf = 0;
      this.bitCount = 0;
    }
  }

  // ---- canonical Huffman decoding (RFC 1951 §3.2.2) ---------------------

  const buildHuffman = (lengths) => {
    const maxBits = lengths.reduce((m, l) => Math.max(m, l), 0);
    const blCount = new Array(maxBits + 1).fill(0);
    for (const len of lengths) if (len > 0) blCount[len]++;
    const nextCode = new Array(maxBits + 1).fill(0);
    let code = 0;
    for (let bits = 1; bits <= maxBits; bits++) {
      code = (code + blCount[bits - 1]) << 1;
      nextCode[bits] = code;
    }
    const codesByLength = new Array(maxBits + 1);
    for (let i = 0; i <= maxBits; i++) codesByLength[i] = new Map();
    for (let sym = 0; sym < lengths.length; sym++) {
      const len = lengths[sym];
      if (len > 0) {
        codesByLength[len].set(nextCode[len], sym);
        nextCode[len]++;
      }
    }
    return { maxBits, codesByLength };
  };

  const decodeSymbol = (reader, huff) => {
    let code = 0;
    for (let len = 1; len <= huff.maxBits; len++) {
      code = (code << 1) | reader.readBit();
      const sym = huff.codesByLength[len].get(code);
      if (sym !== undefined) return sym;
    }
    throw new Error("invalid DEFLATE stream: no matching Huffman code");
  };

  const FIXED_LIT_LENGTHS = (() => {
    const lengths = new Array(288);
    for (let i = 0; i <= 143; i++) lengths[i] = 8;
    for (let i = 144; i <= 255; i++) lengths[i] = 9;
    for (let i = 256; i <= 279; i++) lengths[i] = 7;
    for (let i = 280; i <= 287; i++) lengths[i] = 8;
    return lengths;
  })();
  const FIXED_DIST_LENGTHS = new Array(30).fill(5);
  const FIXED_HUFFMAN = { lit: buildHuffman(FIXED_LIT_LENGTHS), dist: buildHuffman(FIXED_DIST_LENGTHS) };

  const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DIST_BASE = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289,
    16385, 24577,
  ];
  const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  const readDynamicHuffman = (reader) => {
    const hlit = reader.readBits(5) + 257;
    const hdist = reader.readBits(5) + 1;
    const hclen = reader.readBits(4) + 4;
    const clLengths = new Array(19).fill(0);
    for (let i = 0; i < hclen; i++) clLengths[CL_ORDER[i]] = reader.readBits(3);
    const clHuff = buildHuffman(clLengths);

    const allLengths = [];
    while (allLengths.length < hlit + hdist) {
      const sym = decodeSymbol(reader, clHuff);
      if (sym < 16) {
        allLengths.push(sym);
      } else if (sym === 16) {
        const repeat = reader.readBits(2) + 3;
        const prev = allLengths[allLengths.length - 1];
        for (let i = 0; i < repeat; i++) allLengths.push(prev);
      } else if (sym === 17) {
        const repeat = reader.readBits(3) + 3;
        for (let i = 0; i < repeat; i++) allLengths.push(0);
      } else {
        const repeat = reader.readBits(7) + 11;
        for (let i = 0; i < repeat; i++) allLengths.push(0);
      }
    }
    return {
      lit: buildHuffman(allLengths.slice(0, hlit)),
      dist: buildHuffman(allLengths.slice(hlit, hlit + hdist)),
    };
  };

  /** Decodes a raw DEFLATE bitstream starting at `startByte`. Returns the
   * decompressed bytes and how many INPUT bytes were consumed, so a
   * container format (gzip/zlib) can locate its trailer immediately after -
   * DEFLATE's own bitstream has no length prefix, so this can only be known
   * by actually decoding it. */
  const inflateRaw = (input, startByte = 0) => {
    const reader = new BitReader(input, startByte);
    let output = new Uint8Array(Math.max(256, input.length * 3));
    let outPos = 0;
    const ensureCapacity = (extra) => {
      if (outPos + extra <= output.length) return;
      const grown = new Uint8Array(Math.max(output.length * 2, outPos + extra));
      grown.set(output.subarray(0, outPos));
      output = grown;
    };

    let final = false;
    while (!final) {
      final = reader.readBit() === 1;
      const type = reader.readBits(2);
      if (type === 0) {
        reader.alignToByte();
        const len = input[reader.pos] | (input[reader.pos + 1] << 8);
        reader.pos += 4; // LEN (2 bytes) + NLEN (2 bytes, not validated)
        ensureCapacity(len);
        output.set(input.subarray(reader.pos, reader.pos + len), outPos);
        outPos += len;
        reader.pos += len;
        continue;
      }
      if (type !== 1 && type !== 2) {
        throw new Error(`invalid DEFLATE block type ${type}`);
      }
      const { lit: litHuff, dist: distHuff } = type === 1 ? FIXED_HUFFMAN : readDynamicHuffman(reader);
      for (;;) {
        const sym = decodeSymbol(reader, litHuff);
        if (sym < 256) {
          ensureCapacity(1);
          output[outPos++] = sym;
        } else if (sym === 256) {
          break;
        } else {
          const lenIdx = sym - 257;
          const length = LENGTH_BASE[lenIdx] + reader.readBits(LENGTH_EXTRA[lenIdx]);
          const distSym = decodeSymbol(reader, distHuff);
          const distance = DIST_BASE[distSym] + reader.readBits(DIST_EXTRA[distSym]);
          ensureCapacity(length);
          let srcPos = outPos - distance;
          for (let i = 0; i < length; i++) output[outPos++] = output[srcPos++];
        }
      }
    }
    return { output: output.subarray(0, outPos), bytesConsumed: reader.pos };
  };

  const readUint32LE = (bytes, offset) =>
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

  /** Real Node's gzip decompression (used by both zlib.Gunzip and
   * zlib.Unzip - see zlib.js's own doc comment for why Unzip, specifically
   * gzip auto-detection, is treated as plain gzip here: every traced input
   * is an npm registry tarball, always gzip, never raw/zlib-wrapped
   * deflate). */
  const gunzip = (bytes) => {
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
      throw new Error("invalid gzip header (bad magic bytes)");
    }
    if (bytes[2] !== 8) {
      throw new Error(`unsupported gzip compression method ${bytes[2]} (only DEFLATE/8 is implemented)`);
    }
    const flags = bytes[3];
    let pos = 10;
    if (flags & 0x04) {
      const xlen = bytes[pos] | (bytes[pos + 1] << 8);
      pos += 2 + xlen;
    }
    if (flags & 0x08) {
      while (bytes[pos] !== 0) pos++;
      pos++;
    }
    if (flags & 0x10) {
      while (bytes[pos] !== 0) pos++;
      pos++;
    }
    if (flags & 0x02) pos += 2; // FHCRC

    const { output, bytesConsumed } = inflateRaw(bytes, pos);
    const expectedCrc = readUint32LE(bytes, bytesConsumed);
    const expectedSize = readUint32LE(bytes, bytesConsumed + 4);
    const actualCrc = crc32(output);
    if (actualCrc !== expectedCrc) {
      throw new Error(`gzip CRC32 mismatch: expected ${expectedCrc.toString(16)}, got ${actualCrc.toString(16)}`);
    }
    if ((output.length >>> 0) !== expectedSize) {
      throw new Error(`gzip size mismatch: expected ${expectedSize}, got ${output.length}`);
    }
    return output;
  };

  /** Real Node's zlib-wrapped ("zlib format", RFC 1950) decompression - a
   * 2-byte header plus a trailing 4-byte big-endian Adler-32, around the
   * same raw DEFLATE stream `inflateRaw` already decodes. */
  const inflateZlib = (bytes) => {
    const cmf = bytes[0];
    if ((cmf & 0x0f) !== 8) {
      throw new Error(`unsupported zlib compression method ${cmf & 0x0f} (only DEFLATE/8 is implemented)`);
    }
    const { output, bytesConsumed } = inflateRaw(bytes, 2);
    const expectedAdler =
      ((bytes[bytesConsumed] << 24) | (bytes[bytesConsumed + 1] << 16) | (bytes[bytesConsumed + 2] << 8) | bytes[bytesConsumed + 3]) >>>
      0;
    const actualAdler = adler32(output);
    if (actualAdler !== expectedAdler) {
      throw new Error(`zlib Adler-32 mismatch: expected ${expectedAdler.toString(16)}, got ${actualAdler.toString(16)}`);
    }
    return output;
  };

  module.exports = { crc32, adler32, inflateRaw, gunzip, inflateZlib };
}
