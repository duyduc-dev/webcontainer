// Hand-authored Angular (standalone components, signals) template - there is
// no `npm create @angular@latest`/`ng new` scaffold here at all, unlike the
// Vite/React/Vue templates: `@angular/create`'s generator shells out via
// `child_process.spawnSync`, which this runtime does not implement yet (see
// PROGRESS.md). So this follows the React/Vue templates' own pattern instead
// - a minimal app written directly into the VFS, dependencies installed for
// real, served by a hand-configured Vite dev server - just with no CLI
// scaffold step at all, closer to createBlankProject than to the other three.
//
// Why this can skip both the Rolldown-optimizer problem (React/Vue's issue)
// AND JIT/AOT template compilation infrastructure (Angular's own normal
// build step): every `@angular/*` package this app needs, plus rxjs and
// zone.js, publishes a real, self-contained ESM build (`fesm2022/*.mjs` /
// `fesm2015/zone.js` / rxjs's `esm5` tree of purely-relative-import files) -
// confirmed by downloading and inspecting the actual published tarballs, not
// assumed. Aliasing each bare specifier straight to its real file (same
// trick vueTsTemplate.ts uses for `vue`) keeps Vite's import-rewriting from
// ever recognizing these as "bare package imports needing pre-bundling", so
// the optimizer (Rolldown/esbuild-wasm) never runs at all - not even the
// `esbuild-wasm`/`@rollup/wasm-node` overrides' code paths are exercised.
// Angular's own template compiler (`@angular/compiler`) is itself
// dependency-free ESM, and importing it before bootstrapping switches
// Angular into JIT mode - it compiles `@Component` templates at runtime, no
// ngtsc/AOT build step required.
//
// The one thing that DOES need a real build-time transform is TypeScript's
// legacy decorators (`@Component`, `@Injectable`, ...) Angular relies on:
// Babel's `typescript` preset only strips types, so the decorator plugin has
// to run too, in `legacy` mode (TypeScript's `experimentalDecorators`
// semantics, not the newer TC39 decorators Angular does not use) - same
// `@babel/standalone` instance the React template already uses. The demo
// component below deliberately takes no constructor-injected dependencies:
// Ivy's JIT compiler resolves `@Input()`/`inject()` calls from its own
// compiled factory, not from TypeScript's `emitDecoratorMetadata` reflection
// array, but implicit type-based constructor injection (a plain
// `constructor(private x: Foo)` with no explicit `@Inject(Foo)`) does still
// need that reflection metadata + a `reflect-metadata` polyfill neither of
// which this template wires up - untested territory, kept out of scope here.

export const ANGULAR_VERSION = "22.1.6";
export const ZONE_VERSION = "0.16.3";
export const VITE_VERSION = "7.3.6";
export const BABEL_STANDALONE_VERSION = "7.25.2";

export function angularViteConfig(projectPath: string): string {
  const nm = `${projectPath}/node_modules`;

  return `export default {
  // Same reasoning as the React/Vue templates: Vite's own esbuild transform
  // is off, so nothing here ever starts an esbuild service; the plugin below
  // handles TypeScript + Angular's legacy decorators with @babel/standalone
  // instead.
  esbuild: false,
  // Every bare specifier this app (or the aliased vendor files below) needs
  // is aliased straight to its real published ESM file, so there is nothing
  // left for the dependency optimizer to discover or pre-bundle.
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
  resolve: {
    alias: {
      // resolve.alias is prefix-matched in declaration order (same gotcha
      // reactTsTemplate.ts's own alias block documents for react/react-dom):
      // core.mjs imports these two subpaths itself, so they must be declared
      // before the plain "@angular/core" entry below or that shorter key's
      // prefix match mangles them into "<core.mjs path>/primitives/signals".
      "@angular/core/primitives/signals": "${nm}/@angular/core/fesm2022/primitives-signals.mjs",
      "@angular/core/primitives/di": "${nm}/@angular/core/fesm2022/primitives-di.mjs",
      "rxjs/operators": "${nm}/rxjs/dist/esm5/operators/index.js",
      rxjs: "${nm}/rxjs/dist/esm5/index.js",
      "zone.js": "${nm}/zone.js/fesm2015/zone.js",
      "@angular/compiler": "${nm}/@angular/compiler/fesm2022/compiler.mjs",
      "@angular/common/http": "${nm}/@angular/common/fesm2022/http.mjs",
      "@angular/common": "${nm}/@angular/common/fesm2022/common.mjs",
      "@angular/core": "${nm}/@angular/core/fesm2022/core.mjs",
      "@angular/platform-browser": "${nm}/@angular/platform-browser/fesm2022/platform-browser.mjs",
    },
  },
  plugins: [
    {
      name: "duckwc-angular-ts",
      enforce: "pre",
      async transform(code, id) {
        const file = id.split("?")[0];
        if (!file.endsWith(".ts")) return null;
        if (file.endsWith(".d.ts") || file.includes("/node_modules/")) return null;

        const babelModule = await import("@babel/standalone");
        const babel = babelModule.default ?? babelModule;
        const result = babel.transform(code, {
          filename: file,
          presets: [["typescript", { onlyRemoveTypeImports: false }]],
          // Decorators must run before class-properties in the same list -
          // Babel applies plugins before presets, in declared order.
          plugins: [
            ["proposal-decorators", { legacy: true }],
            ["proposal-class-properties", { loose: true }],
          ],
          sourceMaps: true,
        });

        return result ? { code: result.code ?? code, map: result.map } : null;
      },
    },
  ],
};
`;
}

export const ANGULAR_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + Angular</title>
  </head>
  <body>
    <app-root></app-root>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

// zone.js patches this REAL browser iframe's own global async APIs (this
// code runs client-side, in the preview iframe - a genuine browser context,
// not inside a duckwc guest sandbox worker) - it needs to be the very first
// import, before anything else touches a Promise/setTimeout/etc. Importing
// '@angular/compiler' next switches Angular into JIT mode.
export const ANGULAR_MAIN_TS = `import "zone.js";
import "@angular/compiler";
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app.component";

bootstrapApplication(AppComponent).catch((error) => console.error(error));
`;

export const ANGULAR_APP_COMPONENT_TS = `import { Component, signal } from "@angular/core";

@Component({
  selector: "app-root",
  standalone: true,
  template: \`
    <h1>Vite + Angular</h1>
    <button type="button" (click)="increment()">count is {{ count() }}</button>
  \`,
})
export class AppComponent {
  count = signal(0);

  increment(): void {
    this.count.update((value) => value + 1);
  }
}
`;
