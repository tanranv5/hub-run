import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLaunchAgentLabel,
  buildLaunchAgentPlist,
  buildProgramArguments,
  getDefaultRuntimeConfigPath,
  mergeConfig,
  type RuntimeInstanceConfig,
} from "../scripts/runtime-manager";

const DEMO_INSTANCE: RuntimeInstanceConfig = {
  name: "demo",
  port: 12125,
  password: "hubrun-demo",
};

test("getDefaultRuntimeConfigPath uses user config directory", () => {
  assert.equal(
    getDefaultRuntimeConfigPath("/Users/tanran"),
    "/Users/tanran/.config/hub-run/runtime.json",
  );
});

test("buildLaunchAgentLabel creates stable per-instance label", () => {
  assert.equal(buildLaunchAgentLabel(DEMO_INSTANCE), "io.hub-run.demo");
});

test("buildProgramArguments includes host port password and trusted origins", () => {
  assert.deepEqual(
    buildProgramArguments({
      projectRoot: "/Users/tanran/aiCode/cw/hub-run",
      nodePath: "/opt/homebrew/bin/node",
      host: "127.0.0.1",
      trustedOrigins: ["http://127.0.0.1", "http://localhost"],
      instance: DEMO_INSTANCE,
    }),
    [
      "/opt/homebrew/bin/node",
      "/Users/tanran/aiCode/cw/hub-run/dist/index.js",
      "--host",
      "127.0.0.1",
      "--port",
      "12125",
      "--password",
      "hubrun-demo",
      "--trusted-origin",
      "http://127.0.0.1",
      "--trusted-origin",
      "http://localhost",
      "--no-open",
    ],
  );
});

test("buildLaunchAgentPlist enables keepalive and writes logs per instance", () => {
  const plist = buildLaunchAgentPlist({
    plistPath: "/Users/tanran/Library/LaunchAgents/io.hub-run.demo.plist",
    logsDir: "/Users/tanran/Library/Logs/hub-run",
    projectRoot: "/Users/tanran/aiCode/cw/hub-run",
    nodePath: "/opt/homebrew/bin/node",
    host: "127.0.0.1",
    trustedOrigins: ["http://127.0.0.1", "http://localhost"],
    instance: DEMO_INSTANCE,
  });

  assert.match(plist, /<key>Label<\/key>\s*<string>io\.hub-run\.demo<\/string>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/);
  assert.match(plist, /<string>--port<\/string>\s*<string>12125<\/string>/);
  assert.match(plist, /<string>--password<\/string>\s*<string>hubrun-demo<\/string>/);
  assert.match(plist, /hub-run\/demo\.stdout\.log/);
  assert.match(plist, /hub-run\/demo\.stderr\.log/);
});

test("mergeConfig requires an explicit password for a new runtime instance", () => {
  assert.throws(
    () =>
      mergeConfig(null, {
        name: "new-instance",
      }),
    /password is required/i,
  );
});
