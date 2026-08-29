// Fixed, sensible values for the environment-probing calls real packages
// make — there's no real OS underneath a Worker. "linux"/POSIX-shaped
// answers avoid steering code onto Windows-specific (backslash) paths, which
// would conflict with this project's POSIX-only `path`/fs conventions.
const os = {
  EOL: "\n",
  platform: () => "linux" as const,
  type: () => "Linux",
  arch: () => "x64" as const,
  release: () => "0.0.0-dwc",
  version: () => "#1 SMP dwc",
  tmpdir: () => "/tmp",
  homedir: () => "/root",
  hostname: () => "dwc-sandbox",
  endianness: () => "LE" as const,
  totalmem: () => 0,
  freemem: () => 0,
  uptime: () => 0,
  cpus: () => [
    { model: "dwc-virtual-cpu", speed: 0, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } },
  ],
  userInfo: () => ({ username: "dwc", uid: 0, gid: 0, shell: null, homedir: "/root" }),
  networkInterfaces: () => ({}),
};

export default os;
