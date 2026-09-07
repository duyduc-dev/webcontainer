/**
 * Hand-written, not vendored: real Node's `vm` module is backed by native
 * V8 Context/Script bindings (true isolated-global-object sandboxing) that
 * can't be replicated in userland JS at all - there is no way to hand a
 * script a genuinely separate global object here. Scoped to exactly the
 * one traced need: real npm's own `promzard` dependency (used by `npm
 * init`/`npm create` to evaluate a project's init-defaults script) does
 * `const { runInThisContext } = require('vm')` and nothing else from this
 * module.
 *
 * `vm.runInThisContext(code, filename)` compiles and runs `code` sharing
 * the CALLER's real global scope - not an isolated sandbox, which is true
 * of real Node's own `runInThisContext` too (as opposed to
 * `runInNewContext`/`createContext`, which real Node backs with an actual
 * separate V8 context this runtime has no way to provide). Indirect eval
 * already has exactly this semantics (global scope, not the calling
 * function's own local/lexical scope), so this is a correct implementation
 * of this one function, not merely an approximation of it.
 *
 * `runInNewContext`/`createContext`/the `Script` class and everything else
 * from real Node's `vm` module are deliberately NOT implemented here - a
 * fake version of real context isolation would either have to silently run
 * in the shared global scope anyway (actively dangerous: code that meant
 * to sandbox something would silently not be sandboxed) or throw. Left
 * absent rather than either, matching this runtime's existing precedent
 * for a genuinely unsupportable feature (async_hooks.ts's
 * AsyncLocalStorage throws a clear error rather than faking async-context
 * tracking) - add real support here, the same way, if/when something
 * traces an actual need for it.
 */

interface RunInThisContextOptions {
  filename?: string;
}

const runInThisContext = (code: string, filenameOrOptions?: string | RunInThisContextOptions): unknown => {
  const filename = typeof filenameOrOptions === "string" ? filenameOrOptions : filenameOrOptions?.filename;
  // The indirect-eval form (`(0, eval)(...)`, not a direct `eval(...)`
  // call) evaluates in the global scope rather than the calling function's
  // own lexical scope - exactly real Node's runInThisContext semantics
  // (shares globals with the caller, but never the caller's locals).
  // `//# sourceURL=...` gives the compiled function a real name in stack
  // traces/debuggers instead of an anonymous "eval" frame, mirroring what
  // `filename` is for in real Node's own vm module.
  const sourceUrlComment = filename ? `\n//# sourceURL=${filename}` : "";
  return (0, eval)(code + sourceUrlComment);
};

const createVmModule = () => ({
  runInThisContext,
});

export { createVmModule, runInThisContext };
