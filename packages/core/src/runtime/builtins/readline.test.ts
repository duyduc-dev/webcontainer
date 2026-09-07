import { describe, expect, it, vi } from "vitest";
import { createReadlineModule } from "./readline";

// A minimal but real EventEmitter (on/off/emit) - readline.Interface extends
// this the same way it extends the real vendored one in production, so
// these tests exercise actual inheritance/emit behavior, not a stub.
class FakeEventEmitter {
  #listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  on(event: string, listener: (...args: unknown[]) => void): this {
    const list = this.#listeners.get(event) ?? [];
    list.push(listener);
    this.#listeners.set(event, list);
    return this;
  }
  emit(event: string, ...args: unknown[]): boolean {
    const list = this.#listeners.get(event);
    if (!list) return false;
    for (const listener of list) listener(...args);
    return list.length > 0;
  }
}

class FakeInput extends FakeEventEmitter {
  off(event: string, listener: (...args: unknown[]) => void): this {
    // Real Node's EventListener#off - only needs to exist for this suite;
    // Interface.close() calls it but no test here asserts removal.
    void event;
    void listener;
    return this;
  }
  write(chunk: Uint8Array): void {
    this.emit("data", chunk);
  }
}

const { createInterface } = createReadlineModule(FakeEventEmitter);

describe("readline.createInterface", () => {
  it("buffers input and emits one 'line' event per newline-terminated line, stripping the newline", () => {
    const input = new FakeInput();
    const rl = createInterface({ input });
    const lines: string[] = [];
    (rl as unknown as FakeEventEmitter).on("line", (line: unknown) => lines.push(line as string));

    input.write(new TextEncoder().encode("y\n"));
    expect(lines).toEqual(["y"]);
  });

  it("strips a trailing \\r too (CRLF input)", () => {
    const input = new FakeInput();
    const rl = createInterface({ input });
    const lines: string[] = [];
    (rl as unknown as FakeEventEmitter).on("line", (line: unknown) => lines.push(line as string));

    input.write(new TextEncoder().encode("hello\r\n"));
    expect(lines).toEqual(["hello"]);
  });

  it("handles a line arriving across multiple chunks (byte-at-a-time input)", () => {
    const input = new FakeInput();
    const rl = createInterface({ input });
    const lines: string[] = [];
    (rl as unknown as FakeEventEmitter).on("line", (line: unknown) => lines.push(line as string));

    for (const ch of "no\n") input.write(new TextEncoder().encode(ch));
    expect(lines).toEqual(["no"]);
  });

  it("emits multiple 'line' events from one chunk containing multiple newlines", () => {
    const input = new FakeInput();
    const rl = createInterface({ input });
    const lines: string[] = [];
    (rl as unknown as FakeEventEmitter).on("line", (line: unknown) => lines.push(line as string));

    input.write(new TextEncoder().encode("a\nb\nc\n"));
    expect(lines).toEqual(["a", "b", "c"]);
  });

  it("prompt() writes the set prompt string to output", () => {
    const input = new FakeInput();
    const output = { write: vi.fn() };
    const rl = createInterface({ input, output });
    rl.setPrompt("name: ");
    rl.prompt();
    expect(output.write).toHaveBeenCalledWith("name: ");
  });

  it("accepts a bare input stream (no options object), matching real Node's overload", () => {
    const input = new FakeInput();
    const rl = createInterface(input as never);
    const lines: string[] = [];
    (rl as unknown as FakeEventEmitter).on("line", (line: unknown) => lines.push(line as string));

    input.write(new TextEncoder().encode("ok\n"));
    expect(lines).toEqual(["ok"]);
  });

  it("close() emits 'close' and stops further 'line' events", () => {
    const input = new FakeInput();
    const rl = createInterface({ input });
    const closeHandler = vi.fn();
    const lineHandler = vi.fn();
    (rl as unknown as FakeEventEmitter).on("close", closeHandler);
    (rl as unknown as FakeEventEmitter).on("line", lineHandler);

    rl.close();
    expect(closeHandler).toHaveBeenCalledOnce();

    input.write(new TextEncoder().encode("too-late\n"));
    expect(lineHandler).not.toHaveBeenCalled();
  });

  it("partial input with no trailing newline yet does not emit a 'line'", () => {
    const input = new FakeInput();
    const rl = createInterface({ input });
    const lineHandler = vi.fn();
    (rl as unknown as FakeEventEmitter).on("line", lineHandler);

    input.write(new TextEncoder().encode("still typing"));
    expect(lineHandler).not.toHaveBeenCalled();
  });
});
