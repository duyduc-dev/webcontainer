import { describe, expect, it } from "vitest";
import { createHttp2Module } from "./http2";

describe("createHttp2Module", () => {
  it("constants exposes the header-name constants real sigstore/@sigstore-sign destructures directly", () => {
    const http2 = createHttp2Module();
    expect(http2.constants.HTTP2_HEADER_LOCATION).toBe("location");
    expect(http2.constants.HTTP2_HEADER_CONTENT_TYPE).toBe("content-type");
    expect(http2.constants.HTTP2_HEADER_USER_AGENT).toBe("user-agent");
  });

  it("constants exposes the standard HTTP status code constants", () => {
    const http2 = createHttp2Module();
    expect(http2.constants.HTTP_STATUS_INTERNAL_SERVER_ERROR).toBe(500);
    expect(http2.constants.HTTP_STATUS_TOO_MANY_REQUESTS).toBe(429);
    expect(http2.constants.HTTP_STATUS_REQUEST_TIMEOUT).toBe(408);
    expect(http2.constants.HTTP_STATUS_OK).toBe(200);
  });

  it("does not implement real session/server/stream APIs - deliberately scoped to constants only", () => {
    const http2 = createHttp2Module() as Record<string, unknown>;
    expect(http2.connect).toBeUndefined();
    expect(http2.createServer).toBeUndefined();
  });
});
