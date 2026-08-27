import { Connect, defineConfig, Plugin } from "vite";

// dwc-preview-sw.js is served from public/ (the origin root), so its default
// max scope is already "/" — but Service-Worker-Allowed is set anyway so the
// demo stays correct if it's ever served from a nested path instead. See the
// comment on Preview.enable() for why this matters.
const PREVIEW_SW_PATH = "/dwc-preview-sw.js";

function previewServiceWorkerHeaders(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url === PREVIEW_SW_PATH) {
      res.setHeader("Service-Worker-Allowed", "/");
    }
    next();
  };

  return {
    name: "dwc-preview-sw-headers",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [previewServiceWorkerHeaders()],
});
