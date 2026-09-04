import { describe, expect, it } from "vitest";
import { createForwardingWritableStream, createPushableReadableStream } from "./streams";

const readAll = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
};

describe("createPushableReadableStream", () => {
  it("delivers pushed chunks to a reader in order", async () => {
    const { stream, push, close } = createPushableReadableStream();

    push(new Uint8Array([1]));
    push(new Uint8Array([2]));
    close();

    const chunks = await readAll(stream);
    expect(chunks).toEqual([new Uint8Array([1]), new Uint8Array([2])]);
  });
});

describe("createForwardingWritableStream", () => {
  it("forwards each written chunk to the sink", async () => {
    const received: Uint8Array[] = [];
    const writable = createForwardingWritableStream((chunk) => received.push(chunk));
    const writer = writable.getWriter();

    await writer.write(new Uint8Array([9]));
    await writer.close();

    expect(received).toEqual([new Uint8Array([9])]);
  });
});
