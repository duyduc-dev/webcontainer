import type { FsBuiltin } from "../runtime/builtins/fs";
import { resolvePath } from "./resolvePath";

interface ShellContext {
  fs: FsBuiltin;
  cwd: string;
  setCwd: (cwd: string) => void;
}

type Builtin = (argv: string[], ctx: ShellContext) => string;

const pwd: Builtin = (_argv, ctx) => `${ctx.cwd}\n`;

const cd: Builtin = (argv, ctx) => {
  const target = argv[1] ? resolvePath(ctx.cwd, argv[1]) : "/";
  const stat = ctx.fs.statSync(target);
  if (!stat.isDirectory()) throw new Error(`cd: not a directory: ${argv[1]}`);
  ctx.setCwd(target);
  return "";
};

const ls: Builtin = (argv, ctx) => {
  const target = argv[1] ? resolvePath(ctx.cwd, argv[1]) : ctx.cwd;
  return `${ctx.fs.readdirSync(target).join("\n")}\n`;
};

const cat: Builtin = (argv, ctx) => {
  if (!argv[1]) throw new Error("cat: missing operand");
  return new TextDecoder().decode(ctx.fs.readFileSync(resolvePath(ctx.cwd, argv[1])));
};

const mkdir: Builtin = (argv, ctx) => {
  const recursive = argv.includes("-p");
  const target = argv.slice(1).find((arg) => arg !== "-p");
  if (!target) throw new Error("mkdir: missing operand");
  ctx.fs.mkdirSync(resolvePath(ctx.cwd, target), { recursive });
  return "";
};

const echo: Builtin = (argv) => `${argv.slice(1).join(" ")}\n`;

const rm: Builtin = (argv, ctx) => {
  const recursive = argv.some((arg) => arg === "-r" || arg === "-rf" || arg === "-fr");
  const target = argv.slice(1).find((arg) => !arg.startsWith("-"));
  if (!target) throw new Error("rm: missing operand");
  ctx.fs.rmSync(resolvePath(ctx.cwd, target), { recursive });
  return "";
};

const mv: Builtin = (argv, ctx) => {
  const [, from, to] = argv;
  if (!from || !to) throw new Error("mv: missing operand");
  ctx.fs.renameSync(resolvePath(ctx.cwd, from), resolvePath(ctx.cwd, to));
  return "";
};

const builtins: Record<string, Builtin> = { pwd, cd, ls, cat, mkdir, echo, rm, mv };

export { builtins };
export type { Builtin, ShellContext };
