// A deliberately minimal http.createServer()/listen() shim. There's no real
// TCP in a Worker: `listen(port)` just tells the kernel worker (via onListen)
// that this process now owns that port, and incoming requests arrive as
// "http-request" postMessages (see GuestWorker.ts's handleHttpRequest) rather
// than real socket connections. No streaming request/response bodies yet —
// everything is buffered.

export type HttpRequestListener = (req: IncomingMessageLike, res: ServerResponseLike) => void;

export type IncomingMessageLike = {
  method: string;
  url: string;
  headers: Record<string, string>;
};

export type ServerResponseLike = {
  statusCode: number;
  headers: Record<string, string>;
  setHeader(name: string, value: string): void;
  writeHead(status: number, headers?: Record<string, string>): void;
  write(chunk: unknown): void;
  end(chunk?: unknown): void;
};

export function createHttpModule(onListen: (port: number, handler: HttpRequestListener) => void) {
  function createServer(handler: HttpRequestListener) {
    const server = {
      listen(port: number, cb?: () => void) {
        onListen(port, handler);
        if (cb) cb();
        return server;
      },
    };
    return server;
  }

  return { createServer };
}
