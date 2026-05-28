import { afterEach, describe, expect, it } from "vitest";
import { getRealtimeModel } from "../config/realtimeAgent.js";

const originalRealtimeModel = process.env.OPENAI_REALTIME_MODEL;

afterEach(() => {
  if (originalRealtimeModel === undefined) {
    delete process.env.OPENAI_REALTIME_MODEL;
  } else {
    process.env.OPENAI_REALTIME_MODEL = originalRealtimeModel;
  }
});

describe("getRealtimeModel", () => {
  it("falls back from legacy preview realtime models", () => {
    process.env.OPENAI_REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";

    expect(getRealtimeModel()).toBe("gpt-realtime-2");
  });

  it("keeps explicitly configured non-legacy models", () => {
    process.env.OPENAI_REALTIME_MODEL = "gpt-realtime-mini";

    expect(getRealtimeModel()).toBe("gpt-realtime-mini");
  });
});
