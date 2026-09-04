import { DWCError, ERR_NOT_IMPLEMENTED } from "../protocol/errors";

type Handler = (payload: unknown) => unknown | Promise<unknown>;

interface Router {
  handle(type: string, handler: Handler): void;
  dispatch(type: string, payload: unknown): Promise<unknown>;
}

/**
 * Handler map keyed by request type, dispatched from the kernel worker's
 * onmessage adapter. Every future worker (FS, Process, Preview) proxies through
 * a handler registered here rather than being reachable directly from the bridge.
 *
 * Reserved, not yet registered: FS_REQUEST, PROCESS_SPAWN, PREVIEW_* (later phases),
 * NET_REQUEST / NPM_INSTALL (Fetcher Worker seam, deferred). Dispatching any of
 * these today falls through to the ERR_NOT_IMPLEMENTED default below.
 */
const createRouter = (): Router => {
  const handlers = new Map<string, Handler>();

  return {
    handle(type, handler) {
      handlers.set(type, handler);
    },
    async dispatch(type, payload) {
      const handler = handlers.get(type);
      if (!handler) {
        throw new DWCError(ERR_NOT_IMPLEMENTED, `Unknown request type: ${type}`);
      }
      return handler(payload);
    },
  };
};

export { createRouter };
export type { Handler, Router };
