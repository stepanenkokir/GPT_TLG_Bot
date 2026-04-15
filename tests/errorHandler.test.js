import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getUserErrorMessage,
  handleError,
  withErrorHandling,
} from "../utils/errorHandler.js";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getUserErrorMessage", () => {
  it("returns custom message when provided", () => {
    const msg = getUserErrorMessage(new Error("any"), "Custom error");
    expect(msg).toBe("Custom error");
  });

  it("detects rate limit error by status 429", () => {
    const err = Object.assign(new Error("too many"), { status: 429 });
    const msg = getUserErrorMessage(err);
    expect(msg).toMatch(/запросов/i);
  });

  it("detects rate limit error by message keyword", () => {
    const err = new Error("rate limit exceeded");
    expect(getUserErrorMessage(err)).toMatch(/запросов/i);
  });

  it("detects network error", () => {
    const err = new Error("econnrefused");
    expect(getUserErrorMessage(err)).toMatch(/сет/i);
  });

  it("detects timeout error by status 408", () => {
    const err = Object.assign(new Error("timeout"), { status: 408 });
    expect(getUserErrorMessage(err)).toMatch(/время/i);
  });

  it("detects network error for etimedout without status", () => {
    // etimedout without status 408 or the word 'timeout' is classified as NETWORK_ERROR
    const err = new Error("etimedout");
    expect(getUserErrorMessage(err)).toMatch(/сет/i);
  });

  it("detects timeout error by 'timeout' keyword in message", () => {
    const err = new Error("request timeout exceeded");
    expect(getUserErrorMessage(err)).toMatch(/время/i);
  });

  it("detects auth error for status 401", () => {
    const err = Object.assign(new Error("unauthorized"), { status: 401 });
    expect(getUserErrorMessage(err)).toMatch(/авторизац/i);
  });

  it("detects auth error for status 403", () => {
    const err = Object.assign(new Error("forbidden"), { status: 403 });
    expect(getUserErrorMessage(err)).toMatch(/авторизац/i);
  });

  it("detects API error for 4xx status", () => {
    const err = Object.assign(new Error("bad request"), { status: 400 });
    expect(getUserErrorMessage(err)).toMatch(/API/i);
  });

  it("detects API error for 5xx status", () => {
    const err = Object.assign(new Error("server error"), { status: 500 });
    expect(getUserErrorMessage(err)).toMatch(/API/i);
  });

  it("returns unknown error for unrecognized errors", () => {
    const err = new Error("something random");
    expect(getUserErrorMessage(err)).toMatch(/ошибка/i);
  });

  it("returns unknown error for null", () => {
    expect(getUserErrorMessage(null)).toMatch(/ошибка/i);
  });
});

describe("handleError", () => {
  it("returns object with message and logged: true", () => {
    const result = handleError(new Error("oops"), { operation: "test" });
    expect(result.logged).toBe(true);
    expect(typeof result.message).toBe("string");
  });

  it("uses custom message when provided", () => {
    const result = handleError(new Error("e"), { customMessage: "My custom msg" });
    expect(result.message).toBe("My custom msg");
  });
});

describe("withErrorHandling", () => {
  it("returns result of successful function", async () => {
    const fn = async (x) => x * 2;
    const wrapped = withErrorHandling(fn);
    expect(await wrapped(5)).toBe(10);
  });

  it("throws user-friendly error on failure", async () => {
    const err = Object.assign(new Error("timeout"), { status: 408 });
    const fn = async () => { throw err; };
    const wrapped = withErrorHandling(fn);
    await expect(wrapped()).rejects.toThrow(/время/i);
  });

  it("rethrows as new Error with user-friendly message", async () => {
    const fn = async () => { throw new Error("rate limit exceeded"); };
    const wrapped = withErrorHandling(fn);
    await expect(wrapped()).rejects.toBeInstanceOf(Error);
  });
});
