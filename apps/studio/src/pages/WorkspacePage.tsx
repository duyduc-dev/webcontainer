import { useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/workspace/TopBar";
import { ActivityDock, type SidebarView } from "@/components/workspace/ActivityDock";
import { Explorer } from "@/components/workspace/Explorer";
import { EditorPane } from "@/components/workspace/EditorPane";
import { TerminalPanel, type TerminalHandle } from "@/components/workspace/TerminalPanel";
import { PreviewPanel } from "@/components/workspace/PreviewPanel";
import { CommandPalette, type PaletteCommand } from "@/components/workspace/CommandPalette";
import { cn } from "@/lib/utils";
import { getDwc } from "@/duck/session";
import { PREVIEW_PORT, runProject, type Project, type RunStatus } from "@/duck/project";
import { useTheme } from "@/use-theme";

export function WorkspacePage({ project, onGoHome }: { project: Project; onGoHome: () => void }) {
  const dwc = getDwc();
  const { theme } = useTheme();

  const [sidebarView, setSidebarView] = useState<SidebarView>("explorer");
  const [terminalVisible, setTerminalVisible] = useState(true);
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const startedFor = useRef<string | null>(null);
  const terminalRef = useRef<TerminalHandle>(null);

  const start = () => {
    if (runStatus === "installing" || runStatus === "starting") return;
    setTerminalVisible(true);
    setPreviewUrl(null);
    terminalRef.current?.clear();
    void runProject(project, {
      onLog: (_stream, text) => terminalRef.current?.write(text),
      onStatus: (status) => {
        setRunStatus(status);
        if (status === "ready") setPreviewUrl(dwc.preview.url(PREVIEW_PORT, "/"));
      },
    });
  };

  useEffect(() => {
    if (startedFor.current === project.id) return;
    startedFor.current = project.id;
    start();
    // Only ever auto-run once per project instance - re-running is a
    // deliberate user action (the Run button), not something a dependency
    // change should retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (event.key === "Escape" && paletteOpen) {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  const openFile = (path: string) => {
    setOpenPaths((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActivePath(path);
  };
  const closeFile = (path: string) => {
    setOpenPaths((prev) => {
      const next = prev.filter((p) => p !== path);
      if (activePath === path) setActivePath(next.at(-1) ?? null);
      return next;
    });
  };

  const commands: PaletteCommand[] = [
    { id: "run", label: "Run: npm run dev", icon: "play", run: start },
    {
      id: "toggle-terminal",
      label: "View: Toggle Terminal",
      hint: "⌘J",
      icon: "terminal",
      run: () => {
        setTerminalVisible((v) => !v);
        requestAnimationFrame(() => terminalRef.current?.refit());
      },
    },
    ...openPaths.map((path) => ({
      id: `file:${path}`,
      label: `File: ${path.slice(path.lastIndexOf("/") + 1)}`,
      hint: "open",
      icon: "file-plus" as const,
      run: () => openFile(path),
    })),
    { id: "home", label: "Go to: Home", icon: "arrow-left", run: onGoHome },
  ];

  return (
    <div className="flex h-screen min-h-160 flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        projectName={project.name}
        runStatus={runStatus}
        onGoHome={onGoHome}
        onOpenPalette={() => setPaletteOpen(true)}
        onRun={start}
      />

      <div className="flex min-h-0 flex-1 gap-2 p-2.5">
        <ActivityDock activeView={sidebarView} onSelectView={setSidebarView} />

        {sidebarView === "explorer" ? (
          <Explorer dwc={dwc} rootPath={project.path} activeFile={activePath} onOpenFile={openFile} />
        ) : (
          <div className="flex w-50 shrink-0 items-center justify-center rounded-xl bg-card p-4 text-center text-xs text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_14px_rgba(0,0,0,0.06)]">
            Coming soon
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <EditorPane dwc={dwc} openPaths={openPaths} activePath={activePath} onSelect={setActivePath} onClose={closeFile} />
          {/* Kept mounted (just hidden) so the xterm instance and its
              scrollback survive toggling the panel, matching how a real
              terminal keeps its buffer when you switch away and back. */}
          <div className={cn("min-h-0 flex-[0.34]", !terminalVisible && "hidden")}>
            <TerminalPanel
              ref={terminalRef}
              dwc={dwc}
              projectPath={project.path}
              theme={theme}
              busy={runStatus === "installing" || runStatus === "starting"}
              onHide={() => setTerminalVisible(false)}
            />
          </div>
        </div>

        <PreviewPanel previewUrl={previewUrl} port={PREVIEW_PORT} status={runStatus} />
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
    </div>
  );
}
