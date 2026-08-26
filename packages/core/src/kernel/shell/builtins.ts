import { FSError } from "../fs/FSError";
import { VirtualFileSystem } from "../fs/VirtualFileSystem";
import { resolvePath } from "./resolvePath";

export type ShellContext = {
  cwd: string;
  vfs: VirtualFileSystem;
  env: Record<string, string>;
};

export type BuiltinResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd?: string;
};

export type Builtin = (args: string[], ctx: ShellContext) => BuiltinResult;

const ok = (stdout = ""): BuiltinResult => ({
  stdout,
  stderr: "",
  exitCode: 0,
});
const fail = (stderr: string, exitCode = 1): BuiltinResult => ({
  stdout: "",
  stderr,
  exitCode,
});

function describeError(error: unknown): string {
  return error instanceof FSError
    ? `${error.code}: ${error.path}`
    : String(error);
}

export const builtins: Record<string, Builtin> = {
  pwd(_args, ctx) {
    return ok(ctx.cwd);
  },

  cd(args, ctx) {
    const target = args[0] ?? "/";
    const path = resolvePath(ctx.cwd, target);
    try {
      const stat = ctx.vfs.stat(path);
      if (stat.type !== "dir") return fail(`cd: not a directory: ${target}`);
      return { stdout: "", stderr: "", exitCode: 0, cwd: path };
    } catch (error) {
      return fail(`cd: ${describeError(error)}`);
    }
  },

  ls(args, ctx) {
    const target = resolvePath(ctx.cwd, args[0] ?? ".");
    try {
      return ok(ctx.vfs.readdir(target).join("\n"));
    } catch (error) {
      return fail(`ls: ${describeError(error)}`);
    }
  },

  cat(args, ctx) {
    if (args.length === 0) return fail("cat: missing file operand");
    const outputs: string[] = [];
    for (const arg of args) {
      const path = resolvePath(ctx.cwd, arg);
      try {
        outputs.push(new TextDecoder().decode(ctx.vfs.readFile(path)));
      } catch (error) {
        return fail(`cat: ${describeError(error)}`);
      }
    }
    return ok(outputs.join(""));
  },

  mkdir(args, ctx) {
    const recursive = args.includes("-p");
    const targets = args.filter((arg) => arg !== "-p");
    if (targets.length === 0) return fail("mkdir: missing operand");
    for (const arg of targets) {
      try {
        ctx.vfs.mkdir(resolvePath(ctx.cwd, arg), { recursive });
      } catch (error) {
        return fail(`mkdir: ${describeError(error)}`);
      }
    }
    return ok();
  },

  touch(args, ctx) {
    if (args.length === 0) return fail("touch: missing file operand");
    for (const arg of args) {
      const path = resolvePath(ctx.cwd, arg);
      try {
        if (!ctx.vfs.exists(path)) ctx.vfs.writeFile(path, new Uint8Array());
      } catch (error) {
        return fail(`touch: ${describeError(error)}`);
      }
    }
    return ok();
  },

  echo(args) {
    return ok(`${args.join(" ")}\n`);
  },

  rm(args, ctx) {
    const recursive = args.some(
      (a) => a === "-r" || a === "-rf" || a === "-fr",
    );
    const targets = args.filter((arg) => !arg.startsWith("-"));
    if (targets.length === 0) return fail("rm: missing operand");
    for (const arg of targets) {
      try {
        ctx.vfs.rm(resolvePath(ctx.cwd, arg), { recursive });
      } catch (error) {
        return fail(`rm: ${describeError(error)}`);
      }
    }
    return ok();
  },

  mv(args, ctx) {
    if (args.length !== 2) return fail("mv: usage: mv <src> <dest>");
    try {
      ctx.vfs.rename(
        resolvePath(ctx.cwd, args[0]),
        resolvePath(ctx.cwd, args[1]),
      );
    } catch (error) {
      return fail(`mv: ${describeError(error)}`);
    }
    return ok();
  },
};
