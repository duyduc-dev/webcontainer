// libuv's error numbers and descriptions, needed by `uv` (bindings/net.ts).
// Values are Linux's errno, negated — what libuv reports and what Node's
// `err.errno` carries. NOT the same numbers as `internalBinding('constants').os.errno`.
// Ported from vivari (github.com/maitrungduc1410/vivari, MIT), packages/runtime/node/bindings/uv-errors.js.

const UV_MESSAGES: Record<number, [string, string]> = {
  [-4095]: ["EOF", "end of file"],
  [-1]: ["EPERM", "operation not permitted"],
  [-2]: ["ENOENT", "no such file or directory"],
  [-5]: ["EIO", "i/o error"],
  [-9]: ["EBADF", "bad file descriptor"],
  [-11]: ["EAGAIN", "resource temporarily unavailable"],
  [-12]: ["ENOMEM", "not enough memory"],
  [-13]: ["EACCES", "permission denied"],
  [-16]: ["EBUSY", "resource busy or locked"],
  [-17]: ["EEXIST", "file already exists"],
  [-18]: ["EXDEV", "cross-device link not permitted"],
  [-20]: ["ENOTDIR", "not a directory"],
  [-21]: ["EISDIR", "illegal operation on a directory"],
  [-22]: ["EINVAL", "invalid argument"],
  [-23]: ["ENFILE", "file table overflow"],
  [-24]: ["EMFILE", "too many open files"],
  [-27]: ["EFBIG", "file too large"],
  [-28]: ["ENOSPC", "no space left on device"],
  [-29]: ["ESPIPE", "invalid seek"],
  [-30]: ["EROFS", "read-only file system"],
  [-31]: ["EMLINK", "too many links"],
  [-32]: ["EPIPE", "broken pipe"],
  [-36]: ["ENAMETOOLONG", "name too long"],
  [-38]: ["ENOSYS", "function not implemented"],
  [-39]: ["ENOTEMPTY", "directory not empty"],
  [-40]: ["ELOOP", "too many symbolic links encountered"],
  [-75]: ["EOVERFLOW", "value too large for defined data type"],
  [-98]: ["EADDRINUSE", "address already in use"],
  [-99]: ["EADDRNOTAVAIL", "address not available"],
  [-103]: ["ECONNABORTED", "software caused connection abort"],
  [-104]: ["ECONNRESET", "connection reset by peer"],
  [-107]: ["ENOTCONN", "socket is not connected"],
  [-110]: ["ETIMEDOUT", "connection timed out"],
  [-111]: ["ECONNREFUSED", "connection refused"],
  [-113]: ["EHOSTUNREACH", "host is unreachable"],
  [-125]: ["ECANCELED", "operation canceled"],
  // libuv's UV_EAI_NONAME. Real Node spells this 'EAI_NONAME' and lets the dns
  // layer translate it, but nothing here goes through that layer, and
  // 'ENOTFOUND' is both what callers match on and what lib/dns.ts already
  // returns for a name it cannot resolve. Keep the two consistent.
  [-3008]: ["ENOTFOUND", "name not resolved"],
};

// UV_<NAME>: <errno>, derived from the table above so the two cannot drift.
const UV_CODES: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const errno of Object.keys(UV_MESSAGES)) {
    out[`UV_${UV_MESSAGES[Number(errno)]![0]}`] = Number(errno);
  }
  return out;
})();

const errname = (errno: number): string => (UV_MESSAGES[errno] ? UV_MESSAGES[errno][0] : `Unknown system error ${errno}`);

const getErrorMap = (): Map<number, [string, string]> => {
  const m = new Map<number, [string, string]>();
  for (const errno of Object.keys(UV_MESSAGES)) {
    m.set(Number(errno), UV_MESSAGES[Number(errno)]!);
  }
  return m;
};

export { errname, getErrorMap, UV_CODES, UV_MESSAGES };
