// Naive split on `&&` — does not respect quoting, so a literal `&&` inside a
// quoted argument would incorrectly split. Acceptable limitation for now;
// revisit if real usage hits it.
export function splitChain(line: string): string[] {
  return line
    .split("&&")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}
