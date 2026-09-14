import { bootWC, type BootWCReturn } from "duckwc";

// One sandbox per page load, created lazily on first real use (not at module
// load) so the Home page itself stays instant - booting the kernel worker is
// cheap, but there's no reason to pay even that before the user has picked
// an action.
let dwcInstance: BootWCReturn | null = null;

export function getDwc(): BootWCReturn {
  if (!dwcInstance) dwcInstance = bootWC();
  return dwcInstance;
}

// npm itself is only needed by template projects (a blank project never
// shells out to npm) - fetched once per session and cached, matching
// examples/playground's own proven recipe.
let npmInstallPromise: Promise<{ version: string; fileCount: number }> | null = null;

export function ensureNpm(): Promise<{ version: string; fileCount: number }> {
  if (!npmInstallPromise) npmInstallPromise = getDwc().npm.install("10.9.2");
  return npmInstallPromise;
}

export function waitForListen(dwc: BootWCReturn, port: number, timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error(`timed out waiting for a guest server on port ${port}`));
    }, timeoutMs);
    const unsubscribe = dwc.addEventListener("listen", (event: { port?: unknown }) => {
      if (event.port !== port) return;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
}

// Streams a ReadableStream<Uint8Array> to a callback as decoded text chunks
// arrive - the same shape examples/playground/src/main.ts's pipeToConsole
// uses for dwc.shell.spawn()'s stdout/stderr.
export function pipeToLog(stream: ReadableStream<Uint8Array>, onChunk: (text: string) => void): void {
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  void (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        const trailing = decoder.decode();
        if (trailing) onChunk(trailing);
        return;
      }
      onChunk(decoder.decode(value, { stream: true }));
    }
  })();
}

// Same as pipeToLog, but resolves once `marker` has appeared in the combined
// text (or rejects if the stream closes first) - used to detect a dev
// server's own "ready" banner instead of guessing with a timer.
// Strips ANSI CSI escape sequences (color/style codes) - a color library can
// legally place a reset code in the middle of what looks like one word (e.g.
// real Vite's own "ready" banner bolds "Local" and resets right before the
// colon), which would otherwise split the literal marker text apart in the
// raw byte stream and make a plain substring search miss it. Matching is
// done against this stripped view; the original, still-colored text is what
// actually gets written to the terminal via onChunk.
// eslint-disable-next-line no-control-regex -- matching a real ANSI escape byte is the point.
const ANSI_CSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const stripAnsi = (text: string): string => text.replace(ANSI_CSI_RE, "");

export function pipeUntilMarker(
  stream: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
  marker: string,
): Promise<void> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  return new Promise<void>((resolve, reject) => {
    let found = false;
    let trailingText = "";

    const logAndCheck = (text: string): void => {
      if (!text) return;
      onChunk(text);
      if (found) return;

      const combined = trailingText + stripAnsi(text);
      if (combined.includes(marker)) {
        found = true;
        resolve();
        return;
      }
      const trailingLength = Math.max(marker.length - 1, 0);
      trailingText = trailingLength === 0 ? "" : combined.slice(-trailingLength);
    };

    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            logAndCheck(decoder.decode());
            if (!found) reject(new Error(`stream closed before printing ${JSON.stringify(marker)}`));
            return;
          }
          logAndCheck(decoder.decode(value, { stream: true }));
        }
      } catch (error) {
        if (found) return;
        reject(error);
      } finally {
        reader.releaseLock();
      }
    })();
  });
}
