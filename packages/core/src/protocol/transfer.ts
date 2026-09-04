interface Postable {
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const isTransferable = (value: unknown): value is Transferable =>
  value instanceof MessagePort || value instanceof ArrayBuffer;

const collectTransferables = (value: unknown, path: string, found: Map<Transferable, string>): void => {
  if (isTransferable(value)) {
    if (!found.has(value)) found.set(value, path);
    return;
  }

  if (value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    (value as unknown[]).forEach((item, index) => collectTransferables(item, `${path}[${index}]`, found));
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectTransferables(child, path ? `${path}.${key}` : key, found);
  }
};

/**
 * The single postMessage call site every worker-spawn/bridge path should use.
 * A MessagePort or ArrayBuffer embedded in `message` but missing from `transfer`
 * produces a silent/late DataCloneError from the platform - this fails fast instead.
 */
const postWithTransfer = (target: Postable, message: unknown, transfer: Transferable[] = []): void => {
  const found = new Map<Transferable, string>();
  collectTransferables(message, "", found);

  const missing = [...found.entries()].filter(([object]) => !transfer.includes(object));
  if (missing.length > 0) {
    const paths = missing.map(([, path]) => path || "<root>").join(", ");
    throw new Error(
      `postWithTransfer: message contains transferable object(s) not listed in the transfer list: ${paths}`,
    );
  }

  target.postMessage(message, transfer);
};

export { postWithTransfer };
export type { Postable };
