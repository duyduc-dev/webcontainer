type ProcessStatus = "running" | "exited";

interface ProcessEntry {
  id: string;
  status: ProcessStatus;
  createdAt: number;
}

interface ProcessTable {
  register(): ProcessEntry;
  get(id: string): ProcessEntry | undefined;
  remove(id: string): boolean;
  list(): ProcessEntry[];
  /** Tracks the real Worker backing one process, for messages the kernel
   * needs to route TO an already-running process from outside its own
   * bootProcess() closure (e.g. PROCESS_STDIN, arriving as a separate
   * request well after the process started) - traced need: dwc.process.
   * spawn()'s `.stdin` WritableStream had nowhere to actually deliver
   * bytes to. Kept OUT of ProcessEntry itself deliberately: entries are
   * sent to the host as PROCESS_LIST's result, and a raw Worker can't be
   * structured-cloned (postMessaging one would throw a DataCloneError). */
  setWorker(id: string, worker: Worker): void;
  getWorker(id: string): Worker | undefined;
}

const createProcessTable = (): ProcessTable => {
  const processes = new Map<string, ProcessEntry>();
  const workers = new Map<string, Worker>();

  return {
    register() {
      const entry: ProcessEntry = {
        id: crypto.randomUUID(),
        status: "running",
        createdAt: Date.now(),
      };
      processes.set(entry.id, entry);
      return entry;
    },
    get(id) {
      return processes.get(id);
    },
    remove(id) {
      workers.delete(id);
      return processes.delete(id);
    },
    list() {
      return [...processes.values()];
    },
    setWorker(id, worker) {
      workers.set(id, worker);
    },
    getWorker(id) {
      return workers.get(id);
    },
  };
};

export { createProcessTable };
export type { ProcessEntry, ProcessStatus, ProcessTable };
