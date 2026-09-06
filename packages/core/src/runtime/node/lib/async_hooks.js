// async_hooks — a minimal AsyncResource-only shim.
//
// Real Node's async_hooks tracks async execution context through V8 hooks
// (executionAsyncId, triggerAsyncId, AsyncLocalStorage) - none of that exists
// here. This provides only `AsyncResource`, because several vendored stream
// internals (internal/streams/end-of-stream.js's bindAsyncResource, used by
// the commonly-used stream.pipeline()) lazily `require('async_hooks').
// AsyncResource` purely to preserve `this`/args across a callback boundary,
// not for real context propagation - a synchronous pass-through call is
// behaviorally sufficient for that use. `AsyncLocalStorage` and everything
// else genuinely need V8 hooks this runtime doesn't have, so they're not
// implemented (throws loudly rather than silently no-op'ing).
export default function (exports, require, module, process, internalBinding, primordials) {
  "use strict";

  class AsyncResource {
    constructor(type) {
      this.type = type;
    }
    runInAsyncScope(fn, thisArg, ...args) {
      return fn.apply(thisArg, args);
    }
    emitDestroy() {
      return this;
    }
    asyncId() {
      return 0;
    }
    triggerAsyncId() {
      return 0;
    }
    bind(fn, thisArg) {
      const resource = this;
      return function (...args) {
        return resource.runInAsyncScope(fn, thisArg === undefined ? this : thisArg, ...args);
      };
    }
    static bind(fn, type, thisArg) {
      return new AsyncResource(type || fn.name).bind(fn, thisArg);
    }
  }

  const notImplemented = (name) => () => {
    throw new Error(`async_hooks.${name} needs real V8 async-context tracking, not available in this runtime`);
  };

  module.exports = {
    AsyncResource,
    AsyncLocalStorage: class AsyncLocalStorage {
      constructor() {
        throw new Error("async_hooks.AsyncLocalStorage needs real V8 async-context tracking, not available in this runtime");
      }
    },
    createHook: notImplemented("createHook"),
    executionAsyncId: () => 0,
    triggerAsyncId: () => 0,
    executionAsyncResource: notImplemented("executionAsyncResource"),
  };
}
