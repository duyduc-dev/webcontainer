import { describe, expect, it } from "vitest";
import { matchesWatch, watchFilename } from "./watchMatch";

describe("matchesWatch", () => {
  it("matches watching a single file directly", () => {
    expect(matchesWatch({ path: "/src/a.txt", recursive: false }, "/src/a.txt")).toBe(true);
    expect(matchesWatch({ path: "/src/a.txt", recursive: false }, "/src/b.txt")).toBe(false);
  });

  it("non-recursive directory watch matches only direct children", () => {
    const watch = { path: "/src", recursive: false };
    expect(matchesWatch(watch, "/src/a.txt")).toBe(true);
    expect(matchesWatch(watch, "/src/nested/a.txt")).toBe(false);
    expect(matchesWatch(watch, "/other/a.txt")).toBe(false);
  });

  it("recursive directory watch matches any depth underneath it", () => {
    const watch = { path: "/src", recursive: true };
    expect(matchesWatch(watch, "/src/a.txt")).toBe(true);
    expect(matchesWatch(watch, "/src/nested/deep/a.txt")).toBe(true);
    expect(matchesWatch(watch, "/src")).toBe(true);
    expect(matchesWatch(watch, "/srcOther/a.txt")).toBe(false);
  });

  it("recursive watch on the root matches everything", () => {
    const watch = { path: "/", recursive: true };
    expect(matchesWatch(watch, "/a.txt")).toBe(true);
    expect(matchesWatch(watch, "/deep/nested/a.txt")).toBe(true);
  });
});

describe("watchFilename", () => {
  it("returns the basename when watching a file directly", () => {
    expect(watchFilename("/src/a.txt", "/src/a.txt")).toBe("a.txt");
  });

  it("returns the path relative to the watched directory", () => {
    expect(watchFilename("/src", "/src/a.txt")).toBe("a.txt");
    expect(watchFilename("/src", "/src/nested/a.txt")).toBe("nested/a.txt");
  });

  it("handles the root directory without a doubled leading slash", () => {
    expect(watchFilename("/", "/a.txt")).toBe("a.txt");
  });
});
