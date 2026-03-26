import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStartTaskMessage,
  decodeDoubaoResponse,
} from "../api/asr/providers/doubao/proto";
import protobuf from "protobufjs";

const PROTO = `
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
}

enum FrameState {
  FRAME_STATE_UNSPECIFIED = 0;
  FRAME_STATE_FIRST = 1;
  FRAME_STATE_MIDDLE = 3;
  FRAME_STATE_LAST = 9;
}
`;

const root = protobuf.parse(PROTO).root;
const asrRequestType = root.lookupType("asr.AsrRequest");
const asrResponseType = root.lookupType("asr.AsrResponse");

test("buildStartTaskMessage encodes camelCase protobuf fields correctly", () => {
  const encoded = buildStartTaskMessage("req-1", "token-1");
  const decoded = asrRequestType.toObject(asrRequestType.decode(encoded), {
    defaults: true,
  }) as {
    token: string;
    serviceName: string;
    methodName: string;
    requestId: string;
  };

  assert.equal(decoded.token, "token-1");
  assert.equal(decoded.serviceName, "ASR");
  assert.equal(decoded.methodName, "StartTask");
  assert.equal(decoded.requestId, "req-1");
});

test("decodeDoubaoResponse reads protobuf response fields", () => {
  const encoded = asrResponseType.encode(
    asrResponseType.create({
      requestId: "req-2",
      taskId: "task-2",
      serviceName: "ASR",
      messageType: "TaskStarted",
      statusCode: 200,
      statusMessage: "OK",
      resultJson: "",
    }),
  ).finish();

  assert.deepEqual(decodeDoubaoResponse(encoded), {
    requestId: "req-2",
    taskId: "task-2",
    serviceName: "ASR",
    messageType: "TaskStarted",
    statusCode: 200,
    statusMessage: "OK",
    resultJson: "",
  });
});
