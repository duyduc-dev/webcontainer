// Hand-written, not vendored: real Node's lib/string_decoder.js exists to
// solve exactly one problem - decoding a multi-byte UTF-8 (or UTF-16/base64)
// sequence that gets split across two separate `write()` chunks - which the
// standard `TextDecoder` API already solves natively via its `{stream:
// true}` mode (buffers incomplete trailing bytes until the next `decode()`
// call). Traced need: minipass (used throughout npm's own dependency tree)
// requires `string_decoder` directly for its own encoding support.
const toUint8Array = (input: Uint8Array | ArrayBufferLike | number[]): Uint8Array =>
  input instanceof Uint8Array ? input : new Uint8Array(input as ArrayBufferLike);

class StringDecoder {
  #decoder: TextDecoder;

  constructor(encoding = "utf8") {
    this.#decoder = new TextDecoder(encoding);
  }

  write(buffer: Uint8Array): string {
    return this.#decoder.decode(toUint8Array(buffer), { stream: true });
  }

  end(buffer?: Uint8Array): string {
    return buffer ? this.#decoder.decode(toUint8Array(buffer)) : this.#decoder.decode();
  }
}

const createStringDecoderModule = () => ({ StringDecoder });

export { createStringDecoderModule };
