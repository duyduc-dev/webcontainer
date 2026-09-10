import { describe, expect, it } from "vitest";
import { injectPreviewWsBootstrap } from "./previewHtmlInject";

describe("injectPreviewWsBootstrap", () => {
  it("inserts the bootstrap script right after an opening <head> tag", () => {
    const html = "<!doctype html><html><head><title>my-app</title></head><body></body></html>";
    const result = injectPreviewWsBootstrap(html);

    expect(result.indexOf("<script>")).toBe(html.indexOf("<head>") + "<head>".length);
    expect(result).toContain("</head>");
    expect(result).toContain("<title>my-app</title>");
  });

  it("handles a <head> tag with attributes", () => {
    const html = '<html><head lang="en"><title>x</title></head></html>';
    const result = injectPreviewWsBootstrap(html);

    expect(result.indexOf("<script>")).toBe(html.indexOf('<head lang="en">') + '<head lang="en">'.length);
  });

  it("prepends to the document when there is no <head> tag at all", () => {
    const html = "<body>no head here</body>";
    const result = injectPreviewWsBootstrap(html);

    expect(result.startsWith("<script>")).toBe(true);
    expect(result).toContain(html);
  });

  it("includes the idempotency guard and WebSocket-replacement code", () => {
    const result = injectPreviewWsBootstrap("<head></head>");
    expect(result).toContain("__dwcRealWebSocket");
    expect(result).toContain("window.WebSocket = DwcWebSocket");
  });
});
