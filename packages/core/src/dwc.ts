import { createFileSystemAPI } from "./apis/FileSystem";
import type { FileSystemAPI } from "./apis/FileSystem";
import { createNpmAPI } from "./apis/npm/Npm";
import type { NpmAPI } from "./apis/npm/Npm";
import { createPreviewAPI } from "./apis/Preview";
import type { PreviewAPI } from "./apis/Preview";
import { createProcessAPI } from "./apis/Process";
import type { ProcessAPI } from "./apis/Process";
import { createShellAPI } from "./apis/Shell";
import type { ShellAPI } from "./apis/Shell";
import { createKernelBridge } from "./bridges";
import type { KernelBridgeOptions } from "./bridges";
import { createDiagnostics } from "./protocol/diagnostics";
import type { Diagnostics } from "./protocol/diagnostics";

type Unsubscribe = () => void;
type Handler = (payload?: any) => void;

interface BootDWCOptions extends KernelBridgeOptions {}

interface BootDWCReturn {
  diagnostics: Diagnostics;
  fs: FileSystemAPI;
  npm: NpmAPI;
  process: ProcessAPI;
  shell: ShellAPI;
  preview: PreviewAPI;
  addEventListener(type: string, handler: Handler): Unsubscribe;
  /** Resolves once the kernel worker has actually finished booting, rejects
   * if it never does (worker construction failure, boot timeout). Every
   * `fs`/`npm`/`process`/`shell`/`preview` call already waits for this
   * internally (and surfaces the same rejection on its own returned
   * promise) - awaiting `ready` directly is only useful if you want to know
   * boot succeeded/failed without making an actual call. */
  ready: Promise<void>;
}

/**
 * `bootDWC()` is deliberately synchronous - it returns real, immediately
 * usable `fs`/`npm`/`process`/`shell`/`preview`/`addEventListener` handles
 * right away, not a Promise of them, so callers never need `await bootDWC()` (a
 * plain `const dwc = bootDWC();` works). The actual kernel worker boot
 * handshake still happens asynchronously underneath; every call these
 * handles make transparently waits for that to finish first (queuing behind
 * `bridgeReady` below), so nothing is unsafe about calling them immediately -
 * a `dwc.fs.mkdir(...)` issued the same tick `bootDWC()` returns simply
 * resolves a little later than one issued after the kernel is already up.
 * `await bootDWC()` (the old call shape) still works unchanged: `await` on a
 * plain object that isn't a Promise/thenable just resolves to that object on
 * the next microtask, so existing call sites don't need to change.
 */
const bootDWC = (options: BootDWCOptions = {}): BootDWCReturn => {
  const diagnostics = createDiagnostics();
  const bridgeReady = createKernelBridge({ ...options, diagnostics });
  // A promise nobody ever awaits still logs an "unhandled rejection" console
  // warning the moment it rejects - this dedicated no-op catch exists only
  // to silence that for the shared root promise; each of request()/on()'s
  // own derived `.then()` chains below still rejects/no-ops correctly for
  // whoever actually awaits a call.
  bridgeReady.catch(() => {});

  const request = <T = unknown>(type: string, payload?: unknown): Promise<T> => bridgeReady.then((bridge) => bridge.request<T>(type, payload));

  const on = (type: string, handler: Handler): Unsubscribe => {
    let realUnsubscribe: Unsubscribe | null = null;
    let cancelled = false;
    bridgeReady.then((bridge) => {
      if (cancelled) return;
      realUnsubscribe = bridge.on(type, handler);
    });
    return () => {
      cancelled = true;
      realUnsubscribe?.();
    };
  };

  const fs = createFileSystemAPI(request);

  return {
    diagnostics,
    fs,
    npm: createNpmAPI(fs),
    process: createProcessAPI(request, on),
    shell: createShellAPI(request),
    preview: createPreviewAPI(request, on),
    addEventListener: on,
    ready: bridgeReady.then(() => undefined),
  };
};

export { bootDWC };
export type { BootDWCOptions, BootDWCReturn };
