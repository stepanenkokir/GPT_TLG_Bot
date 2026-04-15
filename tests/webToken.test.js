import { describe, it, expect, vi } from "vitest";
import { signWebToken, verifyWebToken } from "../utils/webToken.js";

const SECRET = "test-secret-key";

describe("signWebToken / verifyWebToken", () => {
  it("creates a verifiable token", () => {
    const token = signWebToken({ userId: 42 }, SECRET);
    const payload = verifyWebToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload.userId).toBe(42);
  });

  it("token contains exp field", () => {
    const token = signWebToken({ a: 1 }, SECRET, 60);
    const payload = verifyWebToken(token, SECRET);
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("returns null for wrong secret", () => {
    const token = signWebToken({ userId: 1 }, SECRET);
    const result = verifyWebToken(token, "wrong-secret");
    expect(result).toBeNull();
  });

  it("returns null for tampered token body", () => {
    const token = signWebToken({ userId: 1 }, SECRET);
    const [, sig] = token.split(".");
    const tampered = `${Buffer.from(JSON.stringify({ userId: 999, exp: 9999999999 })).toString("base64url")}.${sig}`;
    expect(verifyWebToken(tampered, SECRET)).toBeNull();
  });

  it("returns null for expired token", () => {
    const token = signWebToken({ userId: 1 }, SECRET, -1);
    expect(verifyWebToken(token, SECRET)).toBeNull();
  });

  it("returns null for null/undefined token", () => {
    expect(verifyWebToken(null, SECRET)).toBeNull();
    expect(verifyWebToken(undefined, SECRET)).toBeNull();
  });

  it("returns null for malformed token (no dot separator)", () => {
    expect(verifyWebToken("nodothere", SECRET)).toBeNull();
  });

  it("returns null for empty token string", () => {
    expect(verifyWebToken("", SECRET)).toBeNull();
  });

  it("uses default TTL of 60 seconds when not specified", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signWebToken({ x: 1 }, SECRET);
    const payload = verifyWebToken(token, SECRET);
    expect(payload.exp).toBeGreaterThanOrEqual(before + 59);
    expect(payload.exp).toBeLessThanOrEqual(before + 61);
  });

  it("respects custom TTL", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signWebToken({ x: 1 }, SECRET, 3600);
    const payload = verifyWebToken(token, SECRET);
    expect(payload.exp).toBeGreaterThanOrEqual(before + 3599);
  });
});
