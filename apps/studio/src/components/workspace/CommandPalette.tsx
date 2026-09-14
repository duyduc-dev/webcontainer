import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/Icons";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  icon: IconName;
  run: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: PaletteCommand[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) => command.label.toLowerCase().includes(q));
  }, [commands, query]);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] flex justify-center bg-black/45 pt-[14vh] transition-opacity duration-150 data-[state=closed]:opacity-0 data-[state=open]:opacity-100 dark:bg-black/60">
          <DialogPrimitive.Content
            onOpenAutoFocus={(event) => {
              // Let the input own focus instead of the dialog root.
              event.preventDefault();
            }}
            className="flex h-fit max-h-[60vh] w-[min(560px,90vw)] flex-col overflow-hidden rounded-2xl bg-card shadow-2xl outline-none transition-all duration-150 data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100"
          >
            <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
            <div className="flex items-center gap-2.5 border-b border-border-light px-4 py-3.5">
              <Icon name="search" size={15} className="shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={"Type a command or search files…"}
                className="flex-1 border-none bg-transparent text-sm text-foreground outline-none"
              />
              <span className="rounded-[5px] bg-input px-1.5 py-0.5 text-[11px] text-muted-foreground">Esc</span>
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="flex flex-col">
                {filtered.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    onClick={() => {
                      command.run();
                      onOpenChange(false);
                    }}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-foreground hover:bg-accent"
                  >
                    <Icon name={command.icon} size={15} className="shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-[13px]">{command.label}</span>
                    {command.hint && <span className="text-[11px] text-muted-foreground">{command.hint}</span>}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="px-2.5 py-4 text-center text-[13px] text-muted-foreground">No matches</div>
                )}
              </div>
            </ScrollArea>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
