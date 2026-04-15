import { describe, it, expect } from "vitest";
import {
  escapeTelegramHtml,
  splitTextIntoChunks,
  TELEGRAM_MAX_MESSAGE_LENGTH,
} from "../script/telegramUtils.js";

describe("escapeTelegramHtml", () => {
  it("escapes ampersand", () => {
    expect(escapeTelegramHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes less-than and greater-than", () => {
    expect(escapeTelegramHtml("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("escapes all special chars together", () => {
    expect(escapeTelegramHtml("<a href='x'>a & b</a>")).toBe(
      "&lt;a href='x'&gt;a &amp; b&lt;/a&gt;"
    );
  });

  it("returns empty string for null", () => {
    expect(escapeTelegramHtml(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(escapeTelegramHtml(undefined)).toBe("");
  });

  it("coerces non-string input", () => {
    expect(escapeTelegramHtml(42)).toBe("42");
  });

  it("does not alter safe text", () => {
    expect(escapeTelegramHtml("hello world")).toBe("hello world");
  });
});

describe("splitTextIntoChunks", () => {
  it("returns single chunk for short text", () => {
    const text = "Hello, world!";
    expect(splitTextIntoChunks(text)).toEqual([text]);
  });

  it("returns single chunk when text equals limit", () => {
    const text = "a".repeat(TELEGRAM_MAX_MESSAGE_LENGTH);
    const chunks = splitTextIntoChunks(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("splits text exceeding limit into multiple chunks", () => {
    const text = "a".repeat(TELEGRAM_MAX_MESSAGE_LENGTH + 1);
    const chunks = splitTextIntoChunks(text, TELEGRAM_MAX_MESSAGE_LENGTH);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_LENGTH);
    }
  });

  it("preserves all content after splitting", () => {
    const text = "a".repeat(TELEGRAM_MAX_MESSAGE_LENGTH * 2 + 500);
    const chunks = splitTextIntoChunks(text, TELEGRAM_MAX_MESSAGE_LENGTH);
    expect(chunks.join("")).toBe(text);
  });

  it("splits by paragraphs when possible", () => {
    const para1 = "First paragraph content.";
    const para2 = "Second paragraph content.";
    const text = `${para1}\n\n${para2}`;
    const chunks = splitTextIntoChunks(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n\n")).toBe(text);
  });

  it("handles custom limit", () => {
    const text = "Hello World";
    const chunks = splitTextIntoChunks(text, 5);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(5);
    }
  });

  it("converts non-string input", () => {
    const chunks = splitTextIntoChunks(12345, 10);
    expect(chunks).toEqual(["12345"]);
  });

  it("handles empty string", () => {
    const chunks = splitTextIntoChunks("", 10);
    expect(chunks).toEqual([""]);
  });

  it("handles null input", () => {
    const chunks = splitTextIntoChunks(null, 10);
    expect(chunks).toEqual([""]);
  });
});
