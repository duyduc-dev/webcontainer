// internalBinding — the seam Node's lib/ uses to reach its C++ core.
//
// In real Node, `internalBinding('fs')` returns the native (C++) module. Here,
// this is where we substitute our own implementations: JS shims or Wasm/Web
// codecs. The JS layer above the binding line (Node's real lib/) stays
// unmodified. Bindings are added as each real lib/ module comes online.
// A factory (not a static object) because 'net' needs per-process context
// (the event loop's close phase / liveness ref-unref, and later the kernel's
// cross-process relay) that a module-load-time singleton can't carry.

import { createBlockListBindings } from "./bindings/blockList";
import { createBufferBinding } from "./bindings/buffer";
import { createChildProcessBindings } from "./bindings/childProcess";
import type { ChildProcessBindingContext } from "./bindings/childProcess";
import { createNetBindings } from "./bindings/net";
import type { NetBindingContext } from "./bindings/net";

// Node's v8::PropertyFilter values used by getOwnNonIndexProperties.
const ALL_PROPERTIES = 0;
const ONLY_ENUMERABLE = 2;

const isIndexKey = (key: string): boolean => /^(?:0|[1-9]\d*)$/.test(key) && Number(key) <= 0xffffffff;

function getOwnNonIndexProperties(obj: object, filter: number): (string | symbol)[] {
  const keep = (d: PropertyDescriptor | undefined): boolean => (filter === ONLY_ENUMERABLE ? !!d?.enumerable : !!d);
  const out: (string | symbol)[] = [];
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (isIndexKey(key)) continue;
    if (keep(Object.getOwnPropertyDescriptor(obj, key))) out.push(key);
  }
  for (const sym of Object.getOwnPropertySymbols(obj)) {
    if (keep(Object.getOwnPropertyDescriptor(obj, sym))) out.push(sym);
  }
  return out;
}

interface InternalBindingContext extends NetBindingContext, ChildProcessBindingContext {}

const createInternalBinding = (context: InternalBindingContext): ((name: string) => unknown) => {
  // Minted once per realm: internal/blocklist.js and others reach for these
  // through this binding so a handle's owner can be found by identity.
  const REALM_SYMBOLS = {
    owner_symbol: Symbol("owner_symbol"),
    async_id_symbol: Symbol("async_id_symbol"),
    trigger_async_id_symbol: Symbol("trigger_async_id_symbol"),
  };

  const net = createNetBindings(context);

  const bindings: Record<string, unknown> = {
    buffer: createBufferBinding(),
    block_list: createBlockListBindings(),
    tcp_wrap: net.tcp_wrap,
    stream_wrap: net.stream_wrap,
    uv: net.uv,
    pipe_wrap: net.pipe_wrap,
    cares_wrap: net.cares_wrap,
    child_process: createChildProcessBindings(context),
    util: {
      constants: { ALL_PROPERTIES, ONLY_ENUMERABLE },
      getOwnNonIndexProperties,
      isInsideNodeModules: () => false,
      // internal/buffer.js destructures this at module load time to brand
      // Buffers created for transfer as non-transferable; we don't implement
      // structured-clone transfer semantics, so the symbol only needs to exist.
      privateSymbols: {
        untransferable_object_private_symbol: Symbol("untransferable_object"),
      },
    },
    // hasIntl=false keeps Buffer.transcode / ICU paths dormant (no icu binding).
    config: { hasIntl: false },
    symbols: REALM_SYMBOLS,
    // inert — internal/http records HTTP trace spans through it.
    trace_events: {
      getCategoryEnabledBuffer: () => new Uint8Array(1),
      trace: () => {},
    },
    // internal/net.js destructures writeBuffer at module load time (for
    // makeSyncWrite(fd), used when a net.Socket wraps a raw fd directly rather
    // than a TCP/Pipe handle) — not exercised by our TCP/Pipe loopback paths,
    // so it only needs to exist; throws loudly if a caller actually reaches it.
    fs: {
      writeBuffer: () => {
        throw new Error("internalBinding('fs').writeBuffer is not implemented yet (raw fd writes)");
      },
    },
  };

  return (name: string): unknown => {
    if (Object.prototype.hasOwnProperty.call(bindings, name)) return bindings[name];
    throw new Error(`internalBinding('${name}') is not implemented yet`);
  };
};

export { createInternalBinding };
export type { InternalBindingContext };
