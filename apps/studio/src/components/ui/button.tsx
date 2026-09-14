import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "default" | "secondary" | "ghost" | "outline";
export type ButtonSize = "default" | "sm" | "icon";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
  ghost: "bg-transparent text-foreground hover:bg-accent",
  outline: "border border-border bg-transparent text-foreground hover:bg-accent",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: "h-9 px-4 text-sm gap-2",
  sm: "h-8 px-3 text-[13px] gap-1.5",
  icon: "h-9 w-9",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium font-sans transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  );
}
