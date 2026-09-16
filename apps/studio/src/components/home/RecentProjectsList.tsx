import { Icon } from "@/Icons";
import type { Project } from "@/duck/project";

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const KIND_LABEL: Record<Project["kind"], string> = {
  blank: "blank",
  "vite-vanilla": "vite",
  "vite-react-ts": "react + vite",
  "vite-vue-ts": "vue + vite",
  "vite-angular-ts": "angular + vite",
};

export function RecentProjectsList({
  projects,
  onOpen,
}: {
  projects: Project[];
  onOpen: (project: Project) => void;
}) {
  if (projects.length === 0) return null;

  return (
    <div className="mt-9">
      <div className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon name="clock" size={13} />
        Recent
      </div>
      <div className="flex flex-col gap-2">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onOpen(project)}
            className="flex cursor-pointer items-center gap-3 rounded-lg bg-card px-4 py-3 text-left font-sans shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_14px_rgba(0,0,0,0.06)]"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium">{project.name}</div>
              <div className="text-[11px] text-muted-foreground">{project.path}</div>
            </div>
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
              {`${KIND_LABEL[project.kind]} · ${relativeTime(project.createdAt)}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
