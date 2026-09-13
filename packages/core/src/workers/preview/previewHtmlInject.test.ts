import { describe, expect, it } from "vitest";
import { injectPreviewWsBootstrap, rewritePreviewRootUrls } from "./previewHtmlInject";

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
    expect(result).toContain("__dwcPreviewSocketCount");
  });

  it("keeps close messages on the preview channel that opened the socket", () => {
    const result = injectPreviewWsBootstrap("<head></head>");

    expect(result).toContain('type: "dwc:ws-send", previewId: PREVIEW_ID');
    expect(result).toContain('type: "dwc:ws-close", previewId: PREVIEW_ID');
  });

  it("routes root-relative HTML attributes through the preview", () => {
    const result = rewritePreviewRootUrls(
      '<script src="/@vite/client"></script><link href="/src/style.css"><script>import \'/src/main.jsx\'</script><style>x { background: url(/logo.svg) }</style>',
      "/webcontainer/__dwc_preview__/react-vite/5173/",
    );

    expect(result).toContain('src="/webcontainer/__dwc_preview__/react-vite/5173/@vite/client"');
    expect(result).toContain('href="/webcontainer/__dwc_preview__/react-vite/5173/src/style.css"');
    expect(result).toContain("import '/src/main.jsx'");
    expect(result).toContain("url(/logo.svg)");
  });

  it("leaves protocol-relative URLs untouched", () => {
    expect(rewritePreviewRootUrls('<script src="//cdn.example/app.js"></script>', "/preview/")).toContain(
      'src="//cdn.example/app.js"',
    );
  });
});
