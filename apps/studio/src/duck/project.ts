import { ensureNpm, getDwc, pipeToLog, pipeUntilMarker, waitForListen } from "./session";

export type ProjectKind = "blank" | "vite-vanilla";

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

// The only template offered today is the one recipe this repo has actually
// verified working end-to-end (examples/playground's own proven Vite
// 8.0.0 + explicit WASI Rolldown binding + esbuild-wasm/@rollup/wasm-node
// overrides + noDiscovery combo - see PROGRESS.md items 7/8/9/14). Other
// frameworks aren't wired up yet rather than shipped untested.
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

// A "recent" project's files only survive if this page's sandbox has been
// alive the whole time (duckwc's VFS is in-memory, reset on reload) - so
// reopening either resumes the still-live project as-is, or, if the VFS was
// reset since, honestly re-scaffolds it fresh from the same recipe rather
// than pretending old edits persisted.
export async function reopenProject(project: Project, onLog: (text: string) => void): Promise<Project> {
  const dwc = getDwc();
  if (await dwc.fs.exists(project.path)) return project;
  return project.kind === "blank" ? createBlankProject(project.name) : createViteVanillaProject(project.name, onLog);
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
