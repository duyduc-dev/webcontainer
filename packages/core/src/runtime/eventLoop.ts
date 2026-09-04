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
}

interface CreateEventLoopOptions {
  now?: () => number;
}

const createEventLoop = (options: CreateEventLoopOptions = {}): EventLoop => {
  const now = options.now ?? (() => Date.now());

  const nextTickQueue: { fn: Task; args: unknown[] }[] = [];
  const timers = new Map<number, Timer>();
  const immediates = new Map<number, Immediate>();
  let nextId = 1;

  const nextTick = (fn: Task, ...args: unknown[]): void => {
    nextTickQueue.push({ fn, args });
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
    return id;
  };

  const clearImmediateFn = (id: number): void => {
    immediates.delete(id);
  };

  const hasPendingWork = (): boolean => nextTickQueue.length > 0 || timers.size > 0 || immediates.size > 0;

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

    return false;
  };

  return {
    nextTick,
    setTimeout: setTimeoutFn,
    clearTimeout: clearTimeoutFn,
    setImmediate: setImmediateFn,
    clearImmediate: clearImmediateFn,
    hasPendingWork,
    runOnce,
  };
};

export { createEventLoop };
export type { EventLoop };
