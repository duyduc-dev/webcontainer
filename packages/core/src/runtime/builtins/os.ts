// Hand-written, not vendored: real Node's lib/os.js is a thin wrapper over
// internalBinding('os'), which reaches actual OS syscalls (uname, getpwuid,
// sysconf) that don't exist in a browser sandbox. This exposes just what
// vendored/bundled npm code actually calls (traced via a locally vendored
// npm@10.9.2's boot sequence): homedir/tmpdir/platform/arch/cpus/
// availableParallelism, plus a few more for completeness. Every value is a
// plausible, fixed stand-in - there is no real host OS to report on.
interface ProcessLike {
  env?: Record<string, string>;
}

// Real Node's os.constants.errno maps error names to their numeric codes -
// standard, fixed Linux/glibc values (this runtime always reports itself as
// linux/x64), not placeholders. Traced need: @npmcli/fs's own cp/polyfill.js
// destructures `os.constants.errno` directly at module load. Only errno is
// implemented (signals/priority/dlopen aren't part of any traced need yet).
const ERRNO = {
  EPERM: 1,
  ENOENT: 2,
  ESRCH: 3,
  EINTR: 4,
  EIO: 5,
  ENXIO: 6,
  E2BIG: 7,
  ENOEXEC: 8,
  EBADF: 9,
  ECHILD: 10,
  EAGAIN: 11,
  EWOULDBLOCK: 11,
  ENOMEM: 12,
  EACCES: 13,
  EFAULT: 14,
  EBUSY: 16,
  EEXIST: 17,
  EXDEV: 18,
  ENODEV: 19,
  ENOTDIR: 20,
  EISDIR: 21,
  EINVAL: 22,
  ENFILE: 23,
  EMFILE: 24,
  ENOTTY: 25,
  ETXTBSY: 26,
  EFBIG: 27,
  ENOSPC: 28,
  ESPIPE: 29,
  EROFS: 30,
  EMLINK: 31,
  EPIPE: 32,
  EDOM: 33,
  ERANGE: 34,
  EDEADLK: 35,
  ENAMETOOLONG: 36,
  ENOLCK: 37,
  ENOSYS: 38,
  ENOTEMPTY: 39,
  ELOOP: 40,
  ENOMSG: 42,
  EIDRM: 43,
  ENOSTR: 60,
  ENODATA: 61,
  ETIME: 62,
  ENOSR: 63,
  EPROTO: 71,
  EMULTIHOP: 72,
  EOVERFLOW: 75,
  EILSEQ: 84,
  ENOTSOCK: 88,
  EDESTADDRREQ: 89,
  EMSGSIZE: 90,
  EPROTOTYPE: 91,
  ENOPROTOOPT: 92,
  EPROTONOSUPPORT: 93,
  EOPNOTSUPP: 95,
  ENOTSUP: 95,
  EAFNOSUPPORT: 97,
  EADDRINUSE: 98,
  EADDRNOTAVAIL: 99,
  ENETDOWN: 100,
  ENETUNREACH: 101,
  ENETRESET: 102,
  ECONNABORTED: 103,
  ECONNRESET: 104,
  ENOBUFS: 105,
  EISCONN: 106,
  ENOTCONN: 107,
  ETIMEDOUT: 110,
  ECONNREFUSED: 111,
  EHOSTUNREACH: 113,
  EALREADY: 114,
  EINPROGRESS: 115,
  ESTALE: 116,
  EDQUOT: 122,
  ECANCELED: 125,
};

const createOsModule = (process: ProcessLike = {}) => {
  const env = process.env ?? {};

  return {
    constants: { errno: ERRNO },
    EOL: "\n",
    platform: () => "linux" as const,
    arch: () => "x64" as const,
    type: () => "Linux",
    release: () => "6.1.0",
    version: () => "#1 SMP PREEMPT_DYNAMIC",
    machine: () => "x86_64",
    homedir: () => env.HOME || "/home/user",
    tmpdir: () => env.TMPDIR || "/tmp",
    hostname: () => "localhost",
    endianness: () => "LE" as const,
    availableParallelism: () => (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 1,
    cpus: () => {
      const count = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 1;
      return Array.from({ length: count }, () => ({
        model: "Virtual CPU",
        speed: 0,
        times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
      }));
    },
    totalmem: () => 4 * 1024 * 1024 * 1024,
    freemem: () => 2 * 1024 * 1024 * 1024,
    loadavg: () => [0, 0, 0],
    uptime: () => 0,
    networkInterfaces: () => ({}),
    userInfo: () => ({ username: "user", homedir: env.HOME || "/home/user", shell: null, uid: -1, gid: -1 }),
    tmpDir: () => env.TMPDIR || "/tmp", // pre-v7 alias some old code still calls
  };
};

export { createOsModule };
export type { ProcessLike as OsProcessLike };
