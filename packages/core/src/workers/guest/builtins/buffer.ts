// A `Buffer` subset covering what real packages actually touch: from/alloc/
// concat/isBuffer/byteLength, toString/write/equals/compare/indexOf/includes,
// across the common encodings. Not byte-for-byte identical to Node in every
// edge case (same philosophy as path.ts) — extends Uint8Array like the real
// Buffer does, so slice()/subarray() naturally return Buffer instances too.

export type Encoding =
  | "utf8"
  | "utf-8"
  | "hex"
  | "base64"
  | "base64url"
  | "ascii"
  | "latin1"
  | "binary";

function encodeToBytes(str: string, encoding: Encoding = "utf8"): Uint8Array {
  switch (encoding) {
    case "utf8":
    case "utf-8":
      return new TextEncoder().encode(str);
    case "hex": {
      const clean = str.replace(/[^0-9a-fA-F]/g, "");
      const bytes = new Uint8Array(Math.floor(clean.length / 2));
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
      }
      return bytes;
    }
    case "base64":
    case "base64url": {
      const normalized =
        encoding === "base64url" ? str.replace(/-/g, "+").replace(/_/g, "/") : str;
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    case "ascii":
    case "latin1":
    case "binary": {
      const bytes = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
      return bytes;
    }
    default:
      return new TextEncoder().encode(str);
  }
}

function decodeFromBytes(bytes: Uint8Array, encoding: Encoding = "utf8"): string {
  switch (encoding) {
    case "utf8":
    case "utf-8":
      return new TextDecoder().decode(bytes);
    case "hex":
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    case "base64":
    case "base64url": {
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      const b64 = btoa(binary);
      return encoding === "base64url"
        ? b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
        : b64;
    }
    case "ascii":
    case "latin1":
    case "binary": {
      let str = "";
      for (const b of bytes) str += String.fromCharCode(b);
      return str;
    }
    default:
      return new TextDecoder().decode(bytes);
  }
}

function toNeedleBytes(value: string | number | Uint8Array): Uint8Array {
  if (typeof value === "string") return encodeToBytes(value);
  if (typeof value === "number") return new Uint8Array([value & 0xff]);
  return value;
}

// `from`'s real-world signature (data, encoding-or-offset, length) can't
// satisfy the inherited Uint8Array.from static overload set (its second
// overload takes a mapfn where Buffer.from takes an encoding) — the same
// static-side clash every Buffer polyfill hits subclassing Uint8Array. Kept
// off this class entirely and attached below via BufferConstructor instead,
// so the `class BufferImpl extends Uint8Array` declaration itself never has
// to reconcile the two incompatible shapes.
class BufferImpl extends Uint8Array {
  toString(encoding: Encoding = "utf8", start = 0, end: number = this.length): string {
    return decodeFromBytes(this.subarray(start, end), encoding);
  }

  write(value: string, offset = 0, encoding: Encoding = "utf8"): number {
    const bytes = encodeToBytes(value, encoding);
    const usable = Math.max(0, Math.min(bytes.length, this.length - offset));
    this.set(bytes.subarray(0, usable), offset);
    return usable;
  }

  equals(other: Uint8Array): boolean {
    if (this.length !== other.length) return false;
    for (let i = 0; i < this.length; i++) {
      if (this[i] !== other[i]) return false;
    }
    return true;
  }

  compare(other: Uint8Array): -1 | 0 | 1 {
    const len = Math.min(this.length, other.length);
    for (let i = 0; i < len; i++) {
      if (this[i] !== other[i]) return this[i] < other[i] ? -1 : 1;
    }
    if (this.length === other.length) return 0;
    return this.length < other.length ? -1 : 1;
  }

  indexOf(value: string | number | Uint8Array, byteOffset = 0): number {
    const needle = toNeedleBytes(value);
    if (needle.length === 0) return Math.max(0, Math.min(byteOffset, this.length));
    search: for (let i = Math.max(0, byteOffset); i <= this.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (this[i + j] !== needle[j]) continue search;
      }
      return i;
    }
    return -1;
  }

  includes(value: string | number | Uint8Array, byteOffset = 0): boolean {
    return this.indexOf(value, byteOffset) !== -1;
  }

  // Node's Buffer#slice is an alias for subarray (a view over the same
  // memory), unlike Uint8Array#slice (a copy) — override so mutating a slice
  // propagates back to the original, matching real Buffer semantics.
  slice(start?: number, end?: number): BufferImpl {
    return this.subarray(start, end) as BufferImpl;
  }

  static isBuffer(obj: unknown): obj is BufferImpl {
    return obj instanceof BufferImpl;
  }

  static byteLength(input: string | Uint8Array, encoding: Encoding = "utf8"): number {
    return typeof input === "string" ? encodeToBytes(input, encoding).length : input.byteLength;
  }

  static compare(a: Uint8Array, b: Uint8Array): -1 | 0 | 1 {
    return bufferFrom(a).compare(b);
  }

  static alloc(size: number, fill?: string | number, encoding: Encoding = "utf8"): BufferImpl {
    const buf = new BufferImpl(size);
    if (typeof fill === "number") {
      buf.fill(fill);
    } else if (typeof fill === "string" && fill.length > 0) {
      const bytes = encodeToBytes(fill, encoding);
      for (let i = 0; i < size; i++) buf[i] = bytes[i % bytes.length];
    }
    return buf;
  }

  static allocUnsafe(size: number): BufferImpl {
    return new BufferImpl(size);
  }

  static concat(list: Uint8Array[], totalLength?: number): BufferImpl {
    const total = totalLength ?? list.reduce((sum, b) => sum + b.length, 0);
    const buf = new BufferImpl(total);
    let offset = 0;
    for (const b of list) {
      if (offset >= total) break;
      const slice = b.subarray(0, Math.min(b.length, total - offset));
      buf.set(slice, offset);
      offset += slice.length;
    }
    return buf;
  }
}

function bufferFrom(
  data: string | ArrayLike<number> | ArrayBuffer,
  encodingOrOffset?: Encoding | number,
  length?: number,
): BufferImpl {
  if (typeof data === "string") {
    const bytes = encodeToBytes(data, encodingOrOffset as Encoding);
    const buf = new BufferImpl(bytes.length);
    buf.set(bytes);
    return buf;
  }
  if (data instanceof ArrayBuffer) {
    return new BufferImpl(data, encodingOrOffset as number | undefined, length);
  }
  const buf = new BufferImpl(data.length);
  buf.set(data);
  return buf;
}

// Omit (not intersect) the inherited static `from` — intersecting two
// differently-shaped call signatures under the same property name produces
// an unusable combined signature, silently falling back to the wrong (native
// Uint8Array) overload throughout every consumer of `Buffer.from(...)`.
type BufferConstructor = Omit<typeof BufferImpl, "from"> & {
  from(
    data: string | ArrayLike<number> | ArrayBuffer,
    encodingOrOffset?: Encoding | number,
    length?: number,
  ): BufferImpl;
};

export const Buffer = BufferImpl as unknown as BufferConstructor;
(Buffer as unknown as { from: typeof bufferFrom }).from = bufferFrom;
export type Buffer = BufferImpl;
