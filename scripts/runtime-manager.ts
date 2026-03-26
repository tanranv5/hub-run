import { rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { Command } from "commander";
import {
  DEFAULT_HOST,
  DEFAULT_INSTANCE_NAME,
  DEFAULT_PORT,
  DEFAULT_TRUSTED_ORIGINS,
  buildLaunchAgentLabel,
  buildLaunchAgentPlist,
  buildProgramArguments,
  ensureBuildOutput,
  ensureRuntimeDirectories,
  getDefaultRuntimeConfigPath,
  getLaunchAgentPlistPath,
  getLogsDir,
  readRuntimeConfig,
  type LaunchAgentPlistOptions,
  type ProgramArgumentsOptions,
  type RuntimeInstanceConfig,
  type RuntimeManagerConfigFile,
  writeRuntimeConfig,
} from "./runtime-manager-core";
import { waitForHealth } from "./runtime-health";

interface CliOptions {
  config?: string;
  host?: string;
  port?: string;
  password?: string;
  name?: string;
  trustedOrigin?: string[];
}

interface LoadedRuntime {
  config: RuntimeManagerConfigFile;
  configPath: string;
  homeDir: string;
  instance: RuntimeInstanceConfig;
}

const HEALTH_ENDPOINT = "/api/auth/status";
const HEALTH_TIMEOUT_MS = 10_000;
const HEALTH_INTERVAL_MS = 250;
const HEALTH_REQUEST_TIMEOUT_MS = 1_000;

function collectTrustedOrigin(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function getProjectRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

function runCommand(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf-8" });
  if (result.status === 0) {
    return result.stdout.trim();
  }
  const detail = result.stderr.trim() || result.stdout.trim() || "unknown error";
  throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
}

function runCommandAllowFailure(command: string, args: string[]): boolean {
  return spawnSync(command, args, { encoding: "utf-8" }).status === 0;
}

function getServiceTarget(label: string): string {
  return `gui/${process.getuid()}/${label}`;
}

async function waitForRuntimeHealth(host: string, port: number): Promise<void> {
  await waitForHealth({
    endpoint: HEALTH_ENDPOINT,
    host,
    intervalMs: HEALTH_INTERVAL_MS,
    port,
    requestTimeoutMs: HEALTH_REQUEST_TIMEOUT_MS,
    timeoutMs: HEALTH_TIMEOUT_MS,
  });
}

function mergeConfig(
  current: RuntimeManagerConfigFile | null,
  options: CliOptions,
): RuntimeManagerConfigFile {
  const name = options.name ?? DEFAULT_INSTANCE_NAME;
  const existing = current?.instances.find((instance) => instance.name === name);
  const password = resolvePassword(options.password, existing?.password, name);
  const portText = options.port ?? `${existing?.port ?? DEFAULT_PORT}`;
  const instance: RuntimeInstanceConfig = {
    name,
    port: Number.parseInt(portText, 10),
    password,
  };
  const trustedOrigins = options.trustedOrigin?.length
    ? options.trustedOrigin
    : current?.trustedOrigins ?? DEFAULT_TRUSTED_ORIGINS;
  const instances = current?.instances
    ? current.instances.filter((entry) => entry.name !== name).concat(instance)
    : [instance];
  return {
    host: options.host ?? current?.host ?? DEFAULT_HOST,
    nodePath: current?.nodePath ?? process.execPath,
    trustedOrigins,
    instances,
  };
}

function resolvePassword(
  cliPassword: string | undefined,
  existingPassword: string | undefined,
  instanceName: string,
): string {
  const password = cliPassword?.trim() || existingPassword?.trim();
  if (!password) {
    throw new Error(`password is required for runtime instance "${instanceName}"`);
  }
  return password;
}

function resolveInstance(
  config: RuntimeManagerConfigFile,
  name: string,
): RuntimeInstanceConfig {
  const instance = config.instances.find((entry) => entry.name === name);
  if (!instance) {
    throw new Error(`runtime instance "${name}" not found`);
  }
  return instance;
}

async function writeLaunchAgent(
  homeDir: string,
  config: RuntimeManagerConfigFile,
  instance: RuntimeInstanceConfig,
): Promise<string> {
  const projectRoot = getProjectRoot();
  const plistPath = getLaunchAgentPlistPath(homeDir, instance);
  await ensureBuildOutput(projectRoot);
  const plist = buildLaunchAgentPlist({
    plistPath,
    logsDir: getLogsDir(homeDir),
    projectRoot,
    nodePath: config.nodePath,
    host: config.host,
    trustedOrigins: config.trustedOrigins,
    instance,
  });
  await writeFile(plistPath, plist, "utf-8");
  return plistPath;
}

async function loadConfig(options: CliOptions): Promise<LoadedRuntime> {
  const homeDir = process.env.HOME ?? "";
  const configPath = options.config ?? getDefaultRuntimeConfigPath(homeDir);
  const config = await readRuntimeConfig(configPath);
  if (!config) {
    throw new Error(`runtime config not found: ${configPath}`);
  }
  return {
    config,
    configPath,
    homeDir,
    instance: resolveInstance(config, options.name ?? DEFAULT_INSTANCE_NAME),
  };
}

async function installRuntime(options: CliOptions): Promise<void> {
  const homeDir = process.env.HOME ?? "";
  const configPath = options.config ?? getDefaultRuntimeConfigPath(homeDir);
  const current = await readRuntimeConfig(configPath);
  const config = mergeConfig(current, options);
  const instance = resolveInstance(config, options.name ?? DEFAULT_INSTANCE_NAME);
  await ensureRuntimeDirectories(homeDir);
  await writeRuntimeConfig(configPath, config);
  const plistPath = await writeLaunchAgent(homeDir, config, instance);
  runCommandAllowFailure("launchctl", ["bootout", getServiceTarget(buildLaunchAgentLabel(instance))]);
  runCommand("launchctl", ["bootstrap", `gui/${process.getuid()}`, plistPath]);
  await waitForRuntimeHealth(config.host, instance.port);
}

async function startRuntime(options: CliOptions): Promise<void> {
  const loaded = await loadConfig(options);
  const label = buildLaunchAgentLabel(loaded.instance);
  const plistPath = await writeLaunchAgent(loaded.homeDir, loaded.config, loaded.instance);
  if (runCommandAllowFailure("launchctl", ["print", getServiceTarget(label)])) {
    runCommand("launchctl", ["kickstart", "-k", getServiceTarget(label)]);
  } else {
    runCommand("launchctl", ["bootstrap", `gui/${process.getuid()}`, plistPath]);
  }
  await waitForRuntimeHealth(loaded.config.host, loaded.instance.port);
}

async function restartRuntime(options: CliOptions): Promise<void> {
  const loaded = await loadConfig(options);
  const label = buildLaunchAgentLabel(loaded.instance);
  await writeLaunchAgent(loaded.homeDir, loaded.config, loaded.instance);
  if (runCommandAllowFailure("launchctl", ["print", getServiceTarget(label)])) {
    runCommand("launchctl", ["kickstart", "-k", getServiceTarget(label)]);
  } else {
    runCommand("launchctl", [
      "bootstrap",
      `gui/${process.getuid()}`,
      getLaunchAgentPlistPath(loaded.homeDir, loaded.instance),
    ]);
  }
  await waitForRuntimeHealth(loaded.config.host, loaded.instance.port);
}

async function stopRuntime(options: CliOptions): Promise<void> {
  const loaded = await loadConfig(options);
  runCommandAllowFailure("launchctl", ["bootout", getServiceTarget(buildLaunchAgentLabel(loaded.instance))]);
}

async function uninstallRuntime(options: CliOptions): Promise<void> {
  const loaded = await loadConfig(options);
  const plistPath = getLaunchAgentPlistPath(loaded.homeDir, loaded.instance);
  runCommandAllowFailure("launchctl", ["bootout", getServiceTarget(buildLaunchAgentLabel(loaded.instance))]);
  await rm(plistPath, { force: true });
}

async function statusRuntime(options: CliOptions): Promise<void> {
  const loaded = await loadConfig(options);
  const label = buildLaunchAgentLabel(loaded.instance);
  const isLoaded = runCommandAllowFailure("launchctl", ["print", getServiceTarget(label)]);
  let healthy = false;
  try {
    await waitForRuntimeHealth(loaded.config.host, loaded.instance.port);
    healthy = true;
  } catch {
    healthy = false;
  }
  console.log(
    JSON.stringify(
      {
        label,
        configPath: loaded.configPath,
        plistPath: getLaunchAgentPlistPath(loaded.homeDir, loaded.instance),
        loaded: isLoaded,
        healthy,
        host: loaded.config.host,
        port: loaded.instance.port,
      },
      null,
      2,
    ),
  );
}

function addSharedOptions(command: Command): Command {
  return command
    .option("--config <path>", "Runtime config path")
    .option("--name <name>", "Runtime instance name")
    .option("--host <host>", "Listen host")
    .option("--port <number>", "Listen port")
    .option("--password <password>", "Login password")
    .option(
      "--trusted-origin <origin>",
      "Allow extra write origin",
      collectTrustedOrigin,
      [],
    );
}

async function main(): Promise<void> {
  const program = new Command();
  program.name("runtime-manager");
  addSharedOptions(program.command("install")).action((_, command) =>
    installRuntime(command.optsWithGlobals<CliOptions>()),
  );
  addSharedOptions(program.command("start")).action((_, command) =>
    startRuntime(command.optsWithGlobals<CliOptions>()),
  );
  addSharedOptions(program.command("restart")).action((_, command) =>
    restartRuntime(command.optsWithGlobals<CliOptions>()),
  );
  addSharedOptions(program.command("stop")).action((_, command) =>
    stopRuntime(command.optsWithGlobals<CliOptions>()),
  );
  addSharedOptions(program.command("status")).action((_, command) =>
    statusRuntime(command.optsWithGlobals<CliOptions>()),
  );
  addSharedOptions(program.command("uninstall")).action((_, command) =>
    uninstallRuntime(command.optsWithGlobals<CliOptions>()),
  );
  const argv = process.argv.filter((value, index) => index < 2 || value !== "--");
  await program.parseAsync(argv);
}

export { buildLaunchAgentLabel, buildLaunchAgentPlist, buildProgramArguments, getDefaultRuntimeConfigPath, mergeConfig, type LaunchAgentPlistOptions, type ProgramArgumentsOptions, type RuntimeInstanceConfig };
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
