import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BaseSender } from "../script/baseSender.js";

vi.mock("fs/promises");

import fs from "fs/promises";

describe("BaseSender", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with empty userIds and given filePath", () => {
    const sender = new BaseSender("test.txt");
    expect(sender.filePath).toBe("test.txt");
    expect(sender.userIds).toEqual([]);
  });

  it("loads user IDs from file", async () => {
    fs.readFile.mockResolvedValue(JSON.stringify([1, 2, 3]));
    const sender = new BaseSender("users.json");
    await sender.loadUserIds();
    expect(sender.userIds).toEqual([1, 2, 3]);
  });

  it("resets to empty array when file contains non-array JSON", async () => {
    fs.readFile.mockResolvedValue(JSON.stringify({ notAnArray: true }));
    const sender = new BaseSender("users.json");
    await sender.loadUserIds();
    expect(sender.userIds).toEqual([]);
  });

  it("creates empty file and resets userIds when file not found (ENOENT)", async () => {
    const enoentError = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    fs.readFile.mockRejectedValue(enoentError);
    fs.writeFile.mockResolvedValue(undefined);

    const sender = new BaseSender("missing.json");
    await sender.loadUserIds();

    expect(sender.userIds).toEqual([]);
    expect(fs.writeFile).toHaveBeenCalledWith("missing.json", "[]", "utf-8");
  });

  it("resets to empty array on non-ENOENT read error", async () => {
    fs.readFile.mockRejectedValue(new Error("disk failure"));
    const sender = new BaseSender("broken.json");
    await sender.loadUserIds();
    expect(sender.userIds).toEqual([]);
  });
});
