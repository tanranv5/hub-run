import assert from "node:assert/strict";
import test from "node:test";
import { createAsrService } from "../api/asr/service";
import type {
  AsrProvider,
  AsrProviderEvent,
  AsrSessionEvent,
} from "../api/asr/types";

function createFakeProvider() {
  const audioChunks: Buffer[] = [];
  let emit: ((event: AsrProviderEvent) => void) | null = null;

  const provider: AsrProvider = {
    summary: {
      id: "fake",
      label: "Fake ASR",
      description: "test provider",
    },
    startSession: async (_input, onEvent) => {
      emit = onEvent;
      onEvent({ type: "session_started" });
      return {
        appendAudio: async (chunk) => {
          audioChunks.push(Buffer.from(chunk));
          onEvent({
            type: "interim_result",
            text: `chunk:${chunk.byteLength}`,
          });
        },
        finish: async () => {
          onEvent({ type: "final_result", text: "完成" });
          onEvent({ type: "session_finished" });
        },
        cancel: async () => {
          onEvent({ type: "session_cancelled" });
        },
      };
    },
  };

  return {
    provider,
    audioChunks,
    emit(event: AsrProviderEvent) {
      if (!emit) {
        throw new Error("provider session not started");
      }
      emit(event);
    },
  };
}

test("asr service buffers events and lets subscribers read only newer items", async () => {
  const fake = createFakeProvider();
  const service = createAsrService({ fake: fake.provider });

  const session = await service.createSession({ providerId: "fake" });
  const initial = service.readEventsAfter(session.sessionId, 0);
  const received: AsrSessionEvent[] = [];
  const unsubscribe = service.subscribe(session.sessionId, (event) => {
    received.push(event);
  });

  assert.equal(session.status, "running");
  assert.deepEqual(
    initial.map((event) => event.type),
    ["session_started"],
  );

  await service.appendAudio(session.sessionId, Buffer.from([1, 2, 3, 4]));
  const afterStart = service.readEventsAfter(
    session.sessionId,
    initial.at(-1)?.eventId ?? 0,
  );

  assert.deepEqual(
    afterStart.map((event) => event.type),
    ["interim_result"],
  );
  assert.deepEqual(received.map((event) => event.type), ["interim_result"]);
  assert.deepEqual(fake.audioChunks, [Buffer.from([1, 2, 3, 4])]);

  unsubscribe();
});

test("asr service advances terminal state and rejects writes after cancellation", async () => {
  const fake = createFakeProvider();
  const service = createAsrService({ fake: fake.provider });

  const session = await service.createSession({ providerId: "fake" });
  await service.cancelSession(session.sessionId);

  const cancelled = service.getSession(session.sessionId);
  assert.equal(cancelled.status, "cancelled");
  assert.deepEqual(
    service.readEventsAfter(session.sessionId, 0).map((event) => event.type),
    ["session_started", "session_cancelled"],
  );

  await assert.rejects(
    service.appendAudio(session.sessionId, Buffer.from([9])),
    /closed/i,
  );
});

test("asr service marks a failed finish as failed instead of leaving the session finishing", async () => {
  const service = createAsrService({
    fake: {
      summary: {
        id: "fake",
        label: "Fake ASR",
        description: "test provider",
      },
      startSession: async (_input, onEvent) => {
        onEvent({ type: "session_started" });
        return {
          appendAudio: async () => undefined,
          finish: async () => {
            throw new Error("finish boom");
          },
          cancel: async () => undefined,
        };
      },
    },
  });

  const session = await service.createSession({ providerId: "fake" });
  await assert.rejects(service.finishSession(session.sessionId), /finish boom/);

  assert.equal(service.getSession(session.sessionId).status, "failed");
  assert.deepEqual(
    service.readEventsAfter(session.sessionId, 0).map((event) => event.type),
    ["session_started", "error"],
  );
});

test("asr service does not overwrite a finished session with cancelled", async () => {
  const service = createAsrService({
    fake: {
      summary: {
        id: "fake",
        label: "Fake ASR",
        description: "test provider",
      },
      startSession: async (_input, onEvent) => {
        onEvent({ type: "session_started" });
        return {
          appendAudio: async () => undefined,
          finish: async () => undefined,
          cancel: async () => {
            onEvent({ type: "session_finished" });
          },
        };
      },
    },
  });

  const session = await service.createSession({ providerId: "fake" });
  await service.cancelSession(session.sessionId);

  assert.equal(service.getSession(session.sessionId).status, "finished");
  assert.deepEqual(
    service.readEventsAfter(session.sessionId, 0).map((event) => event.type),
    ["session_started", "session_finished"],
  );
});

test("asr service caps buffered events and evicts closed sessions after ttl", async () => {
  let emit: ((event: AsrProviderEvent) => void) | null = null;
  const service = createAsrService(
    {
      fake: {
        summary: {
          id: "fake",
          label: "Fake ASR",
          description: "test provider",
        },
        startSession: async (_input, onEvent) => {
          emit = onEvent;
          onEvent({ type: "session_started" });
          return {
            appendAudio: async () => undefined,
            finish: async () => {
              onEvent({ type: "session_finished" });
            },
            cancel: async () => undefined,
          };
        },
      },
    },
    {
      maxEventsPerSession: 2,
      terminalSessionTtlMs: 20,
    } as never,
  );

  const session = await service.createSession({ providerId: "fake" });
  emit?.({ type: "interim_result", text: "one" });
  emit?.({ type: "interim_result", text: "two" });
  emit?.({ type: "interim_result", text: "three" });
  await service.finishSession(session.sessionId);

  assert.deepEqual(
    service.readEventsAfter(session.sessionId, 0).map((event) => event.type),
    ["interim_result", "session_finished"],
  );

  await new Promise((resolve) => {
    setTimeout(resolve, 60);
  });

  assert.throws(() => service.getSession(session.sessionId), /not found/i);
});

test("asr service ignores late provider events after session already finished", async () => {
  let emit: ((event: AsrProviderEvent) => void) | null = null;
  const service = createAsrService({
    fake: {
      summary: {
        id: "fake",
        label: "Fake ASR",
        description: "test provider",
      },
      startSession: async (_input, onEvent) => {
        emit = onEvent;
        onEvent({ type: "session_started" });
        return {
          appendAudio: async () => undefined,
          finish: async () => {
            onEvent({ type: "session_finished" });
          },
          cancel: async () => undefined,
        };
      },
    },
  });

  const session = await service.createSession({ providerId: "fake" });
  await service.finishSession(session.sessionId);
  emit?.({ type: "error", error: "late boom" });

  assert.equal(service.getSession(session.sessionId).status, "finished");
  assert.equal(service.getSession(session.sessionId).errorMessage, null);
  assert.deepEqual(
    service.readEventsAfter(session.sessionId, 0).map((event) => event.type),
    ["session_started", "session_finished"],
  );
});

test("asr service keeps session finishing until provider emits the real terminal event", async () => {
  const service = createAsrService({
    fake: {
      summary: {
        id: "fake",
        label: "Fake ASR",
        description: "test provider",
      },
      startSession: async (_input, onEvent) => {
        onEvent({ type: "session_started" });
        return {
          appendAudio: async () => undefined,
          finish: async () => undefined,
          cancel: async () => undefined,
        };
      },
    },
  });

  const session = await service.createSession({ providerId: "fake" });
  const finishing = await service.finishSession(session.sessionId);

  assert.equal(finishing.status, "finishing");
  assert.equal(service.getSession(session.sessionId).status, "finishing");
  assert.deepEqual(
    service.readEventsAfter(session.sessionId, 0).map((event) => event.type),
    ["session_started"],
  );
});
