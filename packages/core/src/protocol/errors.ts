class DWCError extends Error {
  code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "DWCError";
    this.code = code;
  }
}

const ERR_WORKER = "ERR_WORKER";
const ERR_BOOT_TIMEOUT = "ERR_BOOT_TIMEOUT";
const ERR_NOT_ISOLATED = "ERR_NOT_ISOLATED";
const ERR_NOT_IMPLEMENTED = "ERR_NOT_IMPLEMENTED";

export { DWCError, ERR_BOOT_TIMEOUT, ERR_NOT_IMPLEMENTED, ERR_NOT_ISOLATED, ERR_WORKER };
