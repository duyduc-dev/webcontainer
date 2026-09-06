type FSErrorCode = "ENOENT" | "EEXIST" | "ENOTDIR" | "EISDIR" | "ENOTEMPTY" | "EINVAL" | "EFBIG" | "ELOOP";

class FSError extends Error {
  code: FSErrorCode;
  path: string;

  constructor(code: FSErrorCode, path: string, message?: string) {
    super(message ?? `${code}: ${path}`);
    this.name = "FSError";
    this.code = code;
    this.path = path;
  }
}

export { FSError };
export type { FSErrorCode };
