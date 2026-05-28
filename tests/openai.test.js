import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleOpenAiRequest,
  handleOpenAiRequestWithWebSearch,
} from "../script/openai.js";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("openai validation contract", () => {
  it("returns structured validation error for chat request", async () => {
    const result = await handleOpenAiRequest("invalid_messages");
    expect(result.text).toBe("");
    expect(typeof result.error).toBe("string");
    expect(typeof result.userMessage).toBe("string");
    expect(result.userMessage.length).toBeGreaterThan(0);
  });

  it("returns structured validation error for web search request", async () => {
    const result = await handleOpenAiRequestWithWebSearch(null);
    expect(result.text).toBe("");
    expect(typeof result.error).toBe("string");
    expect(typeof result.userMessage).toBe("string");
    expect(result.userMessage.length).toBeGreaterThan(0);
  });
});
