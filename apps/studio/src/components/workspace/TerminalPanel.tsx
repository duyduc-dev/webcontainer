import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { BootWCReturn } from "duckwc";
import { Icon } from "@/Icons";
import { SHELL_ENV } from "@/duck/project";
import { XTERM_THEME } from "@/duck/xterm-theme";
import type { ThemeName } from "@/theme-context";

export interface TerminalHandle {
  /** Writes a chunk of already-decoded text (e.g. a piped install/dev
   * stream) straight into the live terminal buffer. */
  write(text: string): void;
  clear(): void;
  refit(): void;
}

const ENTER = "\r";
const BACKSPACE = "";
const CTRL_C = "";

const relativeLabel = (dir: string, projectPath: string): string => {
  if (dir === projectPath) return projectPath.slice(1) || "/";
  return dir.startsWith(`${projectPath}/`) ? dir.slice(projectPath.length + 1) : dir;
};

export const TerminalPanel = forwardRef<
  TerminalHandle,
  {
    dwc: BootWCReturn;
    projectPath: string;
    theme: ThemeName;
    /** True while a foreground setup step (install/dev boot) owns the
     * terminal's output - the interactive prompt is suspended until it
     * settles, same as a real shell waiting on a foreground job. */
    busy: boolean;
    onHide: () => void;
  }
>(function TerminalPanel({ dwc, projectPath, theme, busy, onHide }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const currentDirRef = useRef(projectPath);
  const lineRef = useRef("");
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(0);
  const activeKillRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(busy);
  const promptedRef = useRef(false);

  useImperativeHandle(ref, () => ({
    write: (text) => termRef.current?.write(text),
    clear: () => termRef.current?.clear(),
    refit: () => {
      try {
        fitRef.current?.fit();
      } catch {
        // Not currently visible - nothing to fit against yet.
      }
    },
  }));

  useEffect(() => {
    busyRef.current = busy;
    if (!busy) writePromptIfIdle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = XTERM_THEME[theme];
  }, [theme]);

  function writePromptIfIdle(): void {
    const term = termRef.current;
    if (!term || busyRef.current || activeKillRef.current) return;
    if (promptedRef.current) return;
    promptedRef.current = true;
    term.write(`\r\n\x1b[36m${relativeLabel(currentDirRef.current, projectPath)}\x1b[0m $ `);
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "'Geist Mono', ui-monospace, Consolas, monospace",
      fontSize: 12.5,
      scrollback: 2000,
      theme: XTERM_THEME[theme],
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try {
      fit.fit();
    } catch {
      // Host not laid out yet on this exact frame - the ResizeObserver below
      // will fit again once it is.
    }
    termRef.current = term;
    fitRef.current = fit;

    const runLine = async (line: string): Promise<void> => {
      const [command, ...args] = line.trim().split(/\s+/);
      if (command === "cd") {
        const target = args[0] ?? "/";
        const candidate = target.startsWith("/") ? target : `${currentDirRef.current}/${target}`;
        try {
          const real = await dwc.fs.realpath(candidate);
          const stat = await dwc.fs.stat(real);
          if (!stat.isDirectory()) throw new Error("not a directory");
          currentDirRef.current = real;
        } catch {
          term.write(`cd: no such file or directory: ${target}\r\n`);
        }
        promptedRef.current = false;
        writePromptIfIdle();
        return;
      }

      const handle = await dwc.shell.spawn(line, { cwd: currentDirRef.current, env: SHELL_ENV });
      activeKillRef.current = () => handle.kill();
      const decoder1 = new TextDecoder();
      const decoder2 = new TextDecoder();
      const pump = (stream: ReadableStream<Uint8Array>, decoder: TextDecoder) => {
        const reader = stream.getReader();
        void (async () => {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            term.write(decoder.decode(value, { stream: true }));
          }
        })();
      };
      pump(handle.stdout, decoder1);
      pump(handle.stderr, decoder2);
      await handle.exit;
      activeKillRef.current = null;
      promptedRef.current = false;
      writePromptIfIdle();
    };

    const dataDisposable = term.onData((data) => {
      if (activeKillRef.current) {
        if (data === CTRL_C) activeKillRef.current();
        return;
      }
      if (busyRef.current) return;

      for (const ch of data) {
        if (ch === ENTER) {
          const line = lineRef.current;
          term.write("\r\n");
          lineRef.current = "";
          if (line.trim()) {
            historyRef.current.push(line);
            historyIndexRef.current = historyRef.current.length;
            void runLine(line);
          } else {
            promptedRef.current = false;
            writePromptIfIdle();
          }
        } else if (ch === BACKSPACE) {
          if (lineRef.current.length > 0) {
            lineRef.current = lineRef.current.slice(0, -1);
            term.write("\b \b");
          }
        } else if (ch === CTRL_C) {
          lineRef.current = "";
          term.write("^C");
          promptedRef.current = false;
          writePromptIfIdle();
        } else if (ch >= " " || ch === "\t") {
          lineRef.current += ch;
          term.write(ch);
        }
      }
    });

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || activeKillRef.current || busyRef.current) return true;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const history = historyRef.current;
        if (history.length === 0) return false;
        if (event.key === "ArrowUp") historyIndexRef.current = Math.max(0, historyIndexRef.current - 1);
        else historyIndexRef.current = Math.min(history.length, historyIndexRef.current + 1);
        const next = history[historyIndexRef.current] ?? "";
        term.write("\b \b".repeat(lineRef.current.length) + next);
        lineRef.current = next;
        return false;
      }
      return true;
    });

    writePromptIfIdle();

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // Hidden (zero size) - nothing to fit against right now.
      }
    });
    resizeObserver.observe(host);

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // Only ever (re)constructed once per project - dwc/projectPath don't
    // change under a mounted WorkspacePage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_14px_rgba(0,0,0,0.06)]">
      <div className="flex h-8.5 shrink-0 items-center gap-2 border-b border-border-light px-3.5">
        <Icon name="terminal" size={13} className="text-muted-foreground" />
        <span className="text-xs font-medium">Terminal</span>
        <span className="flex-1" />
        <button
          type="button"
          title="Hide"
          onClick={onHide}
          className="flex h-5.5 w-5.5 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-muted-foreground"
        >
          <Icon name="x" size={13} />
        </button>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 px-2 py-1.5" />
    </div>
  );
});
