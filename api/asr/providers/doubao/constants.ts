import { homedir } from "node:os";
import { join } from "node:path";

export const DOUBAO_REGISTER_URL =
  "https://log.snssdk.com/service/2/device_register/";
export const DOUBAO_SETTINGS_URL =
  "https://is.snssdk.com/service/settings/v3/";
export const DOUBAO_WEBSOCKET_URL =
  "wss://frontier-audio-ime-ws.doubao.com/ocean/api/v1/ws";
export const DOUBAO_AID = "401734";
export const DOUBAO_USER_AGENT =
  "com.bytedance.android.doubaoime/100102018 (Linux; U; Android 16; en_US; Pixel 7 Pro; Build/BP2A.250605.031.A2; Cronet/TTNetVersion:94cf429a 2025-11-17 QuicVersion:1f89f732 2025-05-08)";
export const DOUBAO_APP_NAME = "com.android.chrome";
export const DOUBAO_REQUEST_TIMEOUT_MS = 10_000;
export const DOUBAO_CREDENTIAL_PATH = join(
  homedir(),
  ".config",
  "hub-run",
  "asr",
  "doubao-credentials.json",
);

export const DOUBAO_APP_CONFIG = {
  aid: Number.parseInt(DOUBAO_AID, 10),
  app_name: "oime",
  version_code: 100102018,
  version_name: "1.1.2",
  manifest_version_code: 100102018,
  update_version_code: 100102018,
  channel: "official",
  package: "com.bytedance.android.doubaoime",
} as const;

export const DOUBAO_DEVICE_CONFIG = {
  device_platform: "android",
  os: "android",
  os_api: "34",
  os_version: "16",
  device_type: "Pixel 7 Pro",
  device_brand: "google",
  device_model: "Pixel 7 Pro",
  resolution: "1080*2400",
  dpi: "420",
  language: "zh",
  timezone: 8,
  access: "wifi",
  rom: "UP1A.231005.007",
  rom_version: "UP1A.231005.007",
} as const;
