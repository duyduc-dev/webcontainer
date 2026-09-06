// The Node builtin loader.
//
// Node ships its standard library as JavaScript (lib/) that runs on top of a
// C++ core reached through `internalBinding`. We keep that JS layer UNMODIFIED
// (see runtime/node/lib/, runtime/node/internal/ — real Node source, vendored
// verbatim where noted) and re-implement the layer beneath it. Each vendored
// module is a factory
//   function (exports, require, module, process, internalBinding, primordials)
// exactly like Node's own BuiltinLoader wraps its sources. This loader links
// them: it resolves `require('events')` / `require('internal/...')` against the
// vendored set, injects our `primordials` + `internalBinding` + the process,
// caches instances, and tolerates require cycles (returns the partial exports).
//
// Adding a real Node module later = drop the vendored file in and register it.
// Adapted from vivari (github.com/maitrungduc1410/vivari, MIT), packages/runtime/node/loader.js.

import { createInternalBinding } from "./internalBinding";
import { primordials } from "./primordials";
import type { ChildProcessBridge } from "./bindings/childProcess";
import type { NetBridge } from "./bindings/net";

import eventsFactory from "./lib/events";
import streamFactory from "./lib/stream";
import streamConsumersFactory from "./lib/stream/consumers";
import streamPromisesFactory from "./lib/stream/promises";
import bufferFactory from "./lib/buffer";
import stringDecoderFactory from "./lib/string_decoder";
import httpFactory from "./lib/http";
import httpsFactory from "./lib/https";
import cryptoFactory from "./lib/crypto";
import zlibFactory from "./lib/zlib";
import asyncHooksFactory from "./lib/async_hooks";
import dnsFactory from "./lib/dns";
import tlsFactory from "./lib/tls";
import netFactory from "./lib/net";
import clusterFactory from "./lib/cluster";
import diagnosticsChannelFactory from "./lib/diagnostics_channel";
import timersFactory from "./lib/timers";
import childProcessFactory from "./lib/child_process";

import internalBufferFactory from "./internal/buffer";
import utilFactory from "./internal/util";
import utilTypesFactory from "./internal/util/types";
import utilInspectFactory from "./internal/util/inspect";
import utilDebuglogFactory from "./internal/util/debuglog";
import errorsFactory from "./internal/errors";
import validatorsFactory from "./internal/validators";
import assertFactory from "./internal/assert";
import eventTargetFactory from "./internal/event_target";
import abortControllerFactory from "./internal/abort_controller";
import encodingFactory from "./internal/encoding";
import taskQueuesFactory from "./internal/process/task_queues";
import fixedQueueFactory from "./internal/fixed_queue";
import eventsSymbolsFactory from "./internal/events/symbols";
import abortListenerFactory from "./internal/events/abort_listener";
import webstreamsAdaptersFactory from "./internal/webstreams/adapters";
import blobFactory from "./internal/blob";
import optionsFactory from "./internal/options";
import startupSnapshotFactory from "./internal/v8/startup_snapshot";
import fetchTransportFactory from "./internal/fetch-transport";
import inflateFactory from "./internal/inflate";
import internalTimersFactory from "./internal/timers";
import internalAsyncHooksFactory from "./internal/async_hooks";
import blocklistFactory from "./internal/blocklist";
import internalNetFactory from "./internal/net";
import perfObserveFactory from "./internal/perf/observe";
import socketaddressFactory from "./internal/socketaddress";
import streamBaseCommonsFactory from "./internal/stream_base_commons";
import internalUrlFactory from "./internal/url";
import jsTransferableFactory from "./internal/worker/js_transferable";

import streamsAddAbortSignalFactory from "./internal/streams/add-abort-signal";
import streamsComposeFactory from "./internal/streams/compose";
import streamsDestroyFactory from "./internal/streams/destroy";
import streamsDuplexFactory from "./internal/streams/duplex";
import streamsDuplexifyFactory from "./internal/streams/duplexify";
import streamsDuplexpairFactory from "./internal/streams/duplexpair";
import streamsEndOfStreamFactory from "./internal/streams/end-of-stream";
import streamsFromFactory from "./internal/streams/from";
import streamsLegacyFactory from "./internal/streams/legacy";
import streamsOperatorsFactory from "./internal/streams/operators";
import streamsPassthroughFactory from "./internal/streams/passthrough";
import streamsPipelineFactory from "./internal/streams/pipeline";
import streamsReadableFactory from "./internal/streams/readable";
import streamsStateFactory from "./internal/streams/state";
import streamsTransformFactory from "./internal/streams/transform";
import streamsUtilsFactory from "./internal/streams/utils";
import streamsWritableFactory from "./internal/streams/writable";

type NodeFactory = (
  exports: Record<string, unknown>,
  require: (name: string) => unknown,
  module: { exports: unknown },
  process: unknown,
  internalBinding: (name: string) => unknown,
  primordials: unknown,
) => void;

// name -> factory. Public builtins (e.g. "events") and internals ("internal/...")
// live in the same table, just like Node's builtin id space.
const FACTORIES: Record<string, NodeFactory> = {
  events: eventsFactory,
  stream: streamFactory,
  "stream/consumers": streamConsumersFactory,
  "stream/promises": streamPromisesFactory,
  buffer: bufferFactory,
  string_decoder: stringDecoderFactory,
  http: httpFactory,
  https: httpsFactory,
  crypto: cryptoFactory,
  zlib: zlibFactory,
  async_hooks: asyncHooksFactory,
  dns: dnsFactory,
  tls: tlsFactory,
  net: netFactory,
  cluster: clusterFactory,
  diagnostics_channel: diagnosticsChannelFactory,
  timers: timersFactory,
  child_process: childProcessFactory,

  "internal/buffer": internalBufferFactory,
  "internal/util": utilFactory,
  "internal/util/types": utilTypesFactory,
  "util/types": utilTypesFactory,
  "internal/util/inspect": utilInspectFactory,
  "internal/util/debuglog": utilDebuglogFactory,
  "internal/errors": errorsFactory,
  "internal/validators": validatorsFactory,
  "internal/assert": assertFactory,
  "internal/event_target": eventTargetFactory,
  "internal/abort_controller": abortControllerFactory,
  "internal/encoding": encodingFactory,
  "internal/process/task_queues": taskQueuesFactory,
  "internal/fixed_queue": fixedQueueFactory,
  "internal/events/symbols": eventsSymbolsFactory,
  "internal/events/abort_listener": abortListenerFactory,
  "internal/webstreams/adapters": webstreamsAdaptersFactory,
  "internal/blob": blobFactory,
  "internal/options": optionsFactory,
  "internal/v8/startup_snapshot": startupSnapshotFactory,
  "internal/fetch-transport": fetchTransportFactory,
  "internal/inflate": inflateFactory,
  "internal/timers": internalTimersFactory,
  "internal/async_hooks": internalAsyncHooksFactory,
  "internal/blocklist": blocklistFactory,
  "internal/net": internalNetFactory,
  "internal/perf/observe": perfObserveFactory,
  "internal/socketaddress": socketaddressFactory,
  "internal/stream_base_commons": streamBaseCommonsFactory,
  "internal/url": internalUrlFactory,
  "internal/worker/js_transferable": jsTransferableFactory,

  "internal/streams/add-abort-signal": streamsAddAbortSignalFactory,
  "internal/streams/compose": streamsComposeFactory,
  "internal/streams/destroy": streamsDestroyFactory,
  "internal/streams/duplex": streamsDuplexFactory,
  "internal/streams/duplexify": streamsDuplexifyFactory,
  "internal/streams/duplexpair": streamsDuplexpairFactory,
  "internal/streams/end-of-stream": streamsEndOfStreamFactory,
  "internal/streams/from": streamsFromFactory,
  "internal/streams/legacy": streamsLegacyFactory,
  "internal/streams/operators": streamsOperatorsFactory,
  "internal/streams/passthrough": streamsPassthroughFactory,
  "internal/streams/pipeline": streamsPipelineFactory,
  "internal/streams/readable": streamsReadableFactory,
  "internal/streams/state": streamsStateFactory,
  "internal/streams/transform": streamsTransformFactory,
  "internal/streams/utils": streamsUtilsFactory,
  "internal/streams/writable": streamsWritableFactory,
};

const strip = (name: string): string => (name.startsWith("node:") ? name.slice(5) : name);

interface NodeModules {
  require(name: string): unknown;
  /** True if `name` is served by the vendored Node lib (public + internal ids). */
  has(name: string): boolean;
}

interface ProcessLikeForModules {
  nextTick(fn: (...args: unknown[]) => void, ...args: unknown[]): void;
}

/** Per-process context 'net' needs beyond `process` itself: the event loop's
 * close phase and liveness ref/unref, and (optionally) the kernel's
 * cross-process relay. Every field defaults to a same-process-only,
 * nextTick-based fallback when omitted, so existing callers (tests,
 * anything not touching net) are unaffected. */
interface NodeModulesContext {
  queueClose?: (fn: (...args: unknown[]) => void, ...args: unknown[]) => void;
  ref?: () => void;
  unref?: () => void;
  netBridge?: NetBridge;
  childProcessBridge?: ChildProcessBridge;
}

/** Creates one isolated module cache + require() over the vendored Node builtins. */
const createNodeModules = (process: ProcessLikeForModules, context: NodeModulesContext = {}): NodeModules => {
  const internalBinding = createInternalBinding({
    process,
    queueClose: context.queueClose ?? ((fn, ...args) => process.nextTick(fn, ...args)),
    ref: context.ref ?? (() => {}),
    unref: context.unref ?? (() => {}),
    netBridge: context.netBridge,
    childProcessBridge: context.childProcessBridge,
  });

  const modules = new Map<string, { exports: unknown }>(); // id -> module (kept for cycle resolution)

  const nodeRequire = (name: string): unknown => {
    const id = strip(name);
    const existing = modules.get(id);
    if (existing) return existing.exports; // done, or partial during a cycle

    const factory = FACTORIES[id];
    if (!factory) throw new Error(`no vendored Node builtin '${id}'`);

    const nodeModule = { exports: {} as Record<string, unknown> };
    modules.set(id, nodeModule); // register BEFORE running so cycles see the partial
    try {
      factory(nodeModule.exports, nodeRequire, nodeModule, process, internalBinding, primordials);
    } catch (error) {
      // A factory that threw would otherwise leave a half-initialized module in
      // the cache, so the NEXT require would hand back its empty `exports`
      // instead of re-throwing — turning a loud module-level failure into a
      // silent `{}`. Evict, so the real error is reported every time.
      modules.delete(id);
      throw error;
    }
    return nodeModule.exports;
  };

  return {
    require: nodeRequire,
    has: (name) => Object.prototype.hasOwnProperty.call(FACTORIES, strip(name)),
  };
};

export { createNodeModules };
export type { NodeModules, NodeModulesContext };
