import { describe, expect, it } from "vitest";
import { createNodeModules } from "./loader";

const fakeProcess = () => ({
  env: {},
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
    queueMicrotask(() => callback(...args));
  },
});

interface HashLike {
  update(data: string): HashLike;
  digest(encoding: string): string;
}

const requireCrypto = () => {
  const { require } = createNodeModules(fakeProcess());
  return require("crypto") as {
    createHash(algorithm: string): HashLike;
    createHmac(algorithm: string, key: string): HashLike;
    randomBytes(size: number, callback?: (err: Error | null, buf: unknown) => void): { length: number } | undefined;
    randomUUID(): string;
    randomInt(min: number, max?: number, callback?: (err: Error | null, n: number) => void): number | undefined;
    getHashes(): string[];
  };
};

describe("vendored 'crypto' (pure-JS hash/hmac/random subset)", () => {
  it("matches known md5 test vectors", () => {
    const crypto = requireCrypto();
    expect(crypto.createHash("md5").update("").digest("hex")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(crypto.createHash("md5").update("abc").digest("hex")).toBe("900150983cd24fb0d6963f7d28e17f72");
  });

  it("matches known sha1 test vectors", () => {
    const crypto = requireCrypto();
    expect(crypto.createHash("sha1").update("").digest("hex")).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(crypto.createHash("sha1").update("abc").digest("hex")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });

  it("matches known sha256 test vectors", () => {
    const crypto = requireCrypto();
    expect(crypto.createHash("sha256").update("").digest("hex")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(crypto.createHash("sha256").update("abc").digest("hex")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("accumulates multiple update() calls before digesting", () => {
    const crypto = requireCrypto();
    const incremental = crypto.createHash("sha256").update("ab").update("c").digest("hex");
    const oneShot = crypto.createHash("sha256").update("abc").digest("hex");
    expect(incremental).toBe(oneShot);
  });

  it("returns a Buffer when no digest encoding is given", () => {
    const crypto = requireCrypto();
    const digest = crypto.createHash("sha256").update("abc").digest(undefined as unknown as string) as unknown as {
      length: number;
    };
    expect(digest.length).toBe(32);
  });

  it("throws a clear error for an unsupported digest", () => {
    const crypto = requireCrypto();
    expect(() => crypto.createHash("sha512")).toThrow(/sha512.*not supported/);
  });

  it("getHashes() reports exactly the digests createHash() actually supports - no more, no less", () => {
    const crypto = requireCrypto();
    const hashes = crypto.getHashes();

    expect(hashes.sort()).toEqual(["md5", "sha1", "sha256"]);
    for (const algorithm of hashes) {
      expect(() => crypto.createHash(algorithm)).not.toThrow();
    }
  });

  it("matches a known HMAC-SHA256 test vector (RFC 4231 test case 1)", () => {
    const crypto = requireCrypto();
    const key = String.fromCharCode(0x0b).repeat(20); // "binary"-encoded 0x0b x 20
    const hmac = crypto.createHmac("sha256", key).update("Hi There").digest("hex");
    expect(hmac).toBe("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  });

  it("produces different output for different keys", () => {
    const crypto = requireCrypto();
    const a = crypto.createHmac("sha256", "key-a").update("message").digest("hex");
    const b = crypto.createHmac("sha256", "key-b").update("message").digest("hex");
    expect(a).not.toBe(b);
  });

  it("randomBytes returns the requested number of bytes and randomUUID a v4-shaped string", () => {
    const crypto = requireCrypto();
    const bytes = crypto.randomBytes(16) as unknown as { length: number };
    expect(bytes.length).toBe(16);
    expect(crypto.randomUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("randomBytes supports the callback style", async () => {
    const crypto = requireCrypto();
    const result = await new Promise<{ length: number }>((resolve, reject) => {
      crypto.randomBytes(8, (err, buf) => (err ? reject(err) : resolve(buf as { length: number })));
    });
    expect(result.length).toBe(8);
  });

  it("randomInt stays within [min, max)", () => {
    const crypto = requireCrypto();
    for (let i = 0; i < 50; i++) {
      const n = crypto.randomInt(10, 20) as number;
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThan(20);
    }
  });
});
