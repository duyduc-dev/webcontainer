import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin, type Connect } from "vite";
import { fileURLToPath, URL } from "node:url";

const PREVIEW_SW_PATH = "/dwc-preview-sw.js";

function previewServiceWorkerHeaders(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url === PREVIEW_SW_PATH) {
      res.setHeader("Service-Worker-Allowed", "/");
    }
    next();
  };

  return {
    name: "duckwc-preview-sw-headers",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

function crossOriginIsolationHeaders(): Plugin {
  const middleware = (
    _req: unknown,
    res: { setHeader(name: string, value: string): void },
    next: () => void,
  ) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
  };

  return {
    name: "duckwc-cross-origin-isolation-headers",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    previewServiceWorkerHeaders(),
    crossOriginIsolationHeaders(),
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
