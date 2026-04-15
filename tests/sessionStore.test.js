import { describe, it, expect, beforeEach } from "vitest";
import { MemorySessionStore, getSessionStore, resetSessionStore } from "../middleware/sessionStore.js";

describe("MemorySessionStore", () => {
  let store;

  beforeEach(() => {
    store = new MemorySessionStore();
  });

  it("returns null for unknown key", async () => {
    expect(await store.get("missing")).toBeNull();
  });

  it("stores and retrieves a value", async () => {
    await store.set("user:1", { name: "Alice" });
    expect(await store.get("user:1")).toEqual({ name: "Alice" });
  });

  it("overwrites an existing value", async () => {
    await store.set("key", "first");
    await store.set("key", "second");
    expect(await store.get("key")).toBe("second");
  });

  it("deletes a key", async () => {
    await store.set("key", "value");
    await store.delete("key");
    expect(await store.get("key")).toBeNull();
  });

  it("clears all entries", async () => {
    await store.set("a", 1);
    await store.set("b", 2);
    await store.clear();
    expect(await store.get("a")).toBeNull();
    expect(await store.get("b")).toBeNull();
  });

  it("returns all keys", async () => {
    await store.set("x", 1);
    await store.set("y", 2);
    const keys = await store.keys();
    expect(keys).toContain("x");
    expect(keys).toContain("y");
    expect(keys).toHaveLength(2);
  });

  it("returns empty keys array after clear", async () => {
    await store.set("k", 1);
    await store.clear();
    expect(await store.keys()).toHaveLength(0);
  });
});

describe("getSessionStore", () => {
  beforeEach(() => {
    resetSessionStore();
  });

  it("returns a store instance", () => {
    const store = getSessionStore();
    expect(store).toBeInstanceOf(MemorySessionStore);
  });

  it("returns the same instance on repeated calls (singleton)", () => {
    const a = getSessionStore();
    const b = getSessionStore();
    expect(a).toBe(b);
  });

  it("returns a fresh instance after reset", () => {
    const a = getSessionStore();
    resetSessionStore();
    const b = getSessionStore();
    expect(a).not.toBe(b);
  });
});
