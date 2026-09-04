import { describe, expect, it, vi } from "vitest";
import { postWithTransfer } from "./transfer";

describe("postWithTransfer", () => {
  it("posts a plain message with no transferables", () => {
    const target = { postMessage: vi.fn() };
    postWithTransfer(target, { id: "1", type: "PING" });
    expect(target.postMessage).toHaveBeenCalledWith({ id: "1", type: "PING" }, []);
  });

  it("allows a MessagePort that is listed in the transfer list", () => {
    const { port1, port2 } = new MessageChannel();
    const target = { postMessage: vi.fn() };

    postWithTransfer(target, { id: "1", type: "INIT", payload: { port: port1 } }, [port1]);

    expect(target.postMessage).toHaveBeenCalledTimes(1);
    const [message, transfer] = target.postMessage.mock.calls[0];
    expect(message.payload.port).toBe(port1);
    expect(transfer).toEqual([port1]);
    port2.close();
  });

  it("throws when a MessagePort is embedded but not listed in the transfer list", () => {
    const { port1, port2 } = new MessageChannel();
    const target = { postMessage: vi.fn() };

    expect(() =>
      postWithTransfer(target, { id: "1", type: "INIT", payload: { port: port1 } }),
    ).toThrowError(/payload\.port/);
    expect(target.postMessage).not.toHaveBeenCalled();

    port1.close();
    port2.close();
  });

  it("throws when an ArrayBuffer nested in an array is missing from the transfer list", () => {
    const buffer = new ArrayBuffer(8);
    const target = { postMessage: vi.fn() };

    expect(() => postWithTransfer(target, { chunks: [buffer] })).toThrowError(/chunks\[0\]/);
  });
});
