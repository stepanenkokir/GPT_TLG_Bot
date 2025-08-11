import { Telegraf, session } from "telegraf";
import config from "config";
import { createOpenAiInstance } from "./script/openai.js";
import { setupBotCommands } from "./script/telegramBot.js";
import { checkAuthUserImproved } from "./middleware/checkAuthUser.js";
import { createLogger, format, transports } from "winston";
import fs from "fs/promises";

const botToken = config.get("telegramBot.token");

const { combine, timestamp, printf } = format;

const ensureLogDir = async () => {
  try {
    await fs.mkdir("log", { recursive: true });
  } catch (_) {}
};

export function launchTelegramBot() {
  // Initialize OpenAI once for bot features
  createOpenAiInstance();

  const bot = new Telegraf(botToken);

  const logFormat = printf(({ level, message, timestamp }) => {
    return `[${timestamp}] ${level}: ${message}`;
  });

  const saveLog = async (ctx, next) => {
    if (ctx && ctx.message && ctx.message.text) {
      const userLogger = createLogger({
        format: combine(timestamp(), logFormat),
        transports: [
          new transports.Console(),
          new transports.File({ filename: `log/${ctx.chat.id}.log` }),
        ],
      });
      userLogger.info(`message: ${ctx.message.text}`);
    }
    await next();
  };

  bot.use(session());
  bot.use(checkAuthUserImproved, saveLog);

  setupBotCommands(bot);

  ensureLogDir();
  bot.launch().then(() => console.log("Бот запущен"));

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  return bot;
}
