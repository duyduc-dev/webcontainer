type ChunkSink = (chunk: Uint8Array) => void;

interface PushableReadableStream {
  stream: ReadableStream<Uint8Array>;
  push: ChunkSink;
  close: () => void;
}

/** A ReadableStream<Uint8Array> that callers feed via push()/close() - the postMessage-to-stream half. */
const createPushableReadableStream = (): PushableReadableStream => {
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });

  return {
    stream,
    push: (chunk) => controllerRef?.enqueue(chunk),
    close: () => controllerRef?.close(),
  };
};

/** A WritableStream<Uint8Array> that forwards each written chunk to sink - the stream-to-postMessage half. */
const createForwardingWritableStream = (sink: ChunkSink): WritableStream<Uint8Array> =>
  new WritableStream<Uint8Array>({
    write(chunk) {
      sink(chunk);
    },
  });

export { createForwardingWritableStream, createPushableReadableStream };
export type { ChunkSink, PushableReadableStream };
