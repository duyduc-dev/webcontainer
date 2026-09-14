import type { IconName } from "@/Icons";
import { Icon } from "@/Icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTheme } from "@/use-theme";

export type SidebarView = "explorer" | "search" | "scm" | "debug";

const ITEMS: { view: SidebarView; label: string; icon: IconName }[] = [
  { view: "explorer", label: "Files", icon: "files" },
  { view: "search", label: "Search", icon: "search" },
  { view: "scm", label: "Source Control", icon: "git" },
  { view: "debug", label: "Run and Debug", icon: "bug" },
];

function DockButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border-none",
            active ? "bg-selected text-primary" : "bg-transparent text-muted-foreground",
          )}
        >
          <Icon name={icon} size={18} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ActivityDock({
  activeView,
  onSelectView,
}: {
  activeView: SidebarView;
  onSelectView: (view: SidebarView) => void;
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-xl bg-card py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_14px_rgba(0,0,0,0.06)]">
      {ITEMS.map((item) => (
        <DockButton
          key={item.view}
          icon={item.icon}
          label={item.label}
          active={activeView === item.view}
          onClick={() => onSelectView(item.view)}
        />
      ))}
      <span className="flex-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Toggle theme"
            onClick={toggleTheme}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] border-none bg-transparent text-muted-foreground"
          >
            <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Toggle theme</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Settings"
            disabled
            className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-[10px] border-none bg-transparent text-muted-foreground opacity-50"
          >
            <Icon name="gear" size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Settings (coming soon)</TooltipContent>
      </Tooltip>
    </div>
  );
}
