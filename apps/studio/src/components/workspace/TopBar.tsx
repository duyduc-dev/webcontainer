import { Icon } from "@/Icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { RunStatus } from "@/duck/project";

export function TopBar({
  projectName,
  runStatus,
  onGoHome,
  onOpenPalette,
  onRun,
}: {
  projectName: string;
  runStatus: RunStatus;
  onGoHome: () => void;
  onOpenPalette: () => void;
  onRun: () => void;
}) {
  const runLabel = runStatus === "installing" ? "Installing…" : runStatus === "starting" ? "Starting…" : "Run";

  return (
    <div className="m-2.5 mb-0 flex flex-shrink-0 items-center gap-2.5 rounded-xl bg-card py-2 pl-4 pr-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_14px_rgba(0,0,0,0.06)]">
      <button
        type="button"
        onClick={onGoHome}
        className="flex shrink-0 cursor-pointer items-center gap-2 border-none bg-transparent font-sans text-sm font-semibold text-foreground"
      >
        <span className="flex h-5.5 w-5.5 items-center justify-center rounded-[7px] bg-primary text-[11px] font-bold text-white">
          D
        </span>
        Duck Studio
      </button>
      <Separator orientation="vertical" className="h-4.5" />
      <span className="rounded-lg px-2 py-1.5 font-sans text-[13px] text-muted-foreground">{projectName}</span>
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex cursor-pointer items-center gap-2 rounded-lg bg-input px-2.5 py-1.5 font-sans text-[13px] text-muted-foreground"
      >
        <Icon name="search" size={13} />
        {"Go to file, command…"}
        <span className="ml-0.5 rounded-[5px] bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
          {"⌘K"}
        </span>
      </button>
      <span className="flex-1" />
      <Button size="sm" onClick={onRun} disabled={runStatus === "installing" || runStatus === "starting"}>
        <Icon name="play" size={13} />
        {runLabel}
      </Button>
      <Button size="sm" variant="secondary" disabled title="Coming soon">
        <Icon name="share" size={13} />
        Share
      </Button>
      <span
        className="h-7 w-7 shrink-0 rounded-full"
        style={{ background: "linear-gradient(135deg,#6366f1,#a78bfa)" }}
      />
    </div>
  );
}
