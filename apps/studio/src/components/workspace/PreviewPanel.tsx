import { useState } from "react";
import { Icon } from "@/Icons";
import type { RunStatus } from "@/duck/project";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<RunStatus, string> = {
  idle: "Not running",
  installing: "Installing dependencies…",
  starting: "Starting dev server…",
  ready: "Ready",
  error: "Failed to start",
  "no-script": "No dev script configured",
};

export function PreviewPanel({
  previewUrl,
  port,
  status,
}: {
  previewUrl: string | null;
  port: number;
  status: RunStatus;
}) {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="flex w-[34%] shrink-0 flex-col overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_14px_rgba(0,0,0,0.06)]">
      <div className="flex h-10.5 shrink-0 items-center gap-2 border-b border-border-light px-2.5">
        <button type="button" disabled className="flex h-6.5 w-6.5 cursor-not-allowed items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground opacity-50">
          <Icon name="arrow-left" size={14} />
        </button>
        <button type="button" disabled className="flex h-6.5 w-6.5 cursor-not-allowed items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground opacity-50">
          <Icon name="arrow-right" size={14} />
        </button>
        <button
          type="button"
          disabled={!previewUrl}
          onClick={() => setReloadKey((k) => k + 1)}
          className={cn(
            "flex h-6.5 w-6.5 items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground",
            previewUrl ? "cursor-pointer" : "cursor-not-allowed opacity-50",
          )}
        >
          <Icon name="rotate" size={14} />
        </button>
        <div className="flex flex-1 items-center gap-1.5 rounded-lg bg-input px-2.5 py-1.5">
          <Icon name="lock" size={10} className="shrink-0 text-muted-foreground" />
          <span className="truncate text-xs text-muted-foreground">{`localhost:${port}`}</span>
        </div>
        <a
          href={previewUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "flex h-6.5 w-6.5 items-center justify-center rounded-lg text-muted-foreground",
            previewUrl ? "cursor-pointer" : "pointer-events-none opacity-50",
          )}
        >
          <Icon name="ext-link" size={14} />
        </a>
      </div>
      <div className="relative flex-1 bg-white">
        {previewUrl ? (
          <iframe key={reloadKey} src={previewUrl} title="Preview" className="absolute inset-0 h-full w-full border-none" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white"
              style={{ background: "linear-gradient(135deg,#6366f1,#a78bfa)" }}
            >
              D
            </div>
            <div className="text-sm">{STATUS_LABEL[status]}</div>
          </div>
        )}
      </div>
    </div>
  );
}
