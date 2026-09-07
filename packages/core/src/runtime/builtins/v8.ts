// Hand-written, not vendored: real Node's v8 module wraps the V8 engine
// directly (internalBinding('v8'), heap snapshots, serialization) - none of
// that exists to query from inside a browser sandbox. Traced need: real
// npm's own @npmcli/arborist sizes an in-memory packument cache off
// `getHeapStatistics().heap_size_limit` - a plausible, fixed stand-in (same
// philosophy as os.ts's totalmem/freemem: there is no real host V8 heap to
// report on). Every other getHeapStatistics() field is included for shape
// completeness (a caller destructuring an untraced one gets a real number,
// not undefined) but only heap_size_limit is a value any traced caller
// actually reads. serialize()/deserialize()/heap snapshots and everything
// else v8 exports are NOT implemented - a genuinely different, much larger
// undertaking nothing has traced a need for yet.
const HEAP_SIZE_LIMIT = 2 * 1024 * 1024 * 1024;

const getHeapStatistics = () => ({
  total_heap_size: 64 * 1024 * 1024,
  total_heap_size_executable: 8 * 1024 * 1024,
  total_physical_size: 64 * 1024 * 1024,
  total_available_size: HEAP_SIZE_LIMIT,
  used_heap_size: 32 * 1024 * 1024,
  heap_size_limit: HEAP_SIZE_LIMIT,
  malloced_memory: 8192,
  peak_malloced_memory: 16384,
  does_zap_garbage: 0,
  number_of_native_contexts: 1,
  number_of_detached_contexts: 0,
  total_global_handles_size: 8192,
  used_global_handles_size: 4096,
  external_memory: 0,
});

const createV8Module = () => ({ getHeapStatistics });

export { createV8Module };
