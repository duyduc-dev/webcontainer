import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBlankProject, type Project } from "@/duck/project";

export function BlankProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("my-app");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const project = await createBlankProject(name);
      onOpenChange(false);
      onCreated(project);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(420px,90vw)]">
        <DialogHeader>
          <DialogTitle>New blank project</DialogTitle>
          <DialogDescription>An empty project you can build up from scratch.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5 px-6 py-5">
          <Label htmlFor="blank-project-name">Project name</Label>
          <Input
            id="blank-project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !busy) void create();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void create()}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
