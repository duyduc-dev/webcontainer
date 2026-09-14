import { useEffect, useRef, useState } from "react";
// Loads Monaco + its workers from jsdelivr at runtime (the package's own
// default). A local, self-hosted build was tried first (`monaco-editor` +
// `?worker` imports) but Vite 8's Rolldown bundler can't resolve those
// worker specifiers ("Rolldown failed to resolve import ...editor.worker.js
// ?worker") - a real bug in this app's own build tooling, not something to
// route around by changing that tooling. Revisit self-hosting once that's
// fixed upstream or this app moves off Rolldown-based Vite.
import Editor from "@monaco-editor/react";
import type { BootWCReturn } from "duckwc";
import { Icon } from "@/Icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { fileMeta, languageForPath, readTextFile, writeTextFile } from "@/duck/vfs";
import { useTheme } from "@/use-theme";

const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

function Tab({
  path,
  active,
  onSelect,
  onClose,
}: {
  path: string;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const { color, badge } = fileMeta(path);
  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 py-1.5 text-[12.5px]",
        active ? "bg-secondary text-foreground" : "bg-transparent text-muted-foreground",
      )}
    >
      <span
        className="flex h-2.5 w-2 shrink-0 items-end justify-center rounded-sm text-[6px] font-bold leading-none"
        style={{ background: color, color: "var(--card)" }}
      >
        {badge}
      </span>
      {basename(path)}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center border-none bg-transparent text-muted-foreground"
      >
        <Icon name="x" size={10} />
      </button>
    </div>
  );
}

export function EditorPane({
  dwc,
  openPaths,
  activePath,
  onSelect,
  onClose,
}: {
  dwc: BootWCReturn;
  openPaths: string[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  const [content, setContent] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const loadToken = useRef(0);
  const { theme } = useTheme();

  useEffect(() => {
    if (!activePath) return;
    const token = ++loadToken.current;
    void readTextFile(dwc, activePath).then((text) => {
      if (loadToken.current === token) setContent(text);
    });
  }, [dwc, activePath]);

  const onChange = (value: string | undefined) => {
    const text = value ?? "";
    setContent(text);
    if (!activePath) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void writeTextFile(dwc, activePath, text).then(() => setSavedAt(Date.now()));
    }, 400);
  };

  return (
    <div className="flex flex-[0.66] min-h-0 flex-col overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_14px_rgba(0,0,0,0.06)]">
      <ScrollArea className="h-10.5 shrink-0">
        <div className="flex items-center gap-1.5 px-2.5 pt-2">
          {openPaths.map((path) => (
            <Tab key={path} path={path} active={path === activePath} onSelect={() => onSelect(path)} onClose={() => onClose(path)} />
          ))}
        </div>
      </ScrollArea>
      {activePath ? (
        <Editor
          path={activePath}
          language={languageForPath(activePath)}
          value={content}
          onChange={onChange}
          theme={theme === "dark" ? "vs-dark" : "light"}
          options={{
            fontFamily: "'Geist Mono', ui-monospace, Consolas, monospace",
            fontSize: 13,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 14 },
          }}
          className="flex-1"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Select a file to start editing
        </div>
      )}
      <div className="h-5 shrink-0 px-4 text-right text-[10px] text-muted-foreground">
        {savedAt ? "Saved" : " "}
      </div>
    </div>
  );
}
