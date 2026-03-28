import { ChevronDown } from "lucide-react";
import { useState, type FocusEvent } from "react";

interface ProjectPathFieldProps {
  disabled?: boolean;
  projects: string[];
  selectedProject: string | null;
  value: string;
  onChange: (value: string) => void;
  onSelectProject: (value: string | null) => void;
}

function getProjectName(projectPath: string): string {
  const parts = projectPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || projectPath;
}

export default function ProjectPathField(props: ProjectPathFieldProps) {
  const {
    disabled = false,
    projects,
    selectedProject,
    value,
    onChange,
    onSelectProject,
  } = props;
  const [open, setOpen] = useState(false);

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setOpen(false);
  }

  return (
    <div className="relative flex-1" onBlur={handleBlur}>
      <div className="flex h-9 items-center rounded-lg border border-bdr bg-surface">
        <input
          disabled={disabled}
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            onSelectProject(null);
            setOpen(true);
          }}
          placeholder="输入项目路径"
          className="h-full w-full bg-transparent px-3 text-sm text-txt outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          disabled={disabled}
          aria-label="展开项目列表"
          onClick={() => setOpen((current) => !current)}
          className="flex h-full w-9 shrink-0 items-center justify-center text-muted transition hover:text-txt disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 max-h-80 overflow-y-auto rounded-xl border border-bdr bg-panel-2 shadow-[0_16px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          <button
            type="button"
            onClick={() => {
              onChange("");
              onSelectProject(null);
              setOpen(false);
            }}
            className="flex w-full items-center border-b border-bdr px-3 py-2 text-left text-sm text-txt hover:bg-surface"
          >
            全部项目
          </button>
          {projects.map((project) => (
            <button
              key={project}
              type="button"
              onClick={() => {
                onChange(project);
                onSelectProject(project);
                setOpen(false);
              }}
              className={`flex w-full flex-col items-start gap-0.5 border-b border-bdr px-3 py-2 text-left last:border-b-0 hover:bg-surface ${
                selectedProject === project ? "bg-surface-hover" : ""
              }`}
            >
              <span className="text-sm text-txt">{getProjectName(project)}</span>
              <span className="line-clamp-1 text-[11px] text-muted">{project}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
