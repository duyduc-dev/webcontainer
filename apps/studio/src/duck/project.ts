import { ensureNpm, getDwc, pipeToLog, pipeUntilMarker, waitForListen } from "./session";
import {
  ANGULAR_APP_COMPONENT_TS,
  ANGULAR_INDEX_HTML,
  ANGULAR_MAIN_TS,
  ANGULAR_VERSION,
  BABEL_STANDALONE_VERSION as ANGULAR_BABEL_STANDALONE_VERSION,
  VITE_VERSION as ANGULAR_VITE_VERSION,
  ZONE_VERSION,
  angularViteConfig,
} from "./angularTemplate";
import {
  BABEL_STANDALONE_VERSION,
  REACT_TS_INDEX_HTML,
  REACT_TS_SHIM_DIR,
  REACT_TS_SHIMS,
  REACT_VERSION,
  VITE_VERSION,
  reactTsViteConfig,
} from "./reactTsTemplate";
import {
  PLUGIN_VUE_VERSION,
  VITE_VERSION as VUE_VITE_VERSION,
  VUE_TSCONFIG_VERSION,
  VUE_TS_SETUP_SCRIPT_PATH,
  VUE_VERSION,
  vueTsSetupScript,
  vueTsViteConfig,
} from "./vueTsTemplate";

export type ProjectKind = "blank" | "vite-vanilla" | "vite-react-ts" | "vite-vue-ts" | "vite-angular-ts";

export interface Project {
  id: string;
  name: string;
  path: string;
  kind: ProjectKind;
  createdAt: number;
}

export type RunStatus = "idle" | "installing" | "starting" | "ready" | "error" | "no-script";

// dwc.shell.spawn()'s kernel-side default env is skipped entirely once a
// caller supplies its own `env` object (not merged) - so PATH has to be
// repeated here alongside FORCE_COLOR, or command resolution breaks. Guest
// processes report `isTTY: false` (a deliberate choice - see PROGRESS.md:
// a real TTY would make npm/vite emit cursor-repositioning progress-bar
// sequences a byte-stream relay can't render), so color-aware CLIs like
// npm/vite (via chalk/picocolors) correctly suppress ANSI color by default.
// FORCE_COLOR is the standard override those libraries check first, ahead
// of TTY detection - this restores real colored output without touching
// isTTY or risking the progress-bar redraw problem.
export const SHELL_ENV = { PATH: "/bin", FORCE_COLOR: "1" };

export interface RunCallbacks {
  onLog(stream: "install" | "dev", text: string): void;
  onStatus(status: RunStatus): void;
}

const RECENTS_KEY = "duck-studio-recents";
const MAX_RECENTS = 8;

export function loadRecentProjects(): Project[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Project[]) : [];
  } catch {
    return [];
  }
}

function saveRecentProject(project: Project): void {
  try {
    const existing = loadRecentProjects().filter((p) => p.id !== project.id);
    const next = [project, ...existing].slice(0, MAX_RECENTS);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled - recents just won't persist across reloads.
  }
}

const slugify = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "my-app";

export async function createBlankProject(name: string): Promise<Project> {
  const dwc = getDwc();
  const slug = slugify(name);
  const path = `/${slug}`;

  await dwc.fs.mkdir(`${path}/src`, { recursive: true });
  await dwc.fs.writeFile(
    `${path}/package.json`,
    JSON.stringify({ name: slug, version: "0.0.0", private: true, type: "module", scripts: {} }, null, 2),
  );
  await dwc.fs.writeFile(
    `${path}/index.html`,
    `<!doctype html>\n<html>\n  <head>\n    <meta charset="utf-8" />\n    <title>${slug}</title>\n  </head>\n  <body>\n    <script type="module" src="/src/main.js"></script>\n  </body>\n</html>\n`,
  );
  await dwc.fs.writeFile(`${path}/src/main.js`, `console.log("Hello from ${slug}!");\n`);

  const project: Project = { id: crypto.randomUUID(), name: slug, path, kind: "blank", createdAt: Date.now() };
  saveRecentProject(project);
  return project;
}

// Every template offered here is a recipe this repo has actually verified
// working end-to-end. This one is examples/playground's own proven Vite
// 8.0.0 + explicit WASI Rolldown binding + esbuild-wasm/@rollup/wasm-node
// overrides + noDiscovery combo - see PROGRESS.md items 7/8/9/14.
export async function createViteVanillaProject(name: string, onLog: (text: string) => void): Promise<Project> {
  const dwc = getDwc();
  await ensureNpm();
  const slug = slugify(name);

  const scaffold = await dwc.shell.exec(`npm create vite@latest ${slug} -- --template vanilla`);
  onLog(scaffold.output);

  const path = `/${slug}`;
  const packageJsonPath = `${path}/package.json`;
  const scaffoldedPkg = JSON.parse(new TextDecoder().decode(await dwc.fs.readFile(packageJsonPath))) as {
    devDependencies?: Record<string, string>;
    overrides?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  scaffoldedPkg.devDependencies = {
    ...scaffoldedPkg.devDependencies,
    vite: "8.0.0",
    "@rolldown/binding-wasm32-wasi": "1.0.0-rc.9",
  };
  scaffoldedPkg.overrides = {
    ...scaffoldedPkg.overrides,
    esbuild: "npm:esbuild-wasm@^0.25.0",
    rollup: "npm:@rollup/wasm-node@^4.43.0",
  };
  scaffoldedPkg.scripts = { ...scaffoldedPkg.scripts, dev: "vite --configLoader native" };
  await dwc.fs.writeFile(packageJsonPath, JSON.stringify(scaffoldedPkg, null, 2));

  await dwc.fs.writeFile(
    `${path}/vite.config.mjs`,
    `export default {\n  optimizeDeps: {\n    noDiscovery: true,\n  },\n};\n`,
  );

  const project: Project = { id: crypto.randomUUID(), name: slug, path, kind: "vite-vanilla", createdAt: Date.now() };
  saveRecentProject(project);
  return project;
}

// React + TypeScript, on the Vite 7 recipe this repo has verified live -
// see reactTsTemplate.ts for why it deliberately differs from the vanilla
// template's Vite 8/Rolldown setup above.
export async function createViteReactTsProject(name: string, onLog: (text: string) => void): Promise<Project> {
  const dwc = getDwc();
  await ensureNpm();
  const slug = slugify(name);
  const path = `/${slug}`;

  // create-vite 7 scaffolds a Vite 7-shaped project, matching the Vite
  // version pinned below.
  const scaffold = await dwc.shell.exec(`npm create vite@7.0.0 ${slug} -- --template react-ts`);
  onLog(scaffold.output);

  const packageJsonPath = `${path}/package.json`;
  const scaffoldedPkg = JSON.parse(new TextDecoder().decode(await dwc.fs.readFile(packageJsonPath))) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    overrides?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  // The scaffold's own devDependencies are replaced rather than extended:
  // @vitejs/plugin-react (Babel via Node's loader), typescript and the
  // eslint toolchain are all unused here - the config below transforms
  // TypeScript and JSX with @babel/standalone instead - and skipping them
  // keeps the install inside this sandbox as short as it can be.
  scaffoldedPkg.dependencies = {
    react: REACT_VERSION,
    "react-dom": REACT_VERSION,
  };
  scaffoldedPkg.devDependencies = {
    "@babel/standalone": BABEL_STANDALONE_VERSION,
    vite: VITE_VERSION,
  };
  scaffoldedPkg.overrides = {
    ...scaffoldedPkg.overrides,
    esbuild: "npm:esbuild-wasm@^0.25.0",
    // Vite 7 loads Rollup's parser while booting its dev server; the WASM
    // build keeps that parser runnable in a browser sandbox.
    rollup: "npm:@rollup/wasm-node@^4.43.0",
  };
  scaffoldedPkg.scripts = {
    ...scaffoldedPkg.scripts,
    dev: "vite --configLoader native",
    // The scaffolded script runs `tsc -b` first, and TypeScript is not
    // installed here - type stripping happens in the Babel transform.
    build: "vite build",
  };
  await dwc.fs.writeFile(packageJsonPath, JSON.stringify(scaffoldedPkg, null, 2));

  // Vite prefers vite.config.js over the scaffolded vite.config.ts, but
  // leaving a config importing @vitejs/plugin-react behind would be a trap
  // for anyone who opens it in the editor.
  await dwc.fs.rm(`${path}/vite.config.ts`).catch(() => {});
  await dwc.fs.writeFile(`${path}/vite.config.js`, reactTsViteConfig(path));
  await dwc.fs.writeFile(`${path}/index.html`, REACT_TS_INDEX_HTML);

  await dwc.fs.mkdir(`${path}/${REACT_TS_SHIM_DIR}`, { recursive: true });
  for (const [file, contents] of Object.entries(REACT_TS_SHIMS)) {
    await dwc.fs.writeFile(`${path}/${REACT_TS_SHIM_DIR}/${file}`, contents);
  }

  const project: Project = { id: crypto.randomUUID(), name: slug, path, kind: "vite-react-ts", createdAt: Date.now() };
  saveRecentProject(project);
  return project;
}

// Vue + TypeScript. Shares the React template's Vite 7 pinning and WASM
// aliases; see vueTsTemplate.ts for the two things it does differently.
export async function createViteVueTsProject(name: string, onLog: (text: string) => void): Promise<Project> {
  const dwc = getDwc();
  await ensureNpm();
  const slug = slugify(name);
  const path = `/${slug}`;

  const scaffold = await dwc.shell.exec(`npm create vite@7.0.0 ${slug} -- --template vue-ts`);
  onLog(scaffold.output);

  const packageJsonPath = `${path}/package.json`;
  const scaffoldedPkg = JSON.parse(new TextDecoder().decode(await dwc.fs.readFile(packageJsonPath))) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    overrides?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  scaffoldedPkg.dependencies = { vue: VUE_VERSION };
  // vue-tsc and typescript are dropped for the same reason the React
  // template drops them: nothing here type-checks, the types are stripped.
  scaffoldedPkg.devDependencies = {
    "@vitejs/plugin-vue": PLUGIN_VUE_VERSION,
    "@vue/tsconfig": VUE_TSCONFIG_VERSION,
    vite: VUE_VITE_VERSION,
  };
  scaffoldedPkg.overrides = {
    ...scaffoldedPkg.overrides,
    esbuild: "npm:esbuild-wasm@^0.25.0",
    rollup: "npm:@rollup/wasm-node@^4.43.0",
  };
  scaffoldedPkg.scripts = {
    ...scaffoldedPkg.scripts,
    // Absolute, not relative: this line is handed to `sh -c` and resolved
    // by the runtime's own PATH/entry-point resolution rather than by a
    // shell that tracks a working directory.
    dev: `node ${path}/${VUE_TS_SETUP_SCRIPT_PATH} && vite --configLoader native`,
    build: `node ${path}/${VUE_TS_SETUP_SCRIPT_PATH} && vite build`,
  };
  await dwc.fs.writeFile(packageJsonPath, JSON.stringify(scaffoldedPkg, null, 2));

  await dwc.fs.rm(`${path}/vite.config.ts`).catch(() => {});
  await dwc.fs.writeFile(`${path}/vite.config.js`, vueTsViteConfig(path));

  await dwc.fs.mkdir(`${path}/scripts`, { recursive: true });
  await dwc.fs.writeFile(`${path}/${VUE_TS_SETUP_SCRIPT_PATH}`, vueTsSetupScript(path));

  const project: Project = { id: crypto.randomUUID(), name: slug, path, kind: "vite-vue-ts", createdAt: Date.now() };
  saveRecentProject(project);
  return project;
}

// Angular + TypeScript. Unlike the other three templates, this one is
// written straight into the VFS rather than scaffolded via a real CLI - see
// angularTemplate.ts's own header for why (`@angular/create` needs
// `child_process.spawnSync`, which this runtime does not implement) and how
// it still avoids the Rolldown-optimizer problem the React/Vue templates
// work around (every `@angular/*`/rxjs/zone.js import is aliased straight to
// its real, self-contained ESM file).
export async function createViteAngularProject(name: string, onLog: (text: string) => void): Promise<Project> {
  const dwc = getDwc();
  await ensureNpm();
  const slug = slugify(name);
  const path = `/${slug}`;

  await dwc.fs.mkdir(`${path}/src`, { recursive: true });

  const pkg = {
    name: slug,
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies: {
      "@angular/core": ANGULAR_VERSION,
      "@angular/common": ANGULAR_VERSION,
      "@angular/compiler": ANGULAR_VERSION,
      "@angular/platform-browser": ANGULAR_VERSION,
      rxjs: "^7.8.2",
      "zone.js": ZONE_VERSION,
    },
    devDependencies: {
      "@babel/standalone": ANGULAR_BABEL_STANDALONE_VERSION,
      vite: ANGULAR_VITE_VERSION,
    },
    overrides: {
      esbuild: "npm:esbuild-wasm@^0.25.0",
      rollup: "npm:@rollup/wasm-node@^4.43.0",
    },
    scripts: {
      dev: "vite --configLoader native",
      build: "vite build",
    },
  };
  await dwc.fs.writeFile(`${path}/package.json`, JSON.stringify(pkg, null, 2));

  await dwc.fs.writeFile(`${path}/vite.config.js`, angularViteConfig(path));
  await dwc.fs.writeFile(`${path}/index.html`, ANGULAR_INDEX_HTML);
  await dwc.fs.writeFile(`${path}/src/main.ts`, ANGULAR_MAIN_TS);
  await dwc.fs.writeFile(`${path}/src/app.component.ts`, ANGULAR_APP_COMPONENT_TS);
  onLog(`wrote a standalone Angular ${ANGULAR_VERSION} app to ${path}\n`);

  const project: Project = { id: crypto.randomUUID(), name: slug, path, kind: "vite-angular-ts", createdAt: Date.now() };
  saveRecentProject(project);
  return project;
}

// A "recent" project's files only survive if this page's sandbox has been
// alive the whole time (duckwc's VFS is in-memory, reset on reload) - so
// reopening either resumes the still-live project as-is, or, if the VFS was
// reset since, honestly re-scaffolds it fresh from the same recipe rather
// than pretending old edits persisted.
export async function reopenProject(project: Project, onLog: (text: string) => void): Promise<Project> {
  const dwc = getDwc();
  if (await dwc.fs.exists(project.path)) return project;
  if (project.kind === "blank") return createBlankProject(project.name);
  if (project.kind === "vite-react-ts") return createViteReactTsProject(project.name, onLog);
  if (project.kind === "vite-vue-ts") return createViteVueTsProject(project.name, onLog);
  if (project.kind === "vite-angular-ts") return createViteAngularProject(project.name, onLog);
  return createViteVanillaProject(project.name, onLog);
}

export async function runProject(project: Project, callbacks: RunCallbacks): Promise<void> {
  const dwc = getDwc();
  const pkgPath = `${project.path}/package.json`;

  if (!(await dwc.fs.exists(pkgPath))) {
    callbacks.onStatus("no-script");
    return;
  }
  const pkg = JSON.parse(new TextDecoder().decode(await dwc.fs.readFile(pkgPath))) as {
    scripts?: Record<string, string>;
  };
  if (!pkg.scripts?.dev) {
    callbacks.onStatus("no-script");
    return;
  }

  await ensureNpm();

  const alreadyInstalled = await dwc.fs.exists(`${project.path}/node_modules`);
  if (!alreadyInstalled) {
    callbacks.onStatus("installing");
    const install = await dwc.shell.spawn("npm install --force --loglevel=info --foreground-scripts", {
      cwd: project.path,
      env: SHELL_ENV,
    });
    pipeToLog(install.stdout, (text) => callbacks.onLog("install", text));
    pipeToLog(install.stderr, (text) => callbacks.onLog("install", text));
    const installExit = await install.exit;
    if (installExit !== 0) {
      callbacks.onLog("install", `\nnpm install exited with code ${installExit}`);
      callbacks.onStatus("error");
      return;
    }
  }

  callbacks.onStatus("starting");
  const viteListening = waitForListen(dwc, 5173);
  const dev = await dwc.shell.spawn("npm run dev", { cwd: project.path, env: SHELL_ENV });
  const devReady = pipeUntilMarker(dev.stdout, (text) => callbacks.onLog("dev", text), "Local:");
  pipeToLog(dev.stderr, (text) => callbacks.onLog("dev", text));

  try {
    await Promise.all([devReady, viteListening]);
  } catch (error) {
    dev.kill();
    callbacks.onLog("dev", `\ndev server exited before becoming ready: ${String(error)}`);
    callbacks.onStatus("error");
    return;
  }

  await dwc.preview.enable({ swUrl: "/dwc-preview-sw.js", id: "studio" });
  callbacks.onStatus("ready");
}

export const PREVIEW_PORT = 5173;
