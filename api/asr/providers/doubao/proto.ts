import protobuf from "protobufjs";

const PROTO_SOURCE = `
syntax = "proto3";

package asr;

message AsrRequest {
  string token = 2;
  string service_name = 3;
  string method_name = 5;
  string payload = 6;
  bytes audio_data = 7;
  string request_id = 8;
  FrameState frame_state = 9;
}

message AsrResponse {
  string request_id = 1;
  string task_id = 2;
  string service_name = 3;
  string message_type = 4;
  int32 status_code = 5;
  string status_message = 6;
  string result_json = 7;
  int32 unknown_field_9 = 9;
}

enum FrameState {
  FRAME_STATE_UNSPECIFIED = 0;
  FRAME_STATE_FIRST = 1;
  FRAME_STATE_MIDDLE = 3;
  FRAME_STATE_LAST = 9;
}
`;

const root = protobuf.parse(PROTO_SOURCE).root;
const asrRequestType = root.lookupType("asr.AsrRequest");
const asrResponseType = root.lookupType("asr.AsrResponse");

export const FRAME_STATE = {
  FIRST: 1,
  MIDDLE: 3,
  LAST: 9,
} as const;

export interface DoubaoDecodedResponse {
  readonly requestId: string;
  readonly taskId: string;
  readonly serviceName: string;
  readonly messageType: string;
  readonly statusCode: number;
  readonly statusMessage: string;
  readonly resultJson: string;
}

function encodeRequest(fields: Record<string, unknown>): Uint8Array {
  const message = asrRequestType.create(fields);
  return asrRequestType.encode(message).finish();
}

export function buildStartTaskMessage(
  requestId: string,
  token: string,
): Uint8Array {
  return encodeRequest({
    token,
    serviceName: "ASR",
    methodName: "StartTask",
    requestId,
  });
}

export function buildStartSessionMessage(
  requestId: string,
  token: string,
  payload: string,
): Uint8Array {
  return encodeRequest({
    token,
    serviceName: "ASR",
    methodName: "StartSession",
    requestId,
    payload,
  });
}

export function buildTaskRequestMessage(
  requestId: string,
  audioData: Uint8Array,
  frameState: number,
  timestampMs: number,
): Uint8Array {
  return encodeRequest({
    serviceName: "ASR",
    methodName: "TaskRequest",
    requestId,
    payload: JSON.stringify({
      extra: {},
      timestamp_ms: timestampMs,
    }),
    audioData,
    frameState,
  });
}

export function buildFinishSessionMessage(
  requestId: string,
  token: string,
): Uint8Array {
  return encodeRequest({
    token,
    serviceName: "ASR",
    methodName: "FinishSession",
    requestId,
  });
}

export function decodeDoubaoResponse(data: Uint8Array): DoubaoDecodedResponse {
  const decoded = asrResponseType.decode(data);
  const message = asrResponseType.toObject(decoded, {
    defaults: true,
    enums: Number,
    bytes: Uint8Array,
  }) as {
    requestId?: string;
    taskId?: string;
    serviceName?: string;
    messageType?: string;
    statusCode?: number;
    statusMessage?: string;
    resultJson?: string;
  };

  return {
    requestId: message.requestId ?? "",
    taskId: message.taskId ?? "",
    serviceName: message.serviceName ?? "",
    messageType: message.messageType ?? "",
    statusCode: message.statusCode ?? 0,
    statusMessage: message.statusMessage ?? "",
    resultJson: message.resultJson ?? "",
  };
}
