import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { DuckWebContainer } from "@dwc/core";

const PROMPT_SUFFIX = " $ ";

function toCrlf(text: string): string {
  return text.replace(/\n/g, "\r\n");
}

export function attachTerminal(dwc: DuckWebContainer, container: HTMLElement) {
  const term = new Terminal({
    convertEol: false,
    cursorBlink: true,
  });
  term.open(container);

  let line = "";
  let cwd = "/";

  const writePrompt = () => {
    term.write(`\r\n${cwd}${PROMPT_SUFFIX}`);
  };

  writePrompt();

  // A command that starts a listening server never exits on its own — a real
  // foreground server blocks a real shell the same way. So the terminal has
  // to move on as soon as the server starts, not wait for an exit that may
  // never come. `pendingAdvance` is whichever comes first for the in-flight
  // command: a normal exit, or the server starting to listen.
  let pendingAdvance: (() => void) | null = null;

  dwc.on("listen", () => {
    pendingAdvance?.();
  });

  term.onData(async (data) => {
    if (data === "\r") {
      term.write("\r\n");
      const command = line;
      line = "";

      if (command.trim() === "") {
        writePrompt();
        return;
      }

      const process = await dwc.shell.spawn(command);
      let advanced = false;
      const advance = (newCwd?: string) => {
        if (advanced) return;
        advanced = true;
        pendingAdvance = null;
        if (newCwd !== undefined) cwd = newCwd;
        writePrompt();
      };
      pendingAdvance = () => advance();

      process.onData((_stream, chunk) => {
        term.write(toCrlf(chunk));
      });
      process.onExit((_exitCode, newCwd) => {
        advance(newCwd);
      });
      return;
    }

    if (data === "\u007F") {
      if (line.length > 0) {
        line = line.slice(0, -1);
        term.write("\b \b");
      }
      return;
    }

    if (data === "\u0003") {
      line = "";
      writePrompt();
      return;
    }

    line += data;
    term.write(data);
  });

  return term;
}
