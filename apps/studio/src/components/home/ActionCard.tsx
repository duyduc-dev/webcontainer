import type { IconName } from "@/Icons";
import { Icon } from "@/Icons";
import { cn } from "@/lib/utils";

export function ActionCard({
  icon,
  title,
  description,
  tint,
  tintForeground,
  disabled,
  onClick,
}: {
  icon: IconName;
  title: string;
  description: string;
  tint: string;
  tintForeground: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? "Coming soon" : undefined}
      className={cn(
        "group flex flex-col items-start gap-3.5 rounded-xl bg-card p-4.5 text-left font-sans shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_16px_rgba(0,0,0,0.05)] transition-transform",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:-translate-y-0.5",
      )}
    >
      <div
        className="flex h-9.5 w-9.5 items-center justify-center rounded-[11px]"
        style={{ background: tint, color: tintForeground }}
      >
        <Icon name={icon} size={19} />
      </div>
      <div>
        <div className="flex items-center gap-1.5 text-[13.5px] font-semibold">
          {title}
          {disabled && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Soon
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}
