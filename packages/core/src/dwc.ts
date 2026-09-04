import { createKernelBridge } from "./bridges";

type Unsubscribe = () => void;
type Handler = (...args: any[]) => void;

interface BootDWCReturn {
  addEventListener(type: string, handler: Handler): Unsubscribe;
}

const bootDWC = (): BootDWCReturn => {
  const kernelBridge = createKernelBridge();
  const listeners = new Map<string, Set<Handler>>();

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

export { bootDWC };
