import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The worker reads `self.registration`/`self.location` at module load and
// registers its listeners as a side effect, so each test builds a fresh
// global and re-imports it - which doubles as the way to simulate the
// browser terminating an idle Service Worker and restarting it with empty
// module state.
interface FakeClient {
  id: string;
  url: string;
  frameType: string;
  postMessage: (message: unknown) => void;
}

type Listener = (event: never) => void;

const SCOPE = "http://localhost:5176/";

let listeners: Map<string, Listener>;
let windowClients: FakeClient[];
let hostMessages: unknown[];
let passthroughCalls: string[];

function installServiceWorkerGlobals(): void {
  listeners = new Map();
  hostMessages = [];
  passthroughCalls = [];
  windowClients = [];

  const fakeSelf = {
    registration: { scope: SCOPE },
    location: new URL(`${SCOPE}dwc-preview-sw.js`),
    skipWaiting: () => {},
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve(windowClients),
      get: (id: string) => Promise.resolve(windowClients.find((client) => client.id === id)),
    },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };

  Object.assign(globalThis, { self: fakeSelf });
  vi.stubGlobal("fetch", (request: { url: string }) => {
    passthroughCalls.push(request.url);
    return Promise.resolve(new Response("passed through", { headers: { "content-type": "text/html" } }));
  });
}

function addHostPage(): void {
  windowClients.push({
    id: "host",
    url: SCOPE,
    frameType: "top-level",
    postMessage: (message) => hostMessages.push(message),
  });
}

function addPreviewIframe(id: string, previewPath: string): void {
  windowClients.push({
    id,
    url: `${SCOPE.slice(0, -1)}${previewPath}`,
    frameType: "nested",
    postMessage: () => {},
  });
}

interface FetchEventResult {
  handled: boolean;
  response: Promise<Response> | undefined;
}

function dispatchFetch(
  url: string,
  options: { clientId?: string; resultingClientId?: string; mode?: string } = {},
): FetchEventResult {
  let response: Promise<Response> | undefined;
  const event = {
    request: {
      url,
      method: "GET",
      mode: options.mode ?? "cors",
      headers: new Headers(),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    },
    clientId: options.clientId ?? "",
    resultingClientId: options.resultingClientId ?? "",
    respondWith: (value: Promise<Response>) => {
      response = value;
    },
    waitUntil: () => {},
  };

  listeners.get("fetch")?.(event as never);
  return { handled: response !== undefined, response };
}

// The worker reaches the host page asynchronously (it awaits
// clients.matchAll() first), so a relayed request only shows up a few
// microtasks after the fetch event was dispatched.
async function nextRelay(): Promise<{ requestId: string; port: number; path: string; previewId?: string }> {
  for (let attempt = 0; attempt < 50 && hostMessages.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const relayed = hostMessages.at(-1);
  if (!relayed) throw new Error("no request was relayed to the host page");
  return relayed as { requestId: string; port: number; path: string; previewId?: string };
}

// Answers whatever request the worker most recently relayed to the host
// page, the way Preview.ts's handleRelay() would.
function answerRelay(body: string, contentType = "text/javascript"): void {
  const relayRequest = hostMessages.at(-1) as { requestId: string; port: number; path: string };
  listeners.get("message")?.({
    data: {
      requestId: relayRequest.requestId,
      ok: true,
      result: {
        status: 200,
        statusMessage: "OK",
        headers: { "content-type": contentType },
        body: new TextEncoder().encode(body),
      },
    },
  } as never);
}

beforeEach(async () => {
  installServiceWorkerGlobals();
  vi.resetModules();
  await import("./PreviewServiceWorker");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PreviewServiceWorker request routing", () => {
  it("relays a prefixed request to the guest port it names", async () => {
    addHostPage();
    const { handled, response } = dispatchFetch(`${SCOPE}__dwc_preview__/studio/5173/index.html`, {
      resultingClientId: "iframe",
      mode: "navigate",
    });

    expect(handled).toBe(true);
    expect(await nextRelay()).toMatchObject({ port: 5173, path: "/index.html", previewId: "studio" });

    answerRelay("console.log(1)");
    expect(await (await response!).text()).toBe("console.log(1)");
  });

  it("routes a later prefix-less request from the same client to the same port", async () => {
    addHostPage();
    dispatchFetch(`${SCOPE}__dwc_preview__/studio/5173/`, { resultingClientId: "iframe", mode: "navigate" });
    await nextRelay();
    answerRelay("<html></html>", "text/html");
    hostMessages.length = 0;

    const { handled } = dispatchFetch(`${SCOPE}@vite/client`, { clientId: "iframe" });

    expect(handled).toBe(true);
    expect(await nextRelay()).toMatchObject({ port: 5173, path: "/@vite/client" });
    expect(passthroughCalls).toEqual([]);
  });

  // The regression this test exists for: the browser terminates an idle
  // Service Worker and restarts it with empty module state while the iframe
  // is still alive, so anything remembered from the initial navigation is
  // gone. Vite's HMR re-imports are prefix-less and were escaping to the
  // host application, which answers them with its own index.html - the
  // import then fails with "Failed to fetch dynamically imported module".
  it("recovers the port from the client's own URL after a worker restart", async () => {
    addHostPage();
    addPreviewIframe("iframe", "/__dwc_preview__/studio/5173/");

    const { handled } = dispatchFetch(`${SCOPE}src/App.vue?t=1`, { clientId: "iframe" });

    expect(handled).toBe(true);
    expect(await nextRelay()).toMatchObject({ port: 5173, path: "/src/App.vue?t=1", previewId: "studio" });
    expect(passthroughCalls).toEqual([]);
  });

  it("caches the recovered port so only the first request pays for the lookup", async () => {
    addHostPage();
    addPreviewIframe("iframe", "/__dwc_preview__/studio/5173/");

    dispatchFetch(`${SCOPE}src/main.ts`, { clientId: "iframe" });
    await nextRelay();
    const swClients = (globalThis as unknown as { self: { clients: { get: (id: string) => Promise<FakeClient | undefined> } } })
      .self.clients;
    const getSpy = vi.spyOn(swClients, "get");

    const { handled } = dispatchFetch(`${SCOPE}src/App.vue`, { clientId: "iframe" });

    expect(handled).toBe(true);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("passes a host page's own request through instead of relaying it", async () => {
    addHostPage();

    const { handled, response } = dispatchFetch(`${SCOPE}src/main.tsx`, { clientId: "host" });

    expect(handled).toBe(true);
    expect(await (await response!).text()).toBe("passed through");

    expect(passthroughCalls).toEqual([`${SCOPE}src/main.tsx`]);
    expect(hostMessages).toEqual([]);
  });

  it("leaves a prefix-less navigation alone entirely", () => {
    addHostPage();

    expect(dispatchFetch(`${SCOPE}some/route`, { resultingClientId: "new", mode: "navigate" }).handled).toBe(false);
  });

  it("leaves a cross-origin request alone entirely", () => {
    addHostPage();
    addPreviewIframe("iframe", "/__dwc_preview__/studio/5173/");

    expect(dispatchFetch("https://cdn.example.com/lib.js", { clientId: "iframe" }).handled).toBe(false);
  });
});
