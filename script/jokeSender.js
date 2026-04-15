import cron from "node-cron";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import { getTelegramBot } from "./telegramBotInstance.js";
import { BaseSender } from "./baseSender.js";

const RSS_URL = "https://anekdot.ru/rss/export_o.xml";
const xmlParser = new XMLParser({ ignoreAttributes: false });

class JokeSender extends BaseSender {
  constructor(filePath) {
    super(filePath);
  }

  async #fetchStoryFromRss() {
    const { data } = await axios.get(RSS_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TLGBot/1.0)" },
      timeout: 10_000,
    });
    const parsed = xmlParser.parse(data);
    const items = parsed?.rss?.channel?.item;
    const first = Array.isArray(items) ? items[0] : items;
    if (!first) throw new Error("RSS не содержит элементов");

    const description = String(first.description ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();

    return { description };
  }

  async sendJokeToAllUsers() {
    let story;
    try {
      story = await this.#fetchStoryFromRss();
    } catch (error) {
      console.error("Ошибка загрузки RSS anekdot.ru:", error.message);
      return;
    }

    const { description } = story;
    const sendMessage = description;

    const bot = getTelegramBot();
    for (const userId of this.userIds) {
      try {
        await bot.telegram.sendMessage(userId, sendMessage);
        console.log(`История отправлена пользователю ${userId}`);
      } catch (error) {
        console.error(
          `Ошибка отправки истории пользователю ${userId}:`,
          error.message,
        );
      }
    }
  }

  startDailyJob() {
    console.log("Start joke sender at ", new Date());

    cron.schedule(
      "5 8 * * *",
      async () => {
        console.log("Запуск ежедневной отправки анекдотов в 8 утра...");
        await this.loadUserIds();
        await this.sendJokeToAllUsers();
      },
      {
        timezone: "America/Los_Angeles",
      },
    );
  }
}

export default JokeSender;
