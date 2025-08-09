// Файл: index.js
import { Telegraf, session } from "telegraf";
import config from "config";
import { createOpenAiInstance } from "./script/openai.js";
import { setupBotCommands } from "./script/telegramBot.js";
import { checkAuthUserImproved } from "./middleware/checkAuthUser.js";
import { createLogger, format, transports } from "winston";
import JokeSender from "./script/jokeSender.js";
import fs from "fs/promises";
import express from "express";
import cors from "cors";
import axios from "axios";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

// Настройки конфигурации из config/default.json
const botToken = config.get("telegramBot.token");
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { combine, timestamp, printf } = format;

// Инфраструктура
const ensureLogDir = async () => {
  try {
    await fs.mkdir("log", { recursive: true });
  } catch (_) {}
};

// Инициализация OpenAI
createOpenAiInstance();

// Инициализация бота
const bot = new Telegraf(botToken);

// Log format
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

// Middleware для проверки авторизации
bot.use(session());
bot.use(checkAuthUserImproved, saveLog);

// Настройка команд бота
setupBotCommands(bot);

const jokeSender = new JokeSender("listToSendJoke.txt");
jokeSender.startDailyJob();

ensureLogDir();
bot.launch().then(() => {
  console.log("Бот запущен");
});

// Остановка бота корректно при завершении процесса
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

// --- Minimal frontend + ephemeral key endpoint for Realtime ---
const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from /public
app.use(express.static(path.join(__dirname, "public")));

// Issue ephemeral key for OpenAI Realtime
app.get("/session", async (req, res) => {
  try {
    const apiKey = config.get("openai.apiKey");
    const model = (() => {
      try {
        return config.get("openai.realtimeModel");
      } catch (_) {
        return "gpt-4o-realtime-preview-2025-06-03";
      }
    })();
    const voice = (() => {
      try {
        return config.get("openai.voice");
      } catch (_) {
        return "alloy";
      }
    })();

    const response = await axios.post(
      "https://api.openai.com/v1/realtime/sessions",
      { model, voice },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "realtime=v1",
        },
        timeout: 10000,
      }
    );

    res.json(response.data);
  } catch (err) {
    const status = err?.response?.status || 500;
    const message = err?.response?.data || {
      error: "Failed to create session",
    };
    res.status(status).json(message);
  }
});

const PORT = config.has("webapp.PORT") ? config.get("webapp.PORT") : 3000;
app.listen(PORT, () => {
  console.log(`Frontend server listening on http://localhost:${PORT}`);
});
