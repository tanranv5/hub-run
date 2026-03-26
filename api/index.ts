import { program } from "commander";
import { buildRuntimeConfig } from "./config";
import { createServer } from "./server";

function collectTrustedOrigin(value: string, previous: string[]): string[] {
  return [...previous, value];
}

program
  .name("hub-run")
  .description("Shared web shell for Codex and Claude")
  .option("-p, --port <number>", "Port to listen on", "12001")
  .option("-H, --host <host>", "Host to listen on", "127.0.0.1")
  .option("--password <password>", "Password for web login")
  .option(
    "--trusted-origin <origin>",
    "Allow an extra write origin, can be repeated",
    collectTrustedOrigin,
    [],
  )
  .option("--dev", "Enable development mode")
  .option("--no-open", "Do not open browser automatically")
  .parse();

const options = program.opts<{
  port: string;
  host: string;
  password?: string;
  trustedOrigin: string[];
  dev?: boolean;
  open?: boolean;
}>();

const config = buildRuntimeConfig({
  host: options.host,
  port: Number.parseInt(options.port, 10),
  password: options.password,
  trustedOrigins: options.trustedOrigin,
  dev: options.dev,
  open: options.open,
});

const server = createServer(config);

const SHUTDOWN_DRAIN_MS = 500;

async function shutdown() {
  await server.stop();
  setTimeout(() => process.exit(0), SHUTDOWN_DRAIN_MS).unref?.();
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

server.start().catch((error) => {
  console.error(error);
  process.exit(1);
});
