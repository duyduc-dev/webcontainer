type Token = { type: "word"; value: string } | { type: "and" } | { type: "redirect-out" };

const isAnd = (line: string, index: number): boolean => line[index] === "&" && line[index + 1] === "&";

/** Tokenizes a shell line: bare/quoted words, `&&` chaining, and `>` output redirection. */
const tokenize = (line: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }

    if (isAnd(line, i)) {
      tokens.push({ type: "and" });
      i += 2;
      continue;
    }

    if (ch === ">") {
      tokens.push({ type: "redirect-out" });
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let value = "";
      i++;
      while (i < line.length && line[i] !== quote) {
        value += line[i];
        i++;
      }
      i++; // skip the closing quote
      tokens.push({ type: "word", value });
      continue;
    }

    let value = "";
    while (i < line.length && line[i] !== " " && line[i] !== "\t" && line[i] !== ">" && !isAnd(line, i)) {
      value += line[i];
      i++;
    }
    tokens.push({ type: "word", value });
  }

  return tokens;
};

interface Command {
  argv: string[];
  redirectOut?: string;
}

/** Groups tokens into `&&`-chained commands, each with an optional `>` redirect target. */
const parseCommands = (tokens: Token[]): Command[] => {
  const commands: Command[] = [];
  let current: Command = { argv: [] };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === "and") {
      commands.push(current);
      current = { argv: [] };
      continue;
    }

    if (token.type === "redirect-out") {
      const next = tokens[i + 1];
      if (next?.type === "word") {
        current.redirectOut = next.value;
        i++;
      }
      continue;
    }

    current.argv.push(token.value);
  }
  commands.push(current);

  return commands.filter((command) => command.argv.length > 0);
};

export { parseCommands, tokenize };
export type { Command, Token };
