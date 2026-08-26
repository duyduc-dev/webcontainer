import { KernelBridge } from "../bridges/kernel/KernelBridge";
import { KernelBTWEventType } from "../models/kernel/KernelBridgeToWorkerModels";
import { PreviewFetchResult } from "../models/kernel/KernelWorkerToBridgeModels";

export type PreviewFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

// Stage A of the dev-server-preview milestone: a direct fetch-style API, no
// iframe/Service Worker routing yet (that's a separate follow-up — see
// ARCHITECTURE notes on Vivari's root-absolute-path and origin-isolation
// concerns, which only matter once real browser navigation is intercepted).
export class Preview {
  constructor(private readonly bridge: KernelBridge) {}

  fetch(port: number, path: string, init: PreviewFetchInit = {}): Promise<PreviewFetchResult> {
    return this.bridge.request({
      type: KernelBTWEventType.PREVIEW_FETCH,
      op: "previewFetch",
      port,
      path,
      method: init.method ?? "GET",
      headers: init.headers ?? {},
      body: init.body,
    });
  }
}
