import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface RuntimeInstanceConfig {
  name: string;
  port: number;
  password: string;
}

export interface RuntimeManagerConfigFile {
  host: string;
  trustedOrigins: string[];
  nodePath: string;
  instances: RuntimeInstanceConfig[];
}

export interface ProgramArgumentsOptions {
  projectRoot: string;
  nodePath: string;
  host: string;
  trustedOrigins: string[];
  instance: RuntimeInstanceConfig;
}

export interface LaunchAgentPlistOptions extends ProgramArgumentsOptions {
  plistPath: string;
  logsDir: string;
  homeDir?: string;
  pathEnv?: string;
}

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 12125;
export const DEFAULT_INSTANCE_NAME = "default";
export const DEFAULT_TRUSTED_ORIGINS = [
  "http://127.0.0.1",
  "http://localhost",
];

export function getDefaultRuntimeConfigPath(homeDir: string): string {
  return join(homeDir, ".config/hub-run/runtime.json");
}

export function buildLaunchAgentLabel(instance: RuntimeInstanceConfig): string {
  const safeName = instance.name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `io.hub-run.${safeName}`;
}

export function getLaunchAgentPlistPath(
  homeDir: string,
  instance: RuntimeInstanceConfig,
): string {
  return join(homeDir, "Library/LaunchAgents", `${buildLaunchAgentLabel(instance)}.plist`);
}

export function getLogsDir(homeDir: string): string {
  return join(homeDir, "Library/Logs/hub-run");
}

export function buildProgramArguments(
  options: ProgramArgumentsOptions,
): string[] {
  const args = [
    options.nodePath,
    join(options.projectRoot, "dist/index.js"),
    "--host",
    options.host,
    "--port",
    String(options.instance.port),
    "--password",
    options.instance.password,
  ];
  for (const origin of options.trustedOrigins) {
    args.push("--trusted-origin", origin);
  }
  args.push("--no-open");
  return args;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function renderStringArray(values: string[]): string {
  return values.map((value) => `    <string>${escapeXml(value)}</string>`).join("\n");
}

export function buildLaunchAgentPlist(
  options: LaunchAgentPlistOptions,
): string {
  const label = buildLaunchAgentLabel(options.instance);
  const stdoutPath = join(options.logsDir, `${options.instance.name}.stdout.log`);
  const stderrPath = join(options.logsDir, `${options.instance.name}.stderr.log`);
  const programArguments = renderStringArray(buildProgramArguments(options));
  const pathEnv = escapeXml(options.pathEnv ?? process.env.PATH ?? "");
  const homeDir = escapeXml(options.homeDir ?? process.env.HOME ?? "");

  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
    "<plist version=\"1.0\">",
    "<dict>",
    "  <key>Label</key>",
    `  <string>${escapeXml(label)}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    programArguments,
    "  </array>",
    "  <key>WorkingDirectory</key>",
    `  <string>${escapeXml(options.projectRoot)}</string>`,
    "  <key>EnvironmentVariables</key>",
    "  <dict>",
    "    <key>PATH</key>",
    `    <string>${pathEnv}</string>`,
    "    <key>HOME</key>",
    `    <string>${homeDir}</string>`,
    "  </dict>",
    "  <key>StandardOutPath</key>",
    `  <string>${escapeXml(stdoutPath)}</string>`,
    "  <key>StandardErrorPath</key>",
    `  <string>${escapeXml(stderrPath)}</string>`,
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <true/>",
    "  <key>ThrottleInterval</key>",
    "  <integer>3</integer>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

export async function readRuntimeConfig(
  configPath: string,
): Promise<RuntimeManagerConfigFile | null> {
  try {
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content) as RuntimeManagerConfigFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeRuntimeConfig(
  configPath: string,
  config: RuntimeManagerConfigFile,
): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export async function ensureRuntimeDirectories(
  homeDir: string,
): Promise<void> {
  await mkdir(join(homeDir, ".config/hub-run"), { recursive: true });
  await mkdir(join(homeDir, "Library/LaunchAgents"), { recursive: true });
  await mkdir(getLogsDir(homeDir), { recursive: true });
}

export async function ensureBuildOutput(projectRoot: string): Promise<void> {
  await access(join(projectRoot, "dist/index.js"));
}
