import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { defineConfig, type Plugin } from "vite";

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
    crossOriginIsolationHeaders(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
});
