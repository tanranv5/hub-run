import { spawn, spawnSync } from "node:child_process";

export interface RuntimeController {
  restart: () => void | Promise<void>;
}

export class RuntimeControllerError extends Error {
  constructor(
    message: string,
    readonly statusCode = 500,
  ) {
    super(message);
    this.name = "RuntimeControllerError";
  }
}

const DEFAULT_RUNTIME_LABEL = "io.hub-run.default";
const DEFAULT_RESTART_DELAY_MS = 250;

export function createRuntimeController(props: {
  env?: NodeJS.ProcessEnv;
  restartDelayMs?: number;
  spawnProcess?: typeof spawn;
  verifyServiceTarget?: (serviceTarget: string) => void;
} = {}): RuntimeController {
  const {
    env = process.env,
    restartDelayMs = DEFAULT_RESTART_DELAY_MS,
    spawnProcess = spawn,
    verifyServiceTarget = createDefaultServiceVerifier(env),
  } = props;
  const serviceTarget = buildServiceTarget(env);

  return {
    restart: () => {
      verifyServiceTarget(serviceTarget);
      const child = spawnProcess(
        process.execPath,
        ["-e", buildRestartScript(serviceTarget, restartDelayMs)],
        {
          detached: true,
          stdio: "ignore",
        },
      );
      child.unref();
    },
  };
}

function buildServiceTarget(env: NodeJS.ProcessEnv): string {
  const label = env["XPC_SERVICE_NAME"]?.trim() || DEFAULT_RUNTIME_LABEL;
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  return `gui/${uid}/${label}`;
}

function createDefaultServiceVerifier(
  env: NodeJS.ProcessEnv,
): (serviceTarget: string) => void {
  // In dev mode (no XPC_SERVICE_NAME), skip verification since launchctl
  // won't find the service when running directly via `bun run dev`.
  if (!env["XPC_SERVICE_NAME"]?.trim()) {
    return () => {};
  }
  return createLaunchctlServiceVerifier();
}

function createLaunchctlServiceVerifier(): (serviceTarget: string) => void {
  return (serviceTarget) => {
    const result = spawnSync("launchctl", ["print", serviceTarget], {
      encoding: "utf-8",
    });
    if (result.error) {
      throw new RuntimeControllerError(
        `Failed to verify runtime service ${serviceTarget}: ${result.error.message}`,
      );
    }
    if (result.status === 0) {
      return;
    }
    const detail = String(result.stderr ?? "").trim() || String(result.stdout ?? "").trim();
    throw new RuntimeControllerError(
      detail
        ? `Runtime service not found or not restartable: ${serviceTarget}: ${detail}`
        : `Runtime service not found or not restartable: ${serviceTarget}`,
      404,
    );
  };
}

function buildRestartScript(serviceTarget: string, restartDelayMs: number): string {
  return `
    const { spawnSync } = require("node:child_process");
    const timer = setTimeout(() => {
      spawnSync("launchctl", ["kickstart", "-k", ${JSON.stringify(serviceTarget)}], {
        stdio: "ignore",
      });
      process.exit(0);
    }, ${restartDelayMs});
    timer.unref?.();
  `;
}
