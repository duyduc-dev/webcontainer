// Hand-written, not vendored: real Node's perf_hooks wraps V8/libuv timing
// internals (internalBinding('performance'), PerformanceObserver's entry
// buffer, monitorEventLoopDelay's native histogram) - none of that exists
// to query from inside a browser sandbox. Traced need: real Vite's own CLI
// entry point (bin/vite.js and dist/node/chunks/node.js) does
// `import { performance } from 'node:perf_hooks'` and calls
// `performance.now()` for its own startup-timing log line - that's the
// only member any traced caller actually reads. The Web Performance API's
// `performance.now()` (a real global here, same monotonic-clock contract:
// milliseconds since a fixed time origin, sub-millisecond precision) is the
// same measurement real Node's own perf_hooks.performance.now() makes,
// just backed by a different clock source - not an approximation.
//
// `eventLoopUtilization()` also appears in Vite's bundle, but only inside a
// string template used to generate code for a `worker_threads` Worker
// (Tinypool-style synchronous execution bridge) - unreachable unless/until
// `worker_threads` itself is implemented and that specific Vite feature
// path is exercised, so it's not included here. PerformanceObserver,
// marks/measures, monitorEventLoopDelay, and everything else perf_hooks
// exports are NOT implemented - nothing traced needs them yet.
const createPerfHooksModule = () => ({
  performance: {
    now: () => performance.now(),
    timeOrigin: performance.timeOrigin,
  },
});

export { createPerfHooksModule };
