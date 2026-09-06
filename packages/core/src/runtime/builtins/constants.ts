// Hand-written, not vendored: real Node's `require('constants')` is a
// deprecated legacy alias for `fs.constants` (plus os/signal constants this
// runtime has no use for) that plenty of older ecosystem packages still
// `require()` directly - e.g. graceful-fs's polyfills.js reads O_WRONLY (and
// gracefully no-ops without O_SYMLINK, which real Node doesn't define on
// Linux either - platform this runtime always reports as). Real, fixed
// Linux flag values (glibc), not placeholders - code that branches on the
// actual bit pattern (rare, but real) still gets a correct answer.
const createConstantsModule = () => ({
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  O_CREAT: 64,
  O_EXCL: 128,
  O_NOCTTY: 256,
  O_TRUNC: 512,
  O_APPEND: 1024,
  O_NONBLOCK: 2048,
  O_DIRECTORY: 65536,
  O_NOFOLLOW: 131072,
  O_DIRECT: 16384,
  O_NOATIME: 262144,
  O_SYNC: 1052672,
  F_OK: 0,
  X_OK: 1,
  W_OK: 2,
  R_OK: 4,
});

export { createConstantsModule };
