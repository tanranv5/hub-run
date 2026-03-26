import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  DOUBAO_APP_CONFIG,
  DOUBAO_DEVICE_CONFIG,
  DOUBAO_REGISTER_URL,
  DOUBAO_SETTINGS_URL,
} from "./constants";
import { fetchWithTimeout } from "./timeout";

interface DeviceRegisterResponse {
  readonly device_id?: number;
}

interface SettingsResponse {
  readonly data?: {
    readonly settings?: {
      readonly asr_config?: {
        readonly app_key?: string;
      };
    };
  };
}

export interface DoubaoDeviceRegistration {
  readonly deviceId: string;
  readonly cdid: string;
  readonly openudid: string;
  readonly clientudid: string;
}

function buildRegisterParams(cdid: string): URLSearchParams {
  return new URLSearchParams({
    device_platform: DOUBAO_DEVICE_CONFIG.device_platform,
    os: DOUBAO_DEVICE_CONFIG.os,
    ssmix: "a",
    _rticket: String(Date.now()),
    cdid,
    channel: DOUBAO_APP_CONFIG.channel,
    aid: String(DOUBAO_APP_CONFIG.aid),
    app_name: DOUBAO_APP_CONFIG.app_name,
    version_code: String(DOUBAO_APP_CONFIG.version_code),
    version_name: DOUBAO_APP_CONFIG.version_name,
    manifest_version_code: String(DOUBAO_APP_CONFIG.manifest_version_code),
    update_version_code: String(DOUBAO_APP_CONFIG.update_version_code),
    resolution: DOUBAO_DEVICE_CONFIG.resolution,
    dpi: DOUBAO_DEVICE_CONFIG.dpi,
    device_type: DOUBAO_DEVICE_CONFIG.device_type,
    device_brand: DOUBAO_DEVICE_CONFIG.device_brand,
    language: DOUBAO_DEVICE_CONFIG.language,
    os_api: DOUBAO_DEVICE_CONFIG.os_api,
    os_version: DOUBAO_DEVICE_CONFIG.os_version,
    ac: "wifi",
  });
}

function buildRegisterBody(
  cdid: string,
  openudid: string,
  clientudid: string,
) {
  return {
    magic_tag: "ss_app_log",
    header: {
      device_id: 0,
      install_id: 0,
      ...DOUBAO_APP_CONFIG,
      ...DOUBAO_DEVICE_CONFIG,
      openudid,
      clientudid,
      cdid,
      region: "CN",
      tz_name: "Asia/Shanghai",
      tz_offset: 28_800,
      sim_region: "cn",
      carrier_region: "cn",
      cpu_abi: "arm64-v8a",
      build_serial: "unknown",
      not_request_sender: 0,
      sig_hash: "",
      google_aid: "",
      mc: "",
      serial_number: "",
    },
    _gen_time: Date.now(),
  };
}

function buildSettingsParams(deviceId: string, cdid: string): URLSearchParams {
  return new URLSearchParams({
    device_platform: "android",
    os: "android",
    ssmix: "a",
    _rticket: String(Date.now()),
    cdid,
    channel: DOUBAO_APP_CONFIG.channel,
    aid: String(DOUBAO_APP_CONFIG.aid),
    app_name: DOUBAO_APP_CONFIG.app_name,
    version_code: String(DOUBAO_APP_CONFIG.version_code),
    version_name: DOUBAO_APP_CONFIG.version_name,
    device_id: deviceId,
  });
}

export async function registerDoubaoDevice(
  userAgent: string,
  requestTimeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<DoubaoDeviceRegistration> {
  const cdid = randomUUID();
  const openudid = randomBytes(8).toString("hex");
  const clientudid = randomUUID();
  const response = await fetchWithTimeout(
    `${DOUBAO_REGISTER_URL}?${buildRegisterParams(cdid).toString()}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": userAgent,
      },
      body: JSON.stringify(buildRegisterBody(cdid, openudid, clientudid)),
    },
    requestTimeoutMs,
    fetchImpl,
    "Doubao device register",
  );

  if (!response.ok) {
    throw new Error(`Doubao device register failed: ${response.status}`);
  }

  const payload = (await response.json()) as DeviceRegisterResponse;
  if (!payload.device_id) {
    throw new Error("Doubao device register response missing device_id");
  }

  return {
    deviceId: String(payload.device_id),
    cdid,
    openudid,
    clientudid,
  };
}

export async function fetchDoubaoAsrToken(
  deviceId: string,
  cdid: string,
  userAgent: string,
  requestTimeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<string> {
  const body = "body=null";
  const stub = createHash("md5").update(body).digest("hex").toUpperCase();
  const response = await fetchWithTimeout(
    `${DOUBAO_SETTINGS_URL}?${buildSettingsParams(deviceId, cdid).toString()}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "user-agent": userAgent,
        "x-ss-stub": stub,
      },
      body,
    },
    requestTimeoutMs,
    fetchImpl,
    "Doubao ASR token request",
  );

  if (!response.ok) {
    throw new Error(`Doubao ASR token request failed: ${response.status}`);
  }

  const payload = (await response.json()) as SettingsResponse;
  const token = payload.data?.settings?.asr_config?.app_key?.trim();
  if (!token) {
    throw new Error("Doubao ASR token response missing app_key");
  }
  return token;
}
