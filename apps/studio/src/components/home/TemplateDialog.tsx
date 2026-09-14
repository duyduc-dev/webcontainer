import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { createViteVanillaProject, type Project } from "@/duck/project";

interface TemplateOption {
  id: string;
  name: string;
  lang: string;
  badge: string;
  color: string;
  available: boolean;
}

// Only "Vite (Vanilla)" is wired to a real, verified-working recipe in this
// runtime (see PROGRESS.md's Vite/Rolldown WASI investigation) - everything
// else is shown for parity with the design but marked unavailable rather
// than shipping an untested path.
const TEMPLATE_CATALOG: Record<string, TemplateOption[]> = {
  Frontend: [
    { id: "vite-vanilla", name: "Vite (Vanilla)", lang: "JavaScript", badge: "Vi", color: "#71717a", available: true },
    { id: "react", name: "React", lang: "TypeScript", badge: "Rx", color: "#61dafb", available: false },
    { id: "vue", name: "Vue", lang: "TypeScript", badge: "Vu", color: "#42b883", available: false },
    { id: "svelte", name: "Svelte", lang: "TypeScript", badge: "Sv", color: "#ff3e00", available: false },
  ],
  Meta: [
    { id: "next", name: "Next.js", lang: "TypeScript", badge: "Nx", color: "#18181b", available: false },
    { id: "astro", name: "Astro", lang: "TypeScript", badge: "As", color: "#ff5d01", available: false },
  ],
  Backend: [
    { id: "express", name: "Express", lang: "JavaScript", badge: "Ex", color: "#71717a", available: false },
    { id: "fastify", name: "Fastify", lang: "TypeScript", badge: "Fa", color: "#3ba1c7", available: false },
  ],
};

export function TemplateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: Project) => void;
}) {
  const [category, setCategory] = useState("Frontend");
  const [selected, setSelected] = useState<string | null>("vite-vanilla");
  const [name, setName] = useState("my-app");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");

  const create = async () => {
    if (selected !== "vite-vanilla") return;
    setBusy(true);
    setLog("");
    try {
      const project = await createViteVanillaProject(name, (text) => setLog((prev) => prev + text));
      onOpenChange(false);
      onCreated(project);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[82vh] w-[min(720px,92vw)] flex-col">
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>Pick a template — we'll scaffold it and install + run it.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="w-full whitespace-nowrap px-6 pb-3.5 pt-4.5">
          <div className="flex gap-1.5">
            {Object.keys(TEMPLATE_CATALOG).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={cn(
                  "shrink-0 cursor-pointer rounded-lg px-3.5 py-1.5 font-sans text-[13px]",
                  cat === category ? "bg-foreground text-background" : "bg-input text-muted-foreground",
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </ScrollArea>

        <ScrollArea className="flex-1 px-6 pb-2">
          <div className="grid grid-cols-2 gap-2">
            {(TEMPLATE_CATALOG[category] ?? []).map((tpl) => {
              const isSel = selected === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  disabled={!tpl.available}
                  title={tpl.available ? undefined : "Coming soon"}
                  onClick={() => setSelected(tpl.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border-2 p-2.5 text-left font-sans",
                    tpl.available ? "cursor-pointer" : "cursor-not-allowed opacity-45",
                    isSel ? "border-primary bg-selected" : "border-transparent bg-input",
                  )}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                    style={{ background: tpl.color }}
                  >
                    {tpl.badge}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{tpl.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {tpl.available ? tpl.lang : "Coming soon"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {selected === "vite-vanilla" && (
          <div className="px-6 pb-1">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Project name"
              className="h-9 w-full rounded-lg border border-transparent bg-input px-3 text-[13px] outline-none focus-visible:border-ring"
            />
          </div>
        )}

        {busy && (
          <div className="mx-6 mb-1 max-h-24 overflow-y-auto rounded-lg bg-muted p-2 font-mono text-[11px] text-muted-foreground studio-scroll">
            <pre className="whitespace-pre-wrap">{log || "Scaffolding…"}</pre>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={!selected || selected !== "vite-vanilla" || busy} onClick={() => void create()}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
