// zlib — a minimal, stream-based subset (createGzip/createGunzip only).
//
// Real Node's zlib module wraps a native (C) zlib binding, exposing both a
// stream API and synchronous one-shot functions (gzipSync/gunzipSync). There
// is no native zlib binding here; instead this drives the platform's own
// CompressionStream/DecompressionStream (real gzip, available in every Worker
// and in Node >= 18) through a real Transform stream (internal/streams/
// transform.js — vendored Node source), so `pipe()`-based consumers work
// exactly as they would against real Node's zlib streams.
//
// Deliberately NOT implemented: the synchronous one-shot functions
// (gzipSync/gunzipSync/etc). Compression is inherently async in a Worker (no
// synchronous CompressionStream API exists, and there's no second thread to
// block on the way the sync fs bridge does) - a caller needing a one-shot
// buffer can `pipeline(Readable.from([buf]), zlib.createGzip(), writable)`.
// deflate/deflateRaw/inflate/inflateRaw are also out of scope for now (easy to
// add later: CompressionStream/DecompressionStream already support those
// formats by name) - added only once something actually needs them.
export default function (exports, require, module, process, internalBinding, primordials) {
  "use strict";
  const { Transform } = require("stream");
  const { Buffer } = require("buffer");

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

  module.exports = { createGzip, createGunzip, Gzip: CodecStream, Gunzip: CodecStream };
}
