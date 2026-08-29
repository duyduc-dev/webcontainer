import { DuckWebContainer } from "@dwc/core";

export type CheckResult = { name: string; pass: boolean; detail: string };

async function check(name: string, fn: () => Promise<string>): Promise<CheckResult> {
  try {
    const detail = await fn();
    return { name, pass: true, detail };
  } catch (error) {
    return { name, pass: false, detail: String(error) };
  }
}

// Exercises the sync fs bridge (Phase 1) and the expanded builtin surface
// (Phase 2) through the public API, the same way a consumer app would —
// a repeatable alternative to typing multi-line scripts into the terminal.
export async function runVerification(dwc: DuckWebContainer): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push({
    name: "cross-origin isolation",
    pass: true,
    detail: self.crossOriginIsolated
      ? "crossOriginIsolated = true — sync fs bridge active"
      : "crossOriginIsolated = false — static-preload fallback active (set COOP/COEP headers to enable the sync bridge)",
  });

  await dwc.fs.mkdir("/verify", { recursive: true });

  results.push(
    await check("dynamic require() (computed specifier)", async () => {
      await dwc.fs.writeFile(
        "/verify/greeter.js",
        'module.exports = { greet: function (n) { return "hello, " + n; } };\n',
      );
      const script = [
        'var base = "gree";',
        'var suffix = "ter";',
        'var mod = require("./" + base + suffix + ".js");',
        'console.log(mod.greet("dwc"));',
      ].join("\n");
      await dwc.fs.writeFile("/verify/dyn-require.js", script + "\n");
      const result = await dwc.shell.exec("node /verify/dyn-require.js");
      if (result.exitCode !== 0) throw new Error(result.stderr);
      if (!result.stdout.includes("hello, dwc")) {
        throw new Error(`unexpected output: ${result.stdout}`);
      }
      return result.stdout.trim();
    }),
  );

  results.push(
    await check("fs.*Sync on a computed path", async () => {
      await dwc.fs.writeFile("/verify/data.txt", "computed-path-content");
      const script = [
        'var fs = require("fs");',
        'var dir = "/ver" + "ify";',
        'var file = dir + "/data.txt";',
        'console.log("exists=" + fs.existsSync(file));',
        'console.log("read=" + fs.readFileSync(file, "utf8"));',
        'console.log("isFile=" + fs.statSync(file).isFile());',
        'console.log("dirCount=" + fs.readdirSync(dir).length);',
      ].join("\n");
      await dwc.fs.writeFile("/verify/fs-test.js", script + "\n");
      const result = await dwc.shell.exec("node /verify/fs-test.js");
      if (result.exitCode !== 0) throw new Error(result.stderr);
      return result.stdout.trim().replace(/\n/g, ", ");
    }),
  );

  results.push(
    await check('Buffer global + require("buffer")', async () => {
      const script = [
        'var b = Buffer.from("hello", "utf8");',
        'console.log("hex=" + b.toString("hex"));',
        'console.log("sameClass=" + (require("buffer").Buffer === Buffer));',
      ].join("\n");
      await dwc.fs.writeFile("/verify/buffer-test.js", script + "\n");
      const result = await dwc.shell.exec("node /verify/buffer-test.js");
      if (result.exitCode !== 0) throw new Error(result.stderr);
      return result.stdout.trim().replace(/\n/g, ", ");
    }),
  );

  results.push(
    await check("os / url builtins", async () => {
      const script = [
        'var os = require("os");',
        'var url = require("url");',
        'console.log("platform=" + os.platform());',
        'console.log("fileUrlRoundtrip=" + url.fileURLToPath(url.pathToFileURL("/verify/x.txt")));',
      ].join("\n");
      await dwc.fs.writeFile("/verify/os-url-test.js", script + "\n");
      const result = await dwc.shell.exec("node /verify/os-url-test.js");
      if (result.exitCode !== 0) throw new Error(result.stderr);
      return result.stdout.trim().replace(/\n/g, ", ");
    }),
  );

  results.push(
    await check("child_process stub fails cleanly (no crash/hang)", async () => {
      const script = [
        'var cp = require("child_process");',
        'var child = cp.spawn("ls");',
        'child.on("error", function (err) { console.log("error=" + err.message); });',
      ].join("\n");
      await dwc.fs.writeFile("/verify/cp-test.js", script + "\n");
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timed out after 8s")), 8000),
      );
      const result = await Promise.race([dwc.shell.exec("node /verify/cp-test.js"), timeout]);
      if (result.exitCode !== 0) throw new Error(result.stderr);
      if (!result.stdout.includes("not supported")) {
        throw new Error(`unexpected output: ${result.stdout}`);
      }
      return result.stdout.trim();
    }),
  );

  results.push(
    await check("EFBIG on an oversized sync fs read (no hang)", async () => {
      const big = "x".repeat(9 * 1024 * 1024); // 9 MiB > the 8 MiB sync channel capacity
      await dwc.fs.writeFile("/verify/huge.txt", big);
      const script = 'require("fs").readFileSync("/verify/huge.txt");\n';
      await dwc.fs.writeFile("/verify/huge-test.js", script);
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timed out after 8s — should fail fast, not hang")), 8000),
      );
      const result = await Promise.race([dwc.shell.exec("node /verify/huge-test.js"), timeout]);
      if (!self.crossOriginIsolated) {
        return "skipped (only applies to the sync transport)";
      }
      if (result.exitCode === 0) throw new Error("expected this to fail with EFBIG");
      if (!result.stderr.includes("too large")) throw new Error(`unexpected error: ${result.stderr}`);
      return "failed cleanly, as expected: file too large for sync fs channel";
    }),
  );

  return results;
}
