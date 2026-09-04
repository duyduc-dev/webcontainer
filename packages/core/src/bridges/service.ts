const registerKernelWorker = () => {
  const worker = new Worker(new URL("workers/kernel/worker.js", import.meta.url), {
    type: "module",
  });

  return worker;
};

export { registerKernelWorker };
