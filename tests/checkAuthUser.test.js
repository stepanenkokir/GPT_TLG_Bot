import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";

const authFilePath = path.resolve(process.cwd(), "authorizedUsers.txt");
let originalAuthFile = null;

beforeEach(async () => {
  try {
    originalAuthFile = await fs.readFile(authFilePath, "utf-8");
  } catch {
    originalAuthFile = null;
  }
});

afterEach(async () => {
  if (originalAuthFile === null) {
    await fs.unlink(authFilePath).catch(() => {});
  } else {
    await fs.writeFile(authFilePath, originalAuthFile, "utf-8");
  }
});

describe("checkAuthUser middleware", () => {
  it("isUserAuthorized refreshes stale cache and returns true for known user", async () => {
    await fs.writeFile(authFilePath, JSON.stringify([12345]), "utf-8");

    const modulePath = `../middleware/checkAuthUser.js?ts=${Date.now()}`;
    const { isUserAuthorized } = await import(modulePath);
    const allowed = await isUserAuthorized(12345);
    const denied = await isUserAuthorized(11111);

    expect(allowed).toBe(true);
    expect(denied).toBe(false);
  });
});
