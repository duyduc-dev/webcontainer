// Registers which Guest Worker owns which listening port, so an external
// dwc.preview.fetch(port, ...) call can be routed to the right process, and
// so `kill <port>` can stop it. Lives in the kernel worker's module scope —
// nodeCommand.ts and builtins.ts register/unregister entries directly since
// they run in that same scope.

type PortEntry = { worker: Worker; onKilled?: () => void };

const portRegistry = new Map<number, PortEntry>();

export function registerPort(port: number, worker: Worker, onKilled?: () => void): void {
  portRegistry.set(port, { worker, onKilled });
}

export function unregisterPort(port: number): void {
  portRegistry.delete(port);
}

export function unregisterWorkerPorts(worker: Worker): void {
  for (const [port, entry] of portRegistry) {
    if (entry.worker === worker) portRegistry.delete(port);
  }
}

export function getPortWorker(port: number): Worker | undefined {
  return portRegistry.get(port)?.worker;
}

// Terminates the worker owning `port` and resolves the original spawning
// call's (otherwise-forever-pending) exit promise via `onKilled`.
export function killPort(port: number): boolean {
  const entry = portRegistry.get(port);
  if (!entry) return false;
  entry.worker.terminate();
  entry.onKilled?.();
  portRegistry.delete(port);
  return true;
}

export type PreviewHttpRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
};

export type PreviewHttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyEncoding: "utf8" | "base64";
};

export function sendPreviewRequest(port: number, req: PreviewHttpRequest): Promise<PreviewHttpResponse> {
  const worker = getPortWorker(port);
  if (!worker) {
    return Promise.resolve({
      status: 502,
      headers: {},
      body: `no server listening on port ${port}`,
      bodyEncoding: "utf8",
    });
  }

  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const handler = (event: MessageEvent<{ type: string; requestId: string } & Partial<PreviewHttpResponse>>) => {
      const message = event.data;
      if (message?.type !== "http-response" || message.requestId !== requestId) return;
      worker.removeEventListener("message", handler);
      resolve({
        status: message.status ?? 502,
        headers: message.headers ?? {},
        body: message.body ?? "",
        bodyEncoding: message.bodyEncoding ?? "utf8",
      });
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ type: "http-request", requestId, ...req });
  });
}
