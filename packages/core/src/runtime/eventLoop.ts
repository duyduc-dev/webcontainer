type Task = (...args: unknown[]) => void;

interface Timer {
  id: number;
  fn: Task;
  args: unknown[];
  dueAt: number;
}

interface Immediate {
  id: number;
  fn: Task;
  args: unknown[];
}

interface EventLoop {
  nextTick(fn: Task, ...args: unknown[]): void;
  setTimeout(fn: Task, delayMs?: number, ...args: unknown[]): number;
  clearTimeout(id: number): void;
  setImmediate(fn: Task, ...args: unknown[]): number;
  clearImmediate(id: number): void;
  hasPendingWork(): boolean;
  /**
   * Runs one Node-ordered unit of work: drains the nextTick queue, or (once that's
   * empty) yields once to native microtasks, then runs the earliest due timer, then
   * the whole immediate queue. Returns false when nothing is ready right now.
   */
  runOnce(): Promise<boolean>;
  /** Marks one external async operation (e.g. an in-flight network request) as
   * keeping the loop alive, mirroring Node's active-handle refcount — otherwise
   * a request awaited only via a native Promise (no nextTick/timer/immediate of
   * its own until the reply arrives) would look like "no work" and exit early. */
  ref(): void;
  unref(): void;
  /**
   * Schedules `fn` for the loop's close phase — after nextTick/timers/
   * immediates, before the loop would otherwise consider itself done.
   * Node's real loop runs handle-close callbacks in their own phase for
   * exactly this reason: `net.Socket._destroy` calls `handle.close(cb2)`
   * then synchronously `cb(exception)` (which emits `'error'`); if `cb2`
   * ran on the same nextTick queue, `'close'` would fire before `'error'`,
   * and `http`'s `socketCloseListener` misreads a close-with-no-error-yet
   * as a reset, double-emitting errors. A later phase, not just "some
   * microtask," preserves the ordering real Node guarantees.
   */
  queueClose(fn: Task, ...args: unknown[]): void;
}

interface CreateEventLoopOptions {
  now?: () => number;
}

const createEventLoop = (options: CreateEventLoopOptions = {}): EventLoop => {
  const now = options.now ?? (() => Date.now());

  const nextTickQueue: { fn: Task; args: unknown[] }[] = [];
  const timers = new Map<number, Timer>();
  const immediates = new Map<number, Immediate>();
  const closeCallbacks: { fn: Task; args: unknown[] }[] = [];
  let nextId = 1;
  let activeHandles = 0;
  let wakeResolvers: (() => void)[] = [];

  /** Resolves every pending waitForWake() call — used whenever new work appears
   * (a nextTick/immediate) or an active handle's work finishes, so runOnce()'s
   * "wait for an active handle" branch doesn't hang past the point of interest. */
  const wake = (): void => {
    if (wakeResolvers.length === 0) return;
    const resolvers = wakeResolvers;
    wakeResolvers = [];
    for (const resolve of resolvers) resolve();
  };

  const waitForWake = (): Promise<void> => new Promise((resolve) => wakeResolvers.push(resolve));

  const nextTick = (fn: Task, ...args: unknown[]): void => {
    nextTickQueue.push({ fn, args });
    wake();
  };

  const setTimeoutFn = (fn: Task, delayMs = 0, ...args: unknown[]): number => {
    const id = nextId++;
    timers.set(id, { id, fn, args, dueAt: now() + Math.max(0, delayMs) });
    return id;
  };

  const clearTimeoutFn = (id: number): void => {
    timers.delete(id);
  };

  const setImmediateFn = (fn: Task, ...args: unknown[]): number => {
    const id = nextId++;
    immediates.set(id, { id, fn, args });
    wake();
    return id;
  };

  const clearImmediateFn = (id: number): void => {
    immediates.delete(id);
  };

  const hasPendingWork = (): boolean =>
    nextTickQueue.length > 0 ||
    timers.size > 0 ||
    immediates.size > 0 ||
    closeCallbacks.length > 0 ||
    activeHandles > 0;

  const yieldToMicrotasks = (): Promise<void> =>
    new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port2.onmessage = () => resolve();
      channel.port1.postMessage(undefined);
    });

  const earliestDueTimer = (): Timer | null => {
    let earliest: Timer | null = null;
    for (const timer of timers.values()) {
      if (timer.dueAt > now()) continue;
      if (!earliest || timer.dueAt < earliest.dueAt) earliest = timer;
    }
    return earliest;
  };

  const runOnce = async (): Promise<boolean> => {
    if (nextTickQueue.length > 0) {
      const task = nextTickQueue.shift()!;
      task.fn(...task.args);
      return true;
    }

    await yieldToMicrotasks();
    if (nextTickQueue.length > 0) return true;

    const timer = earliestDueTimer();
    if (timer) {
      timers.delete(timer.id);
      timer.fn(...timer.args);
      return true;
    }

    if (immediates.size > 0) {
      const due = [...immediates.values()];
      immediates.clear();
      for (const immediate of due) immediate.fn(...immediate.args);
      return true;
    }

    if (closeCallbacks.length > 0) {
      const due = closeCallbacks.splice(0, closeCallbacks.length);
      for (const callback of due) callback.fn(...callback.args);
      return true;
    }

    // Nothing is ready to run right now, but an active handle (e.g. an in-flight
    // network request) means the loop isn't actually done — its reply arrives via
    // a real message from another worker, not anything already queued here, so
    // wait for that to happen (it will call nextTick/unref, both of which wake()).
    if (activeHandles > 0) {
      await waitForWake();
      return true;
    }

    return false;
  };

  const ref = (): void => {
    activeHandles++;
  };

  const unref = (): void => {
    activeHandles = Math.max(0, activeHandles - 1);
    wake();
  };

  const queueClose = (fn: Task, ...args: unknown[]): void => {
    closeCallbacks.push({ fn, args });
    wake();
  };

  return {
    nextTick,
    setTimeout: setTimeoutFn,
    clearTimeout: clearTimeoutFn,
    setImmediate: setImmediateFn,
    clearImmediate: clearImmediateFn,
    hasPendingWork,
    runOnce,
    ref,
    unref,
    queueClose,
  };
};

export { createEventLoop };
export type { EventLoop };
