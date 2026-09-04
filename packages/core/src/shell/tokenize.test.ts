import { describe, expect, it } from "vitest";
import { parseCommands, tokenize } from "./tokenize";

describe("tokenize", () => {
  it("splits bare words on whitespace", () => {
    expect(tokenize("mkdir -p /x")).toEqual([
      { type: "word", value: "mkdir" },
      { type: "word", value: "-p" },
      { type: "word", value: "/x" },
    ]);
  });

  it("recognizes && as a chaining token", () => {
    expect(tokenize("a && b")).toEqual([
      { type: "word", value: "a" },
      { type: "and" },
      { type: "word", value: "b" },
    ]);
  });

  it("recognizes > as a redirect token", () => {
    expect(tokenize("echo hi > /f")).toEqual([
      { type: "word", value: "echo" },
      { type: "word", value: "hi" },
      { type: "redirect-out" },
      { type: "word", value: "/f" },
    ]);
  });

  it("keeps a quoted word with spaces as one token", () => {
    expect(tokenize('echo "hello world"')).toEqual([
      { type: "word", value: "echo" },
      { type: "word", value: "hello world" },
    ]);
  });
});

describe("parseCommands", () => {
  it("splits && into separate commands", () => {
    const commands = parseCommands(tokenize("pwd && ls"));
    expect(commands).toEqual([{ argv: ["pwd"] }, { argv: ["ls"] }]);
  });

  it("attaches a redirect target to its command", () => {
    const commands = parseCommands(tokenize("echo hi > /x/f"));
    expect(commands).toEqual([{ argv: ["echo", "hi"], redirectOut: "/x/f" }]);
  });

  it("drops empty commands from doubled && or trailing input", () => {
    const commands = parseCommands(tokenize("pwd && && ls"));
    expect(commands).toEqual([{ argv: ["pwd"] }, { argv: ["ls"] }]);
  });
});
