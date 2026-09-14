import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, style, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-3.5 w-3.5 shrink-0 items-end justify-center rounded-[3px] text-[6px] font-bold leading-none text-white",
        className,
      )}
      style={style}
      {...props}
    />
  );
}
