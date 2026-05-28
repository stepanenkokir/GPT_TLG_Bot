import { Telegraf } from "telegraf";
import { getConfigValue } from "../config/loader.js";

let botInstance = null;

/**
 * Get singleton instance of Telegram bot
 * @returns {Telegraf} Telegraf bot instance
 */
export function getTelegramBot() {
  if (!botInstance) {
    const botToken = getConfigValue("telegramBot.token", "TELEGRAM_BOT_TOKEN");
    botInstance = new Telegraf(botToken);
  }
  return botInstance;
}
