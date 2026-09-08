// internal/file — the platform's File, same reasoning as internal/blob.js
// right next to it: real Node's own internal/file.js (~150 lines) is a pure-JS
// `class File extends Blob` adding `.name`/`.lastModified`, plus structured-
// clone transfer plumbing (TransferableFile/kClone/kDeserialize) for sending
// a File across a postMessage/worker boundary. Every engine this runtime
// boots on already has a spec File global (Worker scope includes the File API
// alongside Blob) with the exact same constructor shape
// (`new File(fileBits, fileName, options)`) and `.name`/`.lastModified`/
// `.size`/`.type` already correct - no reason to re-derive what the platform
// already gives us for free, matching internal/blob.js's own precedent.
//
// The transfer plumbing is NOT included - nothing traced needs a File
// surviving a structured-clone/worker-transfer boundary yet (real Node's own
// File already structured-clones correctly via the browser's native
// implementation for ordinary postMessage anyway; only Node's OWN internal
// worker_threads transfer protocol needs the kClone/kDeserialize hooks,
// which this runtime's own worker_threads.Worker doesn't use for File/Blob -
// see runtime/builtins/worker_threads.ts's own doc comment on its traced,
// narrow scope).
export default function (exports, require, module, process, internalBinding, primordials) {
  "use strict";

  module.exports = {
    File: globalThis.File,
  };
}
