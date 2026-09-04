import { builtins } from "./builtins";
import type { ShellContext } from "./builtins";
import { resolvePath } from "./resolvePath";
import { parseCommands, tokenize } from "./tokenize";

interface RunShellLineResult {
  output: string;
  cwd: string;
}

/** Runs an `&&`-chained shell line against the given fs, resolving each built-in through it. */
const runShellLine = (line: string, initialCwd: string, fs: ShellContext["fs"]): RunShellLineResult => {
  let cwd = initialCwd;
  let output = "";

  for (const command of parseCommands(tokenize(line))) {
    const [name] = command.argv;
    const builtin = builtins[name];
    if (!builtin) throw new Error(`${name}: command not found`);

    const result = builtin(command.argv, {
      fs,
      cwd,
      setCwd: (next) => {
        cwd = next;
      },
    });

    if (command.redirectOut) {
      fs.writeFileSync(resolvePath(cwd, command.redirectOut), result);
    } else {
      output += result;
    }
  }

  return { output, cwd };
};

export { runShellLine };
export type { RunShellLineResult };
