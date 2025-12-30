import { session } from "telegraf";
import { createOpenAiInstance } from "./script/openai.js";
import { setupBotCommands } from "./script/telegramBot.js";
import { checkAuthUserImproved } from "./middleware/checkAuthUser.js";
import { botRateLimitMiddleware } from "./middleware/rateLimiter.js";
import { getTelegramBot } from "./script/telegramBotInstance.js";
import { createLogger, format, transports } from "winston";
import fs from "fs/promises";

const { combine, timestamp, printf } = format;

const ensureLogDir = async () => {
  try {
    await fs.mkdir("log", { recursive: true });
  } catch (_) {}
};

export function launchTelegramBot() {
  // Initialize OpenAI once for bot features
  createOpenAiInstance();

  const bot = getTelegramBot();

  const logFormat = printf(({ level, message, timestamp }) => {
    return `[${timestamp}] ${level}: ${message}`;
  });

  // Cache loggers by chatId to avoid recreating them for each message
  const loggerCache = new Map();

  const saveLog = async (ctx, next) => {
    if (ctx && ctx.message && ctx.message.text) {
      const chatId = ctx.chat.id;

      // Get or create logger for this chat
      if (!loggerCache.has(chatId)) {
        loggerCache.set(
          chatId,
          createLogger({
            format: combine(timestamp(), logFormat),
            transports: [
              new transports.Console(),
              new transports.File({ filename: `log/${chatId}.log` }),
            ],
          })
        );
      }

      const userLogger = loggerCache.get(chatId);
      userLogger.info(`message: ${ctx.message.text}`);
    }
    await next();
  };

  // Session middleware
  // Note: To use custom session store (e.g., Redis), you can create an adapter:
  // import { getSessionStore } from "./middleware/sessionStore.js";
  // const store = getSessionStore();
  // bot.use(session({ store: createTelegrafStoreAdapter(store) }));
  bot.use(session());
  bot.use(botRateLimitMiddleware);
  bot.use(checkAuthUserImproved, saveLog);

  setupBotCommands(bot);

  ensureLogDir();
  bot.launch().then(() => console.log("Бот запущен"));

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  return bot;
}
