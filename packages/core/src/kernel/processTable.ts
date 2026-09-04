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
}

const createProcessTable = (): ProcessTable => {
  const processes = new Map<string, ProcessEntry>();

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
      return processes.delete(id);
    },
    list() {
      return [...processes.values()];
    },
  };
};

export { createProcessTable };
export type { ProcessEntry, ProcessStatus, ProcessTable };
