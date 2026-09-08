import { describe, expect, it } from "vitest";
import { createBlockListBindings } from "./blockList";

// Every expected value below was checked directly against a real Node
// (`node -e "..."`, using the real net.SocketAddress/net.BlockList) - not
// derived from documentation alone. See blockList.ts's own doc comment.
const { SocketAddress, AF_INET, AF_INET6, BlockList } = createBlockListBindings();

const addr = (address: string, family: number = AF_INET, port = 0, flowlabel = 0) => new SocketAddress(address, port, family, flowlabel);

describe("internalBinding('block_list') - SocketAddress", () => {
  it("normalizes an IPv4 address and reports family/port", () => {
    const detail = addr("192.168.1.1", AF_INET, 80).detail({ address: undefined, port: undefined, family: undefined, flowlabel: undefined });
    expect(detail).toEqual({ address: "192.168.1.1", port: 80, family: AF_INET, flowlabel: 0 });
  });

  it("canonicalizes an IPv6 address (RFC 5952: lowercase, longest zero-run compressed)", () => {
    const detail = addr("2001:0db8:0001:0000:0000:0ab9:C0A8:0102", AF_INET6).detail({
      address: undefined,
      port: undefined,
      family: undefined,
      flowlabel: undefined,
    });
    expect(detail.address).toBe("2001:db8:1::ab9:c0a8:102");
  });

  it("keeps a dotted-quad tail only for the well-known ::ffff:0:0/96 prefix, not other embedded-IPv4 notations", () => {
    expect(addr("::ffff:1.2.3.4", AF_INET6).detail({ address: undefined, port: undefined, family: undefined, flowlabel: undefined }).address).toBe(
      "::ffff:1.2.3.4",
    );
    // 64:ff9b::/96 (NAT64) is a DIFFERENT prefix - real Node renders its
    // embedded IPv4 tail as plain hex groups, not a dotted quad.
    expect(addr("64:ff9b::1.2.3.4", AF_INET6).detail({ address: undefined, port: undefined, family: undefined, flowlabel: undefined }).address).toBe(
      "64:ff9b::102:304",
    );
  });

  it("reports flowlabel", () => {
    expect(addr("::1", AF_INET6, 443, 7).flowlabel()).toBe(7);
  });

  it("throws ERR_INVALID_ADDRESS for an unparseable address", () => {
    expect(() => addr("not-an-ip")).toThrow(expect.objectContaining({ code: "ERR_INVALID_ADDRESS" }));
  });
});

describe("internalBinding('block_list') - BlockList", () => {
  it("addAddress + check: exact match only", () => {
    const bl = new BlockList();
    bl.addAddress(addr("10.0.0.5"));
    expect(bl.check(addr("10.0.0.5"))).toBe(true);
    expect(bl.check(addr("10.0.0.6"))).toBe(false);
  });

  it("addSubnet + check: CIDR membership", () => {
    const bl = new BlockList();
    bl.addSubnet(addr("192.168.1.0"), 24);
    expect(bl.check(addr("192.168.1.55"))).toBe(true);
    expect(bl.check(addr("192.168.2.1"))).toBe(false);
  });

  it("a /32 subnet behaves as a single address, and is reported as a Subnet rule, not collapsed to an Address rule", () => {
    const bl = new BlockList();
    bl.addSubnet(addr("10.0.0.5"), 32);
    expect(bl.check(addr("10.0.0.5"))).toBe(true);
    expect(bl.check(addr("10.0.0.6"))).toBe(false);
    expect(bl.getRules()).toEqual(["Subnet: IPv4 10.0.0.5/32"]);
  });

  it("addRange + check: inclusive range membership", () => {
    const bl = new BlockList();
    expect(bl.addRange(addr("192.168.2.1"), addr("192.168.2.10"))).toBe(true);
    expect(bl.check(addr("192.168.2.1"))).toBe(true);
    expect(bl.check(addr("192.168.2.5"))).toBe(true);
    expect(bl.check(addr("192.168.2.10"))).toBe(true);
    expect(bl.check(addr("192.168.2.11"))).toBe(false);
  });

  it("addRange returns false (not a throw) when start > end", () => {
    const bl = new BlockList();
    expect(bl.addRange(addr("10.0.0.10"), addr("10.0.0.1"))).toBe(false);
  });

  it("check() requires an exact family match - an IPv6 rule never matches an IPv4 check or vice versa", () => {
    const bl = new BlockList();
    bl.addAddress(addr("2001:db8::1", AF_INET6));
    expect(bl.check(addr("2001:db8::1", AF_INET6))).toBe(true);
    // Same bytes would never occur across families in practice, but the
    // real contract is family-gated first, which this exercises directly.
    expect(bl.check(addr("10.0.0.1", AF_INET))).toBe(false);
  });

  it("getRules() returns most-recently-added first, in real Node's exact string format", () => {
    const bl = new BlockList();
    bl.addAddress(addr("10.0.0.5"));
    bl.addSubnet(addr("192.168.1.0"), 24);
    bl.addRange(addr("192.168.2.1"), addr("192.168.2.10"));
    expect(bl.getRules()).toEqual(["Range: IPv4 192.168.2.1-192.168.2.10", "Subnet: IPv4 192.168.1.0/24", "Address: IPv4 10.0.0.5"]);
  });

  it("getRules() for IPv6 subnet, real Node's exact canonical format", () => {
    const bl = new BlockList();
    bl.addSubnet(addr("2001:db8::", AF_INET6), 32);
    expect(bl.getRules()).toEqual(["Subnet: IPv6 2001:db8::/32"]);
    expect(bl.check(addr("2001:db8::1", AF_INET6))).toBe(true);
    expect(bl.check(addr("2001:db9::1", AF_INET6))).toBe(false);
  });
});
