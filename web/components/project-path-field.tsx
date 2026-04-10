import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { checkPathExists } from "../api";
import { resolveProjectPathSelection } from "../session-browser-state";

interface ProjectPathFieldProps {
  disabled?: boolean;
  projects: string[];
  value: string;
  onChange: (value: string) => void;
  onCommitSelection: (value: string, selectedProject: string | null) => void;
}

export type PathValidationStatus =
  | "idle"
  | "checking"
  | "valid"
  | "not-found"
  | "not-directory";

function getProjectName(projectPath: string): string {
  const parts = projectPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || projectPath;
}

export default function ProjectPathField(props: ProjectPathFieldProps) {
  const {
    disabled = false,
    projects,
    value,
    onChange,
    onCommitSelection,
  } = props;
  const [open, setOpen] = useState(false);
  const [pathStatus, setPathStatus] = useState<PathValidationStatus>("idle");
  const validationRef = useRef(0);
  const { matchedProject, shouldValidatePath } = resolveProjectPathSelection(
    projects,
    value,
  );

  useEffect(() => {
    validationRef.current += 1;
    setPathStatus("idle");
  }, [value]);

  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    if (matchedProject) {
      validationRef.current += 1;
      setPathStatus("idle");
    }
  }, [matchedProject, value]);

  async function validatePath() {
    const trimmed = value.trim();
    if (!trimmed || !shouldValidatePath) {
      setPathStatus("idle");
      return;
    }
    validationRef.current += 1;
    const version = validationRef.current;
    setPathStatus("checking");
    try {
      const result = await checkPathExists(trimmed);
      if (version !== validationRef.current) return;
      if (!result.exists) {
        setPathStatus("not-found");
      } else if (!result.isDirectory) {
        setPathStatus("not-directory");
      } else {
        setPathStatus("valid");
      }
    } catch {
      if (version === validationRef.current) {
        setPathStatus("idle");
      }
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setOpen(false);
    onCommitSelection(value, matchedProject);
    void validatePath();
  }

  return (
    <div className="relative flex-1" onBlur={handleBlur}>
      <div className="flex h-9 items-center rounded-lg border border-bdr bg-surface pr-0.5">
        <input
          disabled={disabled}
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
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
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:text-txt disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      <PathValidationHint status={pathStatus} path={value.trim()} />
      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 max-h-80 overflow-y-auto rounded-xl border border-bdr bg-panel-2 shadow-[0_16px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          <button
            type="button"
            onClick={() => {
              const nextValue = "";
              onChange(nextValue);
              onCommitSelection(nextValue, null);
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
                const nextValue = project;
                onChange(nextValue);
                onCommitSelection(nextValue, project);
                setOpen(false);
              }}
              className={`flex w-full flex-col items-start gap-0.5 border-b border-bdr px-3 py-2 text-left last:border-b-0 hover:bg-surface ${
                matchedProject === project ? "bg-surface-hover" : ""
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

function PathValidationHint(props: {
  status: PathValidationStatus;
  path: string;
}) {
  const { status, path } = props;
  if (status === "idle" || status === "valid" || !path) {
    return null;
  }
  if (status === "checking") {
    return (
      <p className="mt-1 text-[11px] text-muted">
        正在检查路径...
      </p>
    );
  }
  if (status === "not-directory") {
    return (
      <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
        该路径存在但不是目录，请输入目录路径
      </p>
    );
  }
  return (
    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
      路径不存在，创建会话时将自动新建该目录
    </p>
  );
}
