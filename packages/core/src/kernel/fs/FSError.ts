export type FSErrorCode =
  | "ENOENT"
  | "EEXIST"
  | "ENOTDIR"
  | "EISDIR"
  | "ENOTEMPTY"
  | "EINVAL"
  | "EFBIG";

export class FSError extends Error {
  readonly code: FSErrorCode;
  readonly path: string;

  constructor(code: FSErrorCode, path: string, message?: string) {
    super(message ?? `${code}: ${path}`);
    this.name = "FSError";
    this.code = code;
    this.path = path;
  }
}
