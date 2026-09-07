/**
 * Hand-written, not vendored: real Node's `readline` module is intertwined
 * with `tty`'s raw-mode terminal handling (per-keystroke input, ANSI cursor
 * movement for in-place line editing, real local echo) - reimplementing
 * that faithfully needs a real raw-mode TTY this runtime doesn't have.
 * Scoped to the concrete traced need instead: real npm's own `read`
 * dependency (used by `npm init`/`npm create`'s y/n and text prompts) does
 * `readline.createInterface({ input, output, terminal, completer })` then
 * `.setPrompt()`/`.prompt()`/`.on('line', ...)`/`.on('SIGINT', ...)`/
 * `.close()` - a "cooked mode" line reader (buffer bytes, split on
 * newlines, emit one 'line' event per complete line) covers this
 * correctly, since dwc.process.spawn()'s `.stdin` is a plain byte stream
 * either way (whether the host writes it byte-by-byte as a user types, or
 * a whole answer at once from a script) - the buffering here handles both
 * identically.
 *
 * Deliberately NOT implemented: real per-keystroke local echo and in-place
 * line editing (backspace/arrow-key redraw via ANSI escapes). A caller
 * driving this from a real interactive terminal (e.g. this project's own
 * xterm.js-backed playground, piping keystrokes to stdin one at a time)
 * would currently see no echo of what they're typing until they press
 * enter - a real, known gap, not silently "handled". `edit`-mode prompts
 * (`rl.line`/`rl.cursor` pre-filled, `_refreshLine()` called to make an
 * editable default visible) get a best-effort approximation: the initial
 * `line` value is written to output once, not kept in sync with further
 * edits.
 */

interface ReadableLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
}

interface WritableLike {
  write(chunk: string): unknown;
  isTTY?: boolean;
}

interface CreateInterfaceOptions {
  input: ReadableLike;
  output?: WritableLike;
  terminal?: boolean;
  completer?: unknown;
  prompt?: string;
}

interface EventEmitterLike {
  emit(event: string, ...args: unknown[]): boolean;
}

const toText = (chunk: unknown): string => {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk);
  return String(chunk);
};

const createReadlineModule = (EventEmitterCtor: new () => EventEmitterLike) => {
  class Interface extends (EventEmitterCtor as new () => EventEmitterLike) {
    // Real (ECMAScript) private fields, not the TS `private` modifier -
    // this class's type is inferred through createReadlineModule()'s
    // return value, and TS's declaration-file emit can't express a
    // TS-level `private` modifier on an anonymous/locally-scoped class
    // exposed that way. `#field` is a runtime feature, not just a
    // type-level annotation, so declaration emit has no trouble with it.
    readonly #input: ReadableLike;
    readonly #output?: WritableLike;
    #buffer = "";
    #promptString = "> ";
    #closed = false;
    // Real readline's `.line`/`.cursor` - the in-progress edited line and
    // cursor offset. Only ever set here by a caller pre-filling an
    // editable default (real npm's own `read` dependency's `editDef`
    // feature); never updated by keystroke tracking, since there's no
    // real per-keystroke echo/editing here (see this module's own doc
    // comment).
    line = "";
    cursor = 0;

    readonly #onData = (chunk: unknown): void => {
      if (this.#closed) return;
      this.#buffer += toText(chunk);
      for (;;) {
        const newlineIndex = this.#buffer.indexOf("\n");
        if (newlineIndex === -1) break;
        const rawLine = this.#buffer.slice(0, newlineIndex);
        this.#buffer = this.#buffer.slice(newlineIndex + 1);
        // Strip a trailing \r too (CRLF input), matching real readline.
        (this as unknown as EventEmitterLike).emit("line", rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine);
      }
    };

    constructor(options: CreateInterfaceOptions) {
      super();
      this.#input = options.input;
      this.#output = options.output;
      if (options.prompt !== undefined) this.#promptString = options.prompt;
      this.#input.on("data", this.#onData);
    }

    setPrompt(prompt: string): void {
      this.#promptString = prompt;
    }

    prompt(): void {
      this.#output?.write(this.#promptString);
    }

    // Best-effort approximation of real readline's in-place redraw (see
    // this module's own doc comment) - writes the current `line` value
    // once rather than truly re-rendering the terminal line in place.
    _refreshLine(): void {
      if (this.line) this.#output?.write(this.line);
    }

    close(): void {
      if (this.#closed) return;
      this.#closed = true;
      this.#input.off?.("data", this.#onData);
      (this as unknown as EventEmitterLike).emit("close");
    }
  }

  const createInterface = (optionsOrInput: CreateInterfaceOptions | ReadableLike): Interface => {
    const options: CreateInterfaceOptions =
      "input" in optionsOrInput ? optionsOrInput : { input: optionsOrInput as ReadableLike };
    return new Interface(options);
  };

  return { createInterface, Interface };
};

export { createReadlineModule };
