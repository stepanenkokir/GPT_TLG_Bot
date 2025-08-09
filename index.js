// Файл: index.js
import { Telegraf, session } from "telegraf";
import config from "config";
import { createOpenAiInstance } from "./script/openai.js";
import { setupBotCommands } from "./script/telegramBot.js";
import {
  checkAuthUserImproved,
  isUserAuthorized,
} from "./middleware/checkAuthUser.js";
import { createLogger, format, transports } from "winston";
import JokeSender from "./script/jokeSender.js";
import fs from "fs/promises";
import express from "express";
import cors from "cors";
import axios from "axios";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createHmac } from "crypto";

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

const testMode = config.has("webapp.TEST_MODE")
  ? config.get("webapp.TEST_MODE")
  : false;

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

// Gate index page: allow only inside Telegram WebApp and authorized users
app.get(["/", "/index.html"], (req, res) => {
  // Prefer signed token from bot button (works before JS runs)
  const t = req.query?.t;
  const verifyWebTokenGate = (token) => {
    if (!token) return null;
    const [body, sig] = String(token).split(".");
    if (!body || !sig) return null;
    const expected = createHmac("sha256", botToken)
      .update(body)
      .digest("base64url");
    if (expected !== sig) return null;
    try {
      const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      if (
        typeof data?.exp !== "number" ||
        data.exp < Math.floor(Date.now() / 1000)
      )
        return null;
      return data;
    } catch (_) {
      return null;
    }
  };

  if (!testMode) {
    const tokenData = verifyWebTokenGate(t);
    if (!tokenData || !tokenData.uid || !isUserAuthorized(tokenData.uid)) {
      return res.status(401).send("Open this page from Telegram bot");
    }
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Serve static files from /public (assets)
app.use(express.static(path.join(__dirname, "public")));

// Issue ephemeral key for OpenAI Realtime
app.get("/session", async (req, res) => {
  try {
    // Validate Telegram WebApp initData and user authorization
    const initData = req.header("x-telegram-init-data") || "";
    const webToken = req.header("x-webapp-token") || "";
    const botToken = config.get("telegramBot.token");

    const verifyInitData = (raw) => {
      if (!raw || typeof raw !== "string") return { ok: false };
      const params = new URLSearchParams(raw);
      const hash = params.get("hash");
      if (!hash) return { ok: false };
      // Build data_check_string
      const pairs = [];
      for (const [key, value] of params.entries()) {
        if (key === "hash") continue;
        pairs.push(`${key}=${value}`);
      }
      pairs.sort();
      const dataCheckString = pairs.join("\n");
      // secret_key = HMAC_SHA256("WebAppData", botToken)
      const secretKey = createHmac("sha256", "WebAppData")
        .update(botToken)
        .digest();
      const computed = createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");
      if (computed !== hash) return { ok: false };
      // Extract user
      const userJson = params.get("user");
      let userId = null;
      if (userJson) {
        try {
          const user = JSON.parse(userJson);
          userId = user?.id ?? null;
        } catch (_) {}
      }
      return { ok: true, userId };
    };

    const verification = verifyInitData(initData);
    // Optional extra token check from bot deep-link
    const verifyWebToken = (t) => {
      if (!t) return false;
      const [body, sig] = t.split(".");
      if (!body || !sig) return false;
      const expected = createHmac("sha256", botToken)
        .update(body)
        .digest("base64url");
      if (expected !== sig) return false;
      try {
        const data = JSON.parse(
          Buffer.from(body, "base64url").toString("utf8")
        );
        if (
          typeof data?.exp !== "number" ||
          data.exp < Math.floor(Date.now() / 1000)
        )
          return false;
        return data;
      } catch (_) {
        return false;
      }
    };

    if (!testMode) {
      const tokenData = verifyWebToken(webToken);

      const userIdToCheck = verification.userId || tokenData?.uid;
      if (
        !verification.ok ||
        !userIdToCheck ||
        !isUserAuthorized(userIdToCheck)
      ) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }
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

    const roleInstruction = (() => {
      try {
        return config.get("openai.ROLE");
      } catch (_) {
        return "Ты голосовой помощник Дилан. Отвечай кратко и дружелюбно на русском языке.";
      }
    })();

    const voiceInstruction = (() => {
      try {
        return config.get("openai.VOICE");
      } catch (_) {
        return "Speak with a natural, conversational tone, incorporating light humor and subtle sarcasm where appropriate. Avoid sounding robotic or overly formal. Use varied intonation to convey personality and engage users effectively.";
      }
    })();

    const response = await axios.post(
      "https://api.openai.com/v1/realtime/sessions",
      { model, voice, instructions: roleInstruction + voiceInstruction },
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
