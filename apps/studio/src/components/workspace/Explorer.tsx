import { useEffect, useState, type ReactNode } from "react";
import type { BootWCReturn } from "duckwc";
import { Icon } from "@/Icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { fileMeta, listDirectory, type DirEntryInfo } from "@/duck/vfs";

function Row({
  depth,
  active,
  onClick,
  children,
}: {
  depth: number;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      style={{ paddingLeft: 8 + depth * 12 }}
      className={cn(
        "flex h-7 cursor-pointer items-center gap-1.5 rounded-lg text-[13px]",
        active ? "bg-selected text-selected-foreground" : "text-muted-foreground hover:bg-accent/60",
      )}
    >
      {children}
    </div>
  );
}

function FileRow({ entry, depth, active, onClick }: { entry: DirEntryInfo; depth: number; active: boolean; onClick: () => void }) {
  const { color, badge } = fileMeta(entry.name);
  return (
    <Row depth={depth} active={active} onClick={onClick}>
      <span
        className="ml-[13px] flex h-2.5 w-2 shrink-0 items-end justify-center rounded-sm text-[6px] font-bold leading-none text-white"
        style={{ background: color }}
      >
        {badge}
      </span>
      <span className="truncate">{entry.name}</span>
    </Row>
  );
}

function DirNode({
  dwc,
  entry,
  depth,
  activeFile,
  onOpenFile,
}: {
  dwc: BootWCReturn;
  entry: DirEntryInfo;
  depth: number;
  activeFile: string | null;
  onOpenFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntryInfo[] | null>(null);

  const toggle = async () => {
    if (!expanded && children === null) {
      setChildren(await listDirectory(dwc, entry.path));
    }
    setExpanded((prev) => !prev);
  };

  return (
    <>
      <Row depth={depth} active={false} onClick={() => void toggle()}>
        <Icon name={expanded ? "chev-down" : "chev-right"} size={13} className="shrink-0 opacity-60" />
        <span className="h-3 w-3 shrink-0 rounded-[3px] bg-zinc-300 dark:bg-zinc-600" />
        <span className="truncate">{entry.name}</span>
      </Row>
      {expanded &&
        children?.map((child) =>
          child.isDirectory ? (
            <DirNode key={child.path} dwc={dwc} entry={child} depth={depth + 1} activeFile={activeFile} onOpenFile={onOpenFile} />
          ) : (
            <FileRow key={child.path} entry={child} depth={depth + 1} active={activeFile === child.path} onClick={() => onOpenFile(child.path)} />
          ),
        )}
    </>
  );
}

export function Explorer({
  dwc,
  rootPath,
  activeFile,
  onOpenFile,
}: {
  dwc: BootWCReturn;
  rootPath: string;
  activeFile: string | null;
  onOpenFile: (path: string) => void;
}) {
  const [entries, setEntries] = useState<DirEntryInfo[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void listDirectory(dwc, rootPath).then((result) => {
      if (!cancelled) setEntries(result);
    });
    return () => {
      cancelled = true;
    };
  }, [dwc, rootPath, refreshKey]);

  const newFile = async () => {
    const name = window.prompt("File name")?.trim();
    if (!name) return;
    await dwc.fs.writeFile(`${rootPath}/${name}`, "");
    setRefreshKey((k) => k + 1);
  };
  const newFolder = async () => {
    const name = window.prompt("Folder name")?.trim();
    if (!name) return;
    await dwc.fs.mkdir(`${rootPath}/${name}`, { recursive: true });
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="flex w-50 shrink-0 flex-col overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_14px_rgba(0,0,0,0.06)]">
      <div className="flex h-9.5 shrink-0 items-center gap-0.5 pl-3.5 pr-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="flex-1">Files</span>
        <button type="button" title="New File" onClick={() => void newFile()} className="flex h-5.5 w-5.5 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-muted-foreground">
          <Icon name="file-plus" size={13} />
        </button>
        <button type="button" title="New Folder" onClick={() => void newFolder()} className="flex h-5.5 w-5.5 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-muted-foreground">
          <Icon name="folder-import" size={13} />
        </button>
        <button type="button" title="Refresh" onClick={() => setRefreshKey((k) => k + 1)} className="flex h-5.5 w-5.5 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-muted-foreground">
          <Icon name="rotate" size={13} />
        </button>
      </div>
      <ScrollArea className="studio-scroll flex-1 px-2 pb-2.5">
        <div key={refreshKey}>
          {entries?.map((entry) =>
            entry.isDirectory ? (
              <DirNode key={entry.path} dwc={dwc} entry={entry} depth={0} activeFile={activeFile} onOpenFile={onOpenFile} />
            ) : (
              <FileRow key={entry.path} entry={entry} depth={0} active={activeFile === entry.path} onClick={() => onOpenFile(entry.path)} />
            ),
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
