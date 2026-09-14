import { useState } from "react";
import { Icon } from "@/Icons";
import { ActionCard } from "@/components/home/ActionCard";
import { BlankProjectDialog } from "@/components/home/BlankProjectDialog";
import { TemplateDialog } from "@/components/home/TemplateDialog";
import { RecentProjectsList } from "@/components/home/RecentProjectsList";
import { loadRecentProjects, reopenProject, type Project } from "@/duck/project";

export function HomePage({ onOpenProject }: { onOpenProject: (project: Project) => void }) {
  const [blankOpen, setBlankOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [recents, setRecents] = useState<Project[]>(() => loadRecentProjects());
  const [reopening, setReopening] = useState<string | null>(null);

  const openRecent = async (project: Project) => {
    setReopening(project.id);
    try {
      const resolved = await reopenProject(project, () => {});
      onOpenProject(resolved);
    } finally {
      setReopening(null);
    }
  };

  return (
    <div className="mx-auto min-h-full max-w-205 px-6 py-16 font-sans">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">
          D
        </span>
        <h1 className="m-0 text-xl font-semibold">Duck Studio</h1>
      </div>
      <p className="m-0 mb-8 text-sm text-muted-foreground">Boot a real dev server, right in your browser tab.</p>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <ActionCard
          icon="file-plus"
          title="Start from blank"
          description="Empty project."
          tint="#eef0ff"
          tintForeground="#6366f1"
          onClick={() => setBlankOpen(true)}
        />
        <ActionCard
          icon="template"
          title="From template"
          description="Vite, and more soon."
          tint="#ecfdf5"
          tintForeground="#10b981"
          onClick={() => setTemplateOpen(true)}
        />
        <ActionCard
          icon="folder-import"
          title="Import a folder"
          description="Open local files."
          tint="#fff7ed"
          tintForeground="#f97316"
          disabled
          onClick={() => {}}
        />
        <ActionCard
          icon="github"
          title="Import from GitHub"
          description="Clone a repo."
          tint="#fdf2f8"
          tintForeground="#ec4899"
          disabled
          onClick={() => {}}
        />
      </div>

      <RecentProjectsList
        projects={recents}
        onOpen={(project) => {
          if (reopening) return;
          void openRecent(project);
        }}
      />

      {reopening && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Icon name="rotate" size={13} className="animate-spin" />
          {"Reopening project…"}
        </div>
      )}

      <BlankProjectDialog
        open={blankOpen}
        onOpenChange={setBlankOpen}
        onCreated={(project) => {
          setRecents(loadRecentProjects());
          onOpenProject(project);
        }}
      />
      <TemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        onCreated={(project) => {
          setRecents(loadRecentProjects());
          onOpenProject(project);
        }}
      />
    </div>
  );
}
