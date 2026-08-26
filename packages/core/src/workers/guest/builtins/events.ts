type Listener = (...args: unknown[]) => void;

// A minimal EventEmitter covering the API surface real packages actually use.
// Not a byte-for-byte port of Node's (no domains, no captureRejections, no
// maxListeners warnings) — those are rarely load-bearing at require() time.
class EventEmitter {
  private readonly listenersByEvent = new Map<string | symbol, Listener[]>();
  private readonly onceWrappers = new WeakMap<Listener, Listener>();

  on(event: string | symbol, listener: Listener): this {
    const list = this.listenersByEvent.get(event) ?? [];
    list.push(listener);
    this.listenersByEvent.set(event, list);
    return this;
  }

  addListener(event: string | symbol, listener: Listener): this {
    return this.on(event, listener);
  }

  once(event: string | symbol, listener: Listener): this {
    const wrapper: Listener = (...args) => {
      this.off(event, listener);
      listener(...args);
    };
    this.onceWrappers.set(listener, wrapper);
    return this.on(event, wrapper);
  }

  off(event: string | symbol, listener: Listener): this {
    const list = this.listenersByEvent.get(event);
    if (!list) return this;
    const target = this.onceWrappers.get(listener) ?? listener;
    const idx = list.indexOf(target);
    if (idx !== -1) list.splice(idx, 1);
    if (list.length === 0) this.listenersByEvent.delete(event);
    return this;
  }

  removeListener(event: string | symbol, listener: Listener): this {
    return this.off(event, listener);
  }

  removeAllListeners(event?: string | symbol): this {
    if (event === undefined) this.listenersByEvent.clear();
    else this.listenersByEvent.delete(event);
    return this;
  }

  emit(event: string | symbol, ...args: unknown[]): boolean {
    const list = this.listenersByEvent.get(event);
    if (!list || list.length === 0) return false;
    for (const listener of [...list]) listener(...args);
    return true;
  }

  listenerCount(event: string | symbol): number {
    return this.listenersByEvent.get(event)?.length ?? 0;
  }

  listeners(event: string | symbol): Listener[] {
    return [...(this.listenersByEvent.get(event) ?? [])];
  }

  eventNames(): (string | symbol)[] {
    return [...this.listenersByEvent.keys()];
  }

  setMaxListeners(): this {
    return this;
  }
}

(EventEmitter as unknown as Record<string, unknown>).EventEmitter = EventEmitter;

export default EventEmitter;
