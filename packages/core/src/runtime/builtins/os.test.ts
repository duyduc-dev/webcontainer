import { describe, expect, it } from "vitest";
import { createOsModule } from "./os";

describe("createOsModule", () => {
  it("reports a plausible, fixed platform/arch (there is no real host OS)", () => {
    const os = createOsModule();
    expect(os.platform()).toBe("linux");
    expect(os.arch()).toBe("x64");
  });

  it("homedir/tmpdir default when no matching env var is set", () => {
    const os = createOsModule({ env: {} });
    expect(os.homedir()).toBe("/home/user");
    expect(os.tmpdir()).toBe("/tmp");
  });

  it("homedir/tmpdir honor HOME/TMPDIR when set", () => {
    const os = createOsModule({ env: { HOME: "/root", TMPDIR: "/scratch" } });
    expect(os.homedir()).toBe("/root");
    expect(os.tmpdir()).toBe("/scratch");
  });

  it("availableParallelism and cpus() agree on count and never report zero", () => {
    const os = createOsModule();
    expect(os.availableParallelism()).toBeGreaterThanOrEqual(1);
    expect(os.cpus().length).toBe(os.availableParallelism());
  });

  it("EOL is a plain newline", () => {
    expect(createOsModule().EOL).toBe("\n");
  });

  it("constants.errno exposes standard Linux errno codes by name", () => {
    const os = createOsModule();
    // Real, fixed Linux/glibc values (traced need: @npmcli/fs's own
    // cp/polyfill.js destructures exactly these four at module load).
    expect(os.constants.errno.ENOENT).toBe(2);
    expect(os.constants.errno.EEXIST).toBe(17);
    expect(os.constants.errno.ENOTDIR).toBe(20);
    expect(os.constants.errno.EISDIR).toBe(21);
    expect(os.constants.errno.EINVAL).toBe(22);
  });
});
