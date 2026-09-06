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

const createOsModule = (process: ProcessLike = {}) => {
  const env = process.env ?? {};

  return {
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
