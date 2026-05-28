import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";

let server;
let baseUrl;

beforeAll(async () => {
  process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "123:abc";
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-test";
  process.env.WEBAPP_TEST_MODE = "true";

  const { registerApiRoutes } = await import("../routes/api.js");
  const app = express();
  registerApiRoutes(app);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
});

describe("api routes", () => {
  it("returns health payload", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });

  it("serves index in test mode", async () => {
    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text.toLowerCase()).toContain("<html");
  });
});
