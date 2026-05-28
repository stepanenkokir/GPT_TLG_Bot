import { describe, it, expect, vi } from "vitest";
import { setupBotCommands } from "../script/telegramBot.js";
import * as menu from "../script/tlgBotMenu.js";

const createMockBot = () => ({
  start: vi.fn(),
  hears: vi.fn(),
  action: vi.fn(),
  on: vi.fn(),
});

describe("setupBotCommands", () => {
  it("registers core menu handlers and message listeners", () => {
    const bot = createMockBot();
    setupBotCommands(bot);

    expect(bot.start).toHaveBeenCalledTimes(1);
    expect(bot.hears).toHaveBeenCalledWith(menu.menuNewSession, expect.any(Function));
    expect(bot.hears).toHaveBeenCalledWith(menu.menuRole, expect.any(Function));
    expect(bot.hears).toHaveBeenCalledWith(menu.menuBack, expect.any(Function));
    expect(bot.hears).toHaveBeenCalledWith(menu.menuImage, expect.any(Function));
    expect(bot.on).toHaveBeenCalledWith("text", expect.any(Function));
    expect(bot.on).toHaveBeenCalledWith("message", expect.any(Function));
  });
});
