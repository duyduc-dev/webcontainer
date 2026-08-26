export type TarEntryType = "file" | "dir";

export type TarEntry = {
  name: string;
  type: TarEntryType;
  size: number;
  content: Uint8Array;
};

const BLOCK_SIZE = 512;

function readString(block: Uint8Array, offset: number, length: number): string {
  const bytes = block.subarray(offset, offset + length);
  const end = bytes.indexOf(0);
  const trimmed = end === -1 ? bytes : bytes.subarray(0, end);
  return new TextDecoder().decode(trimmed);
}

function readOctal(block: Uint8Array, offset: number, length: number): number {
  const str = readString(block, offset, length).trim();
  return str === "" ? 0 : parseInt(str, 8);
}

function isZeroBlock(block: Uint8Array): boolean {
  return block.every((byte) => byte === 0);
}

export function* readTarEntries(buffer: Uint8Array): Generator<TarEntry> {
  let offset = 0;

  while (offset + BLOCK_SIZE <= buffer.length) {
    const header = buffer.subarray(offset, offset + BLOCK_SIZE);
    if (isZeroBlock(header)) break;

    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const size = readOctal(header, 124, 12);
    const typeflag = String.fromCharCode(header[156]);

    offset += BLOCK_SIZE;
    const content = buffer.subarray(offset, offset + size);
    offset += Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;

    const fullName = prefix ? `${prefix}/${name}` : name;
    if (typeflag === "5") {
      yield { name: fullName, type: "dir", size: 0, content: new Uint8Array() };
    } else if (typeflag === "0" || typeflag === "\0") {
      yield { name: fullName, type: "file", size, content };
    }
  }
}
