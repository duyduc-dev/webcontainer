import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreviewAPI } from "./Preview";

const originalNavigator = globalThis.navigator;

describe("createPreviewAPI - url()", () => {
  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", { value: originalNavigator, configurable: true });
  });

  it("returns a root-relative URL before enable() has ever been called", () => {
    const preview = createPreviewAPI(vi.fn());
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

    const preview = createPreviewAPI(vi.fn());
    await preview.enable({ swUrl: "/my-repo/dwc-preview-sw.js", scope: "/my-repo/" });

    expect(preview.url(3000)).toBe("/my-repo/__dwc_preview__/3000/");
  });

  it("uses the registration's own resolved scope even when the registration API returns a different one than requested", async () => {
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

    const preview = createPreviewAPI(vi.fn());
    await preview.enable({ swUrl: "/dwc-preview-sw.js", scope: "/ignored/" });

    expect(preview.url(3000)).toBe("/__dwc_preview__/3000/");
  });
});
