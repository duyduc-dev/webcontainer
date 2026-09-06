// Hand-written, not vendored: real Node's tty module wraps actual terminal
// syscalls that don't exist in a browser sandbox. `isatty()` is the only
// call any traced vendored code (supports-color) actually makes - always
// `false`, matching this runtime's stdout/stderr streams (see
// workers/process/worker.ts's createWritableStream: `isTTY: false`).
const createTtyModule = () => ({
  isatty: () => false,
});

export { createTtyModule };
