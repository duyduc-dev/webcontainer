// internalBinding('block_list') — the native core beneath Node's real
// lib/internal/blocklist.js and lib/internal/socketaddress.js (both already
// vendored verbatim - see their own doc comments). Real Node's own
// implementation is a genuine native C++ class doing real IP/CIDR range
// matching; no vendor-and-adapt shortcut exists for that the way it does
// for pure-JS builtins, so this is a from-scratch reimplementation - scoped
// to exactly the 8 members internal/{blocklist,socketaddress}.js actually
// destructure (SocketAddress, AF_INET, AF_INET6, and BlockList's
// addAddress/addRange/addSubnet/check/getRules), not the full native ABI.
//
// IPv4/IPv6 text parsing and RFC-5952-canonical formatting are NOT
// reimplemented here - bindings/ip.ts already has real, tested versions
// (originally built for cares_wrap/DNS), reused as-is.
//
// Verified against real Node directly (node -e '...'), not just read from
// docs: rule string formats ("Address: IPv4 x", "Range: IPv4 x-y", "Subnet:
// IPv4 x/y", IPv6 equivalents), getRules() returning most-recently-added
// first (not insertion order), check()'s family-must-match-exactly
// behavior, and IPv6 canonicalization specifics (only the well-known
// ::ffff:0:0/96 prefix keeps a dotted-quad tail; any other embedded-IPv4
// notation, e.g. a NAT64 64:ff9b::/96 address, becomes plain hex groups).
import { formatIPv4, formatIPv6, parseIPv4, parseIPv6 } from "./ip";

// Arbitrary but POSIX-authentic (AF_INET/AF_INET6 on Linux) - nothing here
// depends on the exact values, only on the two being distinct and stable
// for one process's lifetime (internal/socketaddress.js only ever compares
// them to each other via `===`).
const AF_INET = 2;
const AF_INET6 = 10;

const invalidAddress = (): never => {
  throw Object.assign(new TypeError("Invalid socket address"), { code: "ERR_INVALID_ADDRESS" });
};

const parseAddressOrThrow = (family: number, address: string): Uint8Array => {
  try {
    return family === AF_INET ? parseIPv4(address) : parseIPv6(address);
  } catch {
    return invalidAddress();
  }
};

interface SocketAddressDetail {
  address: string | undefined;
  port: number | undefined;
  family: number | undefined;
  flowlabel: number | undefined;
}

class SocketAddressHandle {
  family: number;
  bytes: Uint8Array;
  port: number;
  #flowlabel: number;

  constructor(address: string, port: number, family: number, flowlabel: number) {
    this.family = family;
    this.bytes = parseAddressOrThrow(family, address);
    this.port = port & 0xffff;
    this.#flowlabel = flowlabel >>> 0;
  }

  detail(shape: SocketAddressDetail): SocketAddressDetail {
    shape.address = this.family === AF_INET ? formatIPv4(this.bytes) : formatIPv6(this.bytes);
    shape.port = this.port;
    shape.family = this.family;
    shape.flowlabel = this.#flowlabel;
    return shape;
  }

  flowlabel(): number {
    return this.#flowlabel;
  }
}

/** Lexicographic byte compare - correctly implements big-endian numeric
 * ordering for both a 4-byte IPv4 and a 16-byte IPv6 address (same-family
 * comparisons only; callers never compare across families). */
const compareBytes = (a: Uint8Array, b: Uint8Array): number => {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return 0;
};

/** Zeroes every bit past `prefix` - the standard CIDR network-mask
 * operation, on whichever byte length `bytes` already is (4 or 16). */
const maskBytes = (bytes: Uint8Array, prefix: number): Uint8Array => {
  const out = new Uint8Array(bytes.length);
  const fullBytes = prefix >> 3;
  const remBits = prefix & 7;
  for (let i = 0; i < fullBytes; i++) out[i] = bytes[i]!;
  if (remBits > 0) out[fullBytes] = bytes[fullBytes]! & ((0xff << (8 - remBits)) & 0xff);
  return out;
};

type Rule =
  | { kind: "address"; family: number; bytes: Uint8Array }
  | { kind: "range"; family: number; start: Uint8Array; end: Uint8Array }
  | { kind: "subnet"; family: number; network: Uint8Array; prefix: number };

const formatAddr = (family: number, bytes: Uint8Array): string => (family === AF_INET ? formatIPv4(bytes) : formatIPv6(bytes));

class BlockListHandle {
  #rules: Rule[] = [];

  addAddress(handle: SocketAddressHandle): void {
    this.#rules.push({ kind: "address", family: handle.family, bytes: handle.bytes });
  }

  /** Returns false (not a throw) for start > end - internal/blocklist.js's
   * own JS layer turns that into the real ERR_INVALID_ARG_VALUE, matching
   * real Node's own native/JS split. */
  addRange(start: SocketAddressHandle, end: SocketAddressHandle): boolean {
    if (start.family !== end.family || compareBytes(start.bytes, end.bytes) > 0) return false;
    this.#rules.push({ kind: "range", family: start.family, start: start.bytes, end: end.bytes });
    return true;
  }

  addSubnet(network: SocketAddressHandle, prefix: number): void {
    this.#rules.push({ kind: "subnet", family: network.family, network: maskBytes(network.bytes, prefix), prefix });
  }

  check(address: SocketAddressHandle): boolean {
    for (const rule of this.#rules) {
      if (rule.family !== address.family) continue;
      if (rule.kind === "address" && compareBytes(rule.bytes, address.bytes) === 0) return true;
      if (rule.kind === "range" && compareBytes(address.bytes, rule.start) >= 0 && compareBytes(address.bytes, rule.end) <= 0) return true;
      if (rule.kind === "subnet" && compareBytes(maskBytes(address.bytes, rule.prefix), rule.network) === 0) return true;
    }
    return false;
  }

  /** Most-recently-added rule first - a real, verified-against-real-Node
   * behavior (not an arbitrary choice), since internal/blocklist.js's own
   * `fromJSON()` round-trips through this exact format via #parseIPInfo(). */
  getRules(): string[] {
    const strings = this.#rules.map((rule) => {
      const fam = rule.family === AF_INET ? "IPv4" : "IPv6";
      if (rule.kind === "address") return `Address: ${fam} ${formatAddr(rule.family, rule.bytes)}`;
      if (rule.kind === "range") return `Range: ${fam} ${formatAddr(rule.family, rule.start)}-${formatAddr(rule.family, rule.end)}`;
      return `Subnet: ${fam} ${formatAddr(rule.family, rule.network)}/${rule.prefix}`;
    });
    return strings.reverse();
  }
}

const createBlockListBindings = () => ({
  SocketAddress: SocketAddressHandle,
  AF_INET,
  AF_INET6,
  BlockList: BlockListHandle,
});

export { createBlockListBindings };
