// zlib — a stream-based subset (createGzip/createGunzip) PLUS the low-level
// synchronous class shapes (Gzip/Gunzip/Unzip/Inflate/InflateRaw/Deflate/
// DeflateRaw) real npm's own dependency tree constructs directly.
//
// Real Node's zlib module wraps a native (C) zlib binding, exposing both a
// stream API and synchronous one-shot functions (gzipSync/gunzipSync). There
// is no native zlib binding here, so this module has two genuinely different
// implementations behind it, covering two genuinely different traced needs:
//
// 1. `createGzip()`/`createGunzip()` (the public, documented streaming API)
//    drive the platform's own CompressionStream/DecompressionStream (real
//    gzip, available in every Worker and in Node >= 18) through a real
//    Transform stream (internal/streams/transform.js — vendored Node
//    source), so `pipe()`-based consumers work exactly as they would
//    against real Node's zlib streams.
//
// 2. `Gzip`/`Gunzip`/`Unzip`/`Inflate`/`InflateRaw`/`Deflate`/`DeflateRaw`
//    (the CLASSES, constructed directly rather than through the factory
//    functions above) back a completely different, undocumented-but-stable
//    contract: real npm's own `minizlib` (used by `tar` to extract a
//    downloaded package tarball) does NOT use zlib's streaming API at all -
//    it reaches into a constructed zlib instance's internal shape (a
//    synchronous `_processChunk(chunk, flushFlag)` method, plus an
//    `._handle` property it temporarily monkey-patches) to decompress each
//    chunk with no async round-trip. That shape has no async equivalent to
//    bridge against (there's no synchronous browser decompression API
//    either), so real, synchronous decompression is implemented from
//    scratch in internal/inflate.js and wrapped here to match minizlib's
//    exact expectations.
//
// Only decompression is implemented for that second contract (Gunzip/
// Unzip/Inflate/InflateRaw) - the matching compression classes (Gzip/
// Deflate/DeflateRaw) exist as real constructors (so `new realZlib[mode]()`
// doesn't throw "is not a constructor" for whichever mode a caller picks),
// but their `_processChunk` throws a clear "not implemented" error if
// actually invoked: extracting a downloaded tarball only ever needs
// decompression, real Node's `zlib.constants.Z_FINISH` (4) is a stable,
// version-independent value from the C zlib library itself (not something
// Node's own API could change), used below to recognize minizlib's
// "this is the last chunk, decompress everything now" signal without
// needing zlib's own constants module at all.
export default function (exports, require, module) {
  "use strict";
  const { Transform } = require("stream");
  const { Buffer } = require("buffer");
  const EventEmitter = require("events");
  const { gunzip, inflateZlib, inflateRaw } = require("internal/inflate");

  const toBytes = (chunk, encoding) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));

  /** A Transform stream whose _transform/_flush feed a WHATWG
   * Compression/DecompressionStream and push whatever bytes it produces. */
  class CodecStream extends Transform {
    constructor(format, StreamCtor) {
      super();
      const codec = new StreamCtor(format);
      this._writer = codec.writable.getWriter();
      this._reader = codec.readable.getReader();
      this._pumpError = null;
      this._pumping = this._pump();
    }

    async _pump() {
      try {
        for (;;) {
          const { done, value } = await this._reader.read();
          if (done) break;
          this.push(Buffer.from(value));
        }
      } catch (error) {
        this._pumpError = error;
      }
    }

    _transform(chunk, encoding, callback) {
      this._writer.write(toBytes(chunk, encoding)).then(
        () => callback(),
        (error) => callback(error),
      );
    }

    _flush(callback) {
      this._writer
        .close()
        .then(() => this._pumping)
        .then(() => callback(this._pumpError))
        .catch(callback);
    }
  }

  const createGzip = () => new CodecStream("gzip", CompressionStream);
  const createGunzip = () => new CodecStream("gzip", DecompressionStream);

  const Z_FINISH = 4;

  const DECODERS = {
    gunzip: (bytes) => gunzip(bytes),
    unzip: (bytes) => gunzip(bytes), // auto-detect: every traced input is gzip
    inflate: (bytes) => inflateZlib(bytes),
    inflateraw: (bytes) => inflateRaw(bytes, 0).output,
  };

  /** Matches the exact shape real npm's own minizlib constructs and drives
   * directly (see this file's own top comment) - NOT a general zlib stream:
   * `_processChunk` buffers every chunk and only actually decompresses once
   * minizlib's own `flush(Z_FINISH)` call arrives, returning the complete
   * output in one shot (see internal/inflate.js's own doc comment for why
   * that's a deliberate simplification, not a partial implementation). */
  class SyncZlibHandle extends EventEmitter {
    constructor(kind) {
      super();
      this._kind = kind;
      this._chunks = [];
      // minizlib reads/reassigns `.close` on this nested object directly
      // (temporarily no-opping it mid-call) - a plain mutable object with
      // its own `close` satisfies that without needing a real second class.
      this._handle = { close: () => {} };
    }

    close() {}

    _processChunk(chunk, flushFlag) {
      if (chunk && chunk.length > 0) this._chunks.push(toBytes(chunk));
      if (flushFlag !== Z_FINISH) return undefined;

      const decode = DECODERS[this._kind];
      if (!decode) {
        throw new Error(`zlib compression ('${this._kind}') is not implemented in this runtime's synchronous zlib shim`);
      }
      const total = this._chunks.reduce((n, c) => n + c.length, 0);
      const combined = new Uint8Array(total);
      let offset = 0;
      for (const c of this._chunks) {
        combined.set(c, offset);
        offset += c.length;
      }
      this._chunks = [];
      return decode(combined);
    }
  }

  class Gzip extends SyncZlibHandle {
    constructor() {
      super("gzip");
    }
  }
  class Gunzip extends SyncZlibHandle {
    constructor() {
      super("gunzip");
    }
  }
  class Unzip extends SyncZlibHandle {
    constructor() {
      super("unzip");
    }
  }
  class Deflate extends SyncZlibHandle {
    constructor() {
      super("deflate");
    }
  }
  class Inflate extends SyncZlibHandle {
    constructor() {
      super("inflate");
    }
  }
  class DeflateRaw extends SyncZlibHandle {
    constructor() {
      super("deflateraw");
    }
  }
  class InflateRaw extends SyncZlibHandle {
    constructor() {
      super("inflateraw");
    }
  }

  module.exports = { createGzip, createGunzip, Gzip, Gunzip, Unzip, Deflate, Inflate, DeflateRaw, InflateRaw };
}
