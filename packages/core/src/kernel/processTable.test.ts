import { describe, expect, it } from "vitest";
import { createProcessTable } from "./processTable";

describe("processTable", () => {
  it("registers a process with a generated id and running status", () => {
    const table = createProcessTable();
    const entry = table.register();

    expect(entry.status).toBe("running");
    expect(typeof entry.id).toBe("string");
    expect(entry.id.length).toBeGreaterThan(0);
  });

  it("assigns each registration a unique id", () => {
    const table = createProcessTable();
    const a = table.register();
    const b = table.register();
    expect(a.id).not.toBe(b.id);
  });

  it("looks up a registered process by id", () => {
    const table = createProcessTable();
    const entry = table.register();
    expect(table.get(entry.id)).toEqual(entry);
  });

  it("returns undefined for an unknown id", () => {
    const table = createProcessTable();
    expect(table.get("missing")).toBeUndefined();
  });

  it("removes a process", () => {
    const table = createProcessTable();
    const entry = table.register();

    expect(table.remove(entry.id)).toBe(true);
    expect(table.get(entry.id)).toBeUndefined();
  });

  it("returns false when removing an id that was already removed", () => {
    const table = createProcessTable();
    const entry = table.register();
    table.remove(entry.id);
    expect(table.remove(entry.id)).toBe(false);
  });

  it("lists all registered processes", () => {
    const table = createProcessTable();
    const a = table.register();
    const b = table.register();

    expect(table.list().map((entry) => entry.id).sort()).toEqual([a.id, b.id].sort());
  });
});
