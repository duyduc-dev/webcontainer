type RequestEnvelope<T = unknown> = {
  id: string;
  type: string;
  payload?: T;
};

type ReplySuccess<T = unknown> = {
  id: string;
  ok: true;
  result: T;
};

type ReplyFailure = {
  id: string;
  ok: false;
  error: { code: string; message: string };
};

type ReplyEnvelope<T = unknown> = ReplySuccess<T> | ReplyFailure;

type EventEnvelope<T = unknown> = {
  type: string;
  payload?: T;
};

const createRequest = <T = unknown>(id: string, type: string, payload?: T): RequestEnvelope<T> => ({
  id,
  type,
  payload,
});

const createReply = <T = unknown>(id: string, result: T): ReplySuccess<T> => ({
  id,
  ok: true,
  result,
});

const createErrorReply = (id: string, code: string, message: string): ReplyFailure => ({
  id,
  ok: false,
  error: { code, message },
});

const createEvent = <T = unknown>(type: string, payload?: T): EventEnvelope<T> => ({ type, payload });

const isReply = (data: unknown): data is ReplyEnvelope =>
  typeof data === "object" && data !== null && "id" in data && "ok" in data;

const isEvent = (data: unknown): data is EventEnvelope =>
  typeof data === "object" && data !== null && "type" in data && !("id" in data);

export { createErrorReply, createEvent, createReply, createRequest, isEvent, isReply };
export type { EventEnvelope, ReplyEnvelope, ReplyFailure, ReplySuccess, RequestEnvelope };
