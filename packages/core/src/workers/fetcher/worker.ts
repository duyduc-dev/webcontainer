import { egressHeaders } from "../../runtime/net/egressHeaderPolicy";
import type { RequestEnvelope } from "../../protocol/envelope";
import { DWCError, ERR_INTERNAL, ERR_NET_FETCH_FAILED } from "../../protocol/errors";
import { postErrorReply, postReply } from "./service";

interface NetRequestPayload {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: ArrayBuffer;
}

interface NetReply {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  bodyBytes: ArrayBuffer;
}

/** The only worker with real network access. Every outbound request from a
 * guest process (http/https) rides here through the kernel, one fetch() at a
 * time, so a large tarball's decode never blocks syscall servicing. */
const handleNetRequest = async (payload: NetRequestPayload): Promise<NetReply> => {
  let response: Response;
  try {
    response = await fetch(payload.url, {
      method: payload.method ?? "GET",
      headers: egressHeaders(payload.url, payload.headers, self.location?.origin),
      body: payload.body,
      redirect: "follow",
    });
  } catch (error) {
    throw new DWCError(ERR_NET_FETCH_FAILED, `fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const bodyBytes = await response.arrayBuffer();

  return { status: response.status, statusText: response.statusText, ok: response.ok, headers, bodyBytes };
};

self.onmessage = async (event: MessageEvent<RequestEnvelope<NetRequestPayload>>) => {
  const { id, payload } = event.data;
  try {
    const result = await handleNetRequest(payload as NetRequestPayload);
    postReply(id, result);
  } catch (error) {
    if (error instanceof DWCError) {
      postErrorReply(id, error.code, error.message);
      return;
    }
    postErrorReply(id, ERR_INTERNAL, error instanceof Error ? error.message : String(error));
  }
};
