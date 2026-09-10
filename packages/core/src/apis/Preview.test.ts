import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewAPI } from "./Preview";

const originalNavigator = globalThis.navigator;
const originalWindow = (globalThis as any).window;
const originalLocation = (globalThis as any).location;

// enable() also registers a `window.addEventListener("message", ...)`
// listener and reads `location.origin` (for the WS-relay channel to a
// preview iframe) - these tests run in vitest's "node" environment, which
// has neither by default, so every test whose enable() actually resolves
// needs both stubbed the same way `navigator` already is below.
const stubBrowserGlobals = (): { addEventListener: ReturnType<typeof vi.fn> } => {
  const addEventListener = vi.fn();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener } });
  Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "http://localhost:5173" } });
  return { addEventListener };
};

const restoreBrowserGlobals = (): void => {
  Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  Object.defineProperty(globalThis, "location", { value: originalLocation, configurable: true });
};

/** A minimal fake for the `on(type, handler)` Subscriber createPreviewAPI
 * takes - records the handler per event type so a test can simulate the
 * kernel pushing a `preview:ws-message`/`preview:ws-close` event. */
const fakeOn = () => {
  const handlers = new Map<string, (payload?: any) => void>();
  const on = vi.fn((type: string, handler: (payload?: any) => void) => {
    handlers.set(type, handler);
    return () => handlers.delete(type);
  });
  return { on, emit: (type: string, payload?: unknown) => handlers.get(type)?.(payload) };
};

describe("createPreviewAPI - url()", () => {
  afterEach(restoreBrowserGlobals);

  it("returns a root-relative URL before enable() has ever been called", () => {
    const preview = createPreviewAPI(vi.fn(), vi.fn());
    expect(preview.url(3000)).toBe("/__dwc_preview__/3000/");
    expect(preview.url(3000, "/index.html")).toBe("/__dwc_preview__/3000/index.html");
  });

  // Traced need: a host app registered under a non-root scope (e.g. a
  // GitHub Pages project page at "/my-repo/") needs that prefix on the
  // returned URL too, or it falls outside the Service Worker's own
  // registered scope and is never actually intercepted - confirmed live
  // (the iframe fell through to the host app's own router instead of the
  // guest server) before this fix.
  it("prefixes the URL with the Service Worker's actual registered scope once enable() resolves", async () => {
    stubBrowserGlobals();
    const registration = { scope: "http://localhost:5173/my-repo/" };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        serviceWorker: {
          register: vi.fn().mockResolvedValue(registration),
          ready: Promise.resolve(registration),
          addEventListener: vi.fn(),
        },
      },
    });

    const preview = createPreviewAPI(vi.fn(), vi.fn());
    await preview.enable({ swUrl: "/my-repo/dwc-preview-sw.js", scope: "/my-repo/" });

    expect(preview.url(3000)).toBe("/my-repo/__dwc_preview__/3000/");
  });

  it("uses the registration's own resolved scope even when the registration API returns a different one than requested", async () => {
    stubBrowserGlobals();
    // The browser, not the caller, has the final say on the actual scope -
    // url() must trust ServiceWorkerRegistration.scope, not options.scope.
    const registration = { scope: "http://localhost:5173/" };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        serviceWorker: {
          register: vi.fn().mockResolvedValue(registration),
          ready: Promise.resolve(registration),
          addEventListener: vi.fn(),
        },
      },
    });

    const preview = createPreviewAPI(vi.fn(), vi.fn());
    await preview.enable({ swUrl: "/dwc-preview-sw.js", scope: "/ignored/" });

    expect(preview.url(3000)).toBe("/__dwc_preview__/3000/");
  });
});

describe("createPreviewAPI - WebSocket relay (dwc:ws-* iframe messages)", () => {
  afterEach(restoreBrowserGlobals);

  const enablePreview = async (request: (type: string, payload?: unknown) => Promise<any>, on: (type: string, handler: (payload?: any) => void) => () => void) => {
    const { addEventListener } = stubBrowserGlobals();
    const registration = { scope: "http://localhost:5173/" };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { serviceWorker: { register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration), addEventListener: vi.fn() } },
    });

    const preview = createPreviewAPI(request, on);
    await preview.enable({ swUrl: "/dwc-preview-sw.js" });

    const call = addEventListener.mock.calls.find(([type]) => type === "message");
    const handleIframeMessage = call?.[1] as (event: { origin: string; data: unknown; source: unknown }) => void;
    return { preview, handleIframeMessage };
  };

  it("forwards a dwc:ws-open message to PREVIEW_WS_OPEN and posts an ack back to the source", async () => {
    const request = vi.fn().mockResolvedValue({ wsId: 42, protocol: "vite-hmr" });
    const { handleIframeMessage } = await enablePreview(request, vi.fn());

    const postMessage = vi.fn();
    handleIframeMessage({
      origin: "http://localhost:5173",
      data: { type: "dwc:ws-open", requestId: "r1", port: 5173, path: "/ws", protocols: ["vite-hmr"] },
      source: { postMessage },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(request).toHaveBeenCalledWith("PREVIEW_WS_OPEN", { port: 5173, path: "/ws", protocols: ["vite-hmr"] });
    expect(postMessage).toHaveBeenCalledWith({ type: "dwc:ws-open-ack", requestId: "r1", wsId: 42, protocol: "vite-hmr" }, "http://localhost:5173");
  });

  it("posts dwc:ws-open-error back to the source when PREVIEW_WS_OPEN rejects", async () => {
    const request = vi.fn().mockRejectedValue(new Error("nothing is listening"));
    const { handleIframeMessage } = await enablePreview(request, vi.fn());

    const postMessage = vi.fn();
    handleIframeMessage({ origin: "http://localhost:5173", data: { type: "dwc:ws-open", requestId: "r1", port: 9999, path: "/ws" }, source: { postMessage } });
    await Promise.resolve();
    await Promise.resolve();

    expect(postMessage).toHaveBeenCalledWith({ type: "dwc:ws-open-error", requestId: "r1", error: expect.stringContaining("nothing is listening") }, "http://localhost:5173");
  });

  it("forwards dwc:ws-send and dwc:ws-close to their matching request types", async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    const { handleIframeMessage } = await enablePreview(request, vi.fn());

    handleIframeMessage({ origin: "http://localhost:5173", data: { type: "dwc:ws-send", wsId: 1, data: "hello" }, source: { postMessage: vi.fn() } });
    handleIframeMessage({ origin: "http://localhost:5173", data: { type: "dwc:ws-close", wsId: 1, code: 1000, reason: "bye" }, source: { postMessage: vi.fn() } });

    expect(request).toHaveBeenCalledWith("PREVIEW_WS_SEND", { wsId: 1, data: "hello" });
    expect(request).toHaveBeenCalledWith("PREVIEW_WS_CLOSE", { wsId: 1, code: 1000, reason: "bye" });
  });

  it("ignores messages from a different origin", async () => {
    const request = vi.fn();
    const { handleIframeMessage } = await enablePreview(request, vi.fn());

    handleIframeMessage({ origin: "https://evil.example", data: { type: "dwc:ws-open", requestId: "r1", port: 1, path: "/" }, source: { postMessage: vi.fn() } });

    expect(request).not.toHaveBeenCalled();
  });

  it("routes a preview:ws-message kernel event to the iframe that opened that wsId", async () => {
    const request = vi.fn().mockResolvedValue({ wsId: 7, protocol: "" });
    const { on, emit } = fakeOn();
    const { handleIframeMessage } = await enablePreview(request, on);

    const postMessage = vi.fn();
    handleIframeMessage({ origin: "http://localhost:5173", data: { type: "dwc:ws-open", requestId: "r1", port: 5173, path: "/ws" }, source: { postMessage } });
    await Promise.resolve();
    await Promise.resolve();

    emit("preview:ws-message", { wsId: 7, data: "hmr update" });

    expect(postMessage).toHaveBeenCalledWith({ type: "dwc:ws-message", wsId: 7, data: "hmr update" }, "http://localhost:5173");
  });

  it("routes a preview:ws-close kernel event to the right iframe and forgets the wsId afterward", async () => {
    const request = vi.fn().mockResolvedValue({ wsId: 8, protocol: "" });
    const { on, emit } = fakeOn();
    const { handleIframeMessage } = await enablePreview(request, on);

    const postMessage = vi.fn();
    handleIframeMessage({ origin: "http://localhost:5173", data: { type: "dwc:ws-open", requestId: "r1", port: 5173, path: "/ws" }, source: { postMessage } });
    await Promise.resolve();
    await Promise.resolve();

    emit("preview:ws-close", { wsId: 8, code: 1006, reason: "connection closed" });
    expect(postMessage).toHaveBeenCalledWith({ type: "dwc:ws-close", wsId: 8, code: 1006, reason: "connection closed" }, "http://localhost:5173");

    // A second close event for the same, now-forgotten wsId has nowhere to
    // go - must not throw.
    postMessage.mockClear();
    expect(() => emit("preview:ws-close", { wsId: 8, code: 1006, reason: "connection closed" })).not.toThrow();
    expect(postMessage).not.toHaveBeenCalled();
  });
});
