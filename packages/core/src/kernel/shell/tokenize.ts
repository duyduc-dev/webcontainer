export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let hasToken = false;

  for (const char of line) {
    if (inSingle) {
      if (char === "'") inSingle = false;
      else current += char;
      continue;
    }

    if (inDouble) {
      if (char === '"') inDouble = false;
      else current += char;
      continue;
    }

    if (char === "'") {
      inSingle = true;
      hasToken = true;
      continue;
    }

    if (char === '"') {
      inDouble = true;
      hasToken = true;
      continue;
    }

    if (char === " " || char === "\t") {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }

    current += char;
    hasToken = true;
  }

  if (inSingle || inDouble) {
    throw new Error("unterminated quote in command line");
  }

  if (hasToken) {
    tokens.push(current);
  }

  return tokens;
}
