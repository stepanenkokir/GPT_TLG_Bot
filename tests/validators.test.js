import { describe, it, expect } from "vitest";
import {
  validateMessages,
  validateRole,
  validateTextMessage,
} from "../middleware/validators.js";

describe("validateMessages", () => {
  it("returns valid for a correct message array", () => {
    const result = validateMessages([
      { role: "user", content: "Hello" },
    ]);
    expect(result.valid).toBe(true);
  });

  it("returns invalid when input is not an array", () => {
    const result = validateMessages("not an array");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/array/i);
  });

  it("returns invalid for empty array", () => {
    const result = validateMessages([]);
    expect(result.valid).toBe(false);
  });

  it("returns invalid for unsupported role", () => {
    const result = validateMessages([{ role: "admin", content: "Hi" }]);
    expect(result.valid).toBe(false);
  });

  it("returns invalid when content is missing", () => {
    const result = validateMessages([{ role: "user" }]);
    expect(result.valid).toBe(false);
  });

  it("accepts assistant and system roles", () => {
    expect(validateMessages([{ role: "assistant", content: "Hi" }]).valid).toBe(true);
    expect(validateMessages([{ role: "system", content: "Context" }]).valid).toBe(true);
  });

  it("accepts multimodal array content", () => {
    const result = validateMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "describe this" },
          { type: "image_url", image_url: { url: "https://example.com/img.png" } },
        ],
      },
    ]);
    expect(result.valid).toBe(true);
  });

  it("returns invalid for empty string content", () => {
    const result = validateMessages([{ role: "user", content: "" }]);
    expect(result.valid).toBe(false);
  });

  it("returns invalid when array exceeds 100 messages", () => {
    const messages = Array.from({ length: 101 }, () => ({
      role: "user",
      content: "msg",
    }));
    const result = validateMessages(messages);
    expect(result.valid).toBe(false);
  });
});

describe("validateRole", () => {
  it("accepts valid role and voice combinations", () => {
    const validCombos = [
      { role: "default", voice: "echo" },
      { role: "doctor", voice: "ash" },
      { role: "teacher", voice: "sage" },
      { role: "hooligan", voice: "nova" },
    ];
    for (const data of validCombos) {
      expect(validateRole(data).valid).toBe(true);
    }
  });

  it("rejects unknown role", () => {
    const result = validateRole({ role: "alien", voice: "echo" });
    expect(result.valid).toBe(false);
  });

  it("rejects unknown voice", () => {
    const result = validateRole({ role: "default", voice: "robotvoice" });
    expect(result.valid).toBe(false);
  });

  it("rejects missing role", () => {
    const result = validateRole({ voice: "echo" });
    expect(result.valid).toBe(false);
  });

  it("rejects missing voice", () => {
    const result = validateRole({ role: "default" });
    expect(result.valid).toBe(false);
  });
});

describe("validateTextMessage", () => {
  it("accepts valid text message", () => {
    expect(validateTextMessage({ text: "Hello!" }).valid).toBe(true);
  });

  it("rejects empty text", () => {
    expect(validateTextMessage({ text: "" }).valid).toBe(false);
  });

  it("rejects missing text field", () => {
    expect(validateTextMessage({}).valid).toBe(false);
  });

  it("rejects text exceeding 10000 characters", () => {
    const result = validateTextMessage({ text: "a".repeat(10001) });
    expect(result.valid).toBe(false);
  });

  it("accepts text at max length boundary", () => {
    const result = validateTextMessage({ text: "a".repeat(10000) });
    expect(result.valid).toBe(true);
  });

  it("returns error string when invalid", () => {
    const result = validateTextMessage({ text: "" });
    expect(result.valid).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });
});
