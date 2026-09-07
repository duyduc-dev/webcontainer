import { describe, expect, it } from "vitest";
import {
  decodeSyncExecRequest,
  decodeSyncExecResponse,
  encodeSyncExecRequest,
  encodeSyncExecResponse,
  SYNC_EXEC_DATA_BUFFER_SIZE,
} from "./syncExecWireFormat";
import type { SyncExecRequest, SyncExecResponse } from "./syncExecWireFormat";

const roundTripRequest = (request: SyncExecRequest): SyncExecRequest => {
  const buffer = new ArrayBuffer(SYNC_EXEC_DATA_BUFFER_SIZE);
  encodeSyncExecRequest(request, buffer);
  return decodeSyncExecRequest(buffer);
};

const roundTripResponse = (response: SyncExecResponse): SyncExecResponse => {
  const buffer = new ArrayBuffer(SYNC_EXEC_DATA_BUFFER_SIZE);
  encodeSyncExecResponse(response, buffer);
  return decodeSyncExecResponse(buffer);
};

describe("syncExecWireFormat requests", () => {
  it("round-trips a command with args, cwd, and env", () => {
    const request: SyncExecRequest = {
      command: "pnpm",
      args: ["i", "@rolldown/binding-wasm32-wasi@1.2.3"],
      cwd: "/tmp/rolldown-1.2.3",
      env: { NODE_ENV: "production", PATH: "/bin" },
    };
    expect(roundTripRequest(request)).toEqual(request);
  });

  it("round-trips no args and no env entries", () => {
    const request: SyncExecRequest = { command: "true", args: [], cwd: "/", env: {} };
    expect(roundTripRequest(request)).toEqual(request);
  });
});

describe("syncExecWireFormat responses", () => {
  it("round-trips a successful response", () => {
    const response: SyncExecResponse = { ok: true, exitCode: 0, output: "added 1 package\n" };
    expect(roundTripResponse(response)).toEqual(response);
  });

  it("round-trips a non-zero exit code", () => {
    const response: SyncExecResponse = { ok: true, exitCode: 1, output: "" };
    expect(roundTripResponse(response)).toEqual(response);
  });

  it("round-trips an error response (e.g. command not found)", () => {
    const response: SyncExecResponse = { ok: false, message: "pnpm: command not found" };
    expect(roundTripResponse(response)).toEqual(response);
  });
});
