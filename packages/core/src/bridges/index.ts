import { registerKernelWorker } from "./service";

type Unsubscribe = () => void;
type Handler = (...args: any[]) => void;

interface KernelBridgeReturn {
  addEventListener(type: string, handler: Handler): Unsubscribe;
}

const createKernelBridge = (): KernelBridgeReturn => {
  const listeners = new Map<string, Set<Handler>>();

  const kernelWorker = registerKernelWorker();
  kernelWorker.postMessage({ type: "ping" });

  kernelWorker.onmessage = (e) => {
    console.log("e", e);
  };

  return {
    addEventListener: function (type: string, handler: Handler): Unsubscribe {
      let handlers = listeners.get(type);
      if (!handlers) listeners.set(type, (handlers = new Set()));
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
};

export { createKernelBridge };
