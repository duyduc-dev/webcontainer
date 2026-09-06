// Hand-written, not vendored: real Node's lib/timers/promises.js wraps its
// own internal Timeout class - reimplemented here as a plain Promise around
// the ALREADY-tracked global setTimeout/clearTimeout (worker.ts's own
// Object.assign(self, {setTimeout: eventLoop.setTimeout, ...}) already
// makes those visible to hasPendingWork(), so this doesn't need its own
// event-loop bookkeeping). Traced need: real npm's own @npmcli/agent calls
// `timers.setTimeout(timeout, null, { signal })` directly to bound a
// connection attempt, aborting the wait (not just ignoring it) via the
// same AbortController it uses to race the connection itself - only the
// `signal` option is implemented since that's the only one any traced
// caller passes.
const timersSetTimeout = <T>(delay: number, value?: T, options: { signal?: AbortSignal } = {}): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    const abortError = () => Object.assign(new Error("The operation was aborted"), { name: "AbortError" });

    if (options.signal?.aborted) {
      reject(abortError());
      return;
    }

    const timer = setTimeout(() => {
      options.signal?.removeEventListener("abort", onAbort);
      resolve(value);
    }, delay);

    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
  });

const createTimersPromisesModule = () => ({ setTimeout: timersSetTimeout });

export { createTimersPromisesModule };
