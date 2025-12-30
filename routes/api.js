import express from "express";
import { httpClient } from "../utils/httpClient.js";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { getConfigValue, getConfigValueWithDefault } from "../config/loader.js";
import { createHmac } from "crypto";
import { isUserAuthorized } from "../middleware/checkAuthUser.js";
import { getTelegramBot } from "../script/telegramBotInstance.js";
import { sendMessageInChunks } from "../script/telegramUtils.js";
import { validateRole, validateTextMessage } from "../middleware/validators.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ProfessorVoice = `You are Professor Dylan, you understand medicine and can give useful health and treatment advice. Keep answers short, no more than 20 words. Note: Default response language is Russian.`;

const TeacherVoice = `You are Teacher Dylan, you explain any topics in language accessible to children 5-7 years old. Keep answers short, no more than 20 words. Note: Default response language is Russian.`;

const HooliGanVoice = `You are the cheeky hooligan Dylan, you can speak different languages, and you can be very funny and cheerful. 
And add hooligan words to your vocabulary. Keep answers short, no more than 10 words. Note: Default response language is Russian.`;

const DylanVoice = `You are sarcastic Dylan, you can be very sarcastic and funny. Keep answers short, no more than 20 words. Note: Default response language is Russian.`;

const MODEL = getConfigValueWithDefault(
  "openai.realtimeModel",
  "OPENAI_REALTIME_MODEL",
  "gpt-4o-realtime-preview-2025-06-03"
);

const API_KEY = getConfigValue("openai.apiKey", "OPENAI_API_KEY");

function verifyInitData(raw, botToken) {
  if (!raw || typeof raw !== "string") return { ok: false };
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash) return { ok: false };
  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");
  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computed = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  if (computed !== hash) return { ok: false };
  const userJson = params.get("user");
  let userId = null;
  let userName = null;
  if (userJson) {
    try {
      const user = JSON.parse(userJson);
      userId = user?.id ?? null;
      userName = user?.first_name ?? user?.username ?? null;
    } catch (_) {}
  }
  return { ok: true, userId, userName };
}

function verifyWebToken(t, botToken) {
  if (!t) return null;
  const [body, sig] = String(t).split(".");
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
}

export function registerApiRoutes(app) {
  const botToken = getConfigValue("telegramBot.token", "TELEGRAM_BOT_TOKEN");
  const testMode = getConfigValueWithDefault(
    "webapp.TEST_MODE",
    "WEBAPP_TEST_MODE",
    false
  );

  const bot = getTelegramBot();

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
    });
  });

  // Gate index page: allow only inside Telegram WebApp and authorized users
  app.get(["/", "/index.html"], (req, res) => {
    const t = req.query?.t;
    if (!testMode) {
      const tokenData = verifyWebToken(t, botToken);
      if (!tokenData || !tokenData.uid || !isUserAuthorized(tokenData.uid)) {
        return res.status(401).send("Open this page from Telegram bot");
      }
    }
    res.sendFile(path.join(__dirname, "../public", "index.html"));
  });

  // Serve static public assets
  app.use(express.static(path.join(__dirname, "../public")));

  // Set role endpoint
  app.post("/api/set-role", express.json(), async (req, res) => {
    try {
      const initData = req.header("x-telegram-init-data") || "";
      const webToken = req.header("x-webapp-token") || "";

      let verification = null;
      if (!testMode) {
        verification = verifyInitData(initData, botToken);
        const tokenData = verifyWebToken(webToken, botToken);
        const userIdToCheck = verification.userId || tokenData?.uid;
        if (
          !verification.ok ||
          !userIdToCheck ||
          !isUserAuthorized(userIdToCheck)
        ) {
          return res.status(401).json({ error: "Unauthorized" });
        }
      }

      const { role, voice, name } = req.body;

      // Validate role data
      const validation = validateRole({ role, voice, name });
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Получаем имя пользователя из initData, если доступно
      const telegramUserName = testMode
        ? "Kirill"
        : verification?.userName || "Unknown";

      const roleInstruction = role;

      let voiceInstruction = DylanVoice;
      switch (role) {
        case "doctor":
          voiceInstruction = ProfessorVoice;
          break;
        case "teacher":
          voiceInstruction = TeacherVoice;
          break;
        case "hooligan":
          voiceInstruction = HooliGanVoice;
          break;

        default:
          voiceInstruction = DylanVoice;
          break;
      }

      const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          voice: voice,
          instructions: `User: ${telegramUserName}. ${roleInstruction} ${voiceInstruction}`,
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: {
            model: "whisper-1",
          },
        }),
      });

      if (!resp.ok) {
        console.log(`OpenAI API error: ${resp.status} ${resp.statusText}`);
        throw new Error(`OpenAI API error: ${resp.status} ${resp.statusText}`);
      }

      const json = await resp.json();
      res.json(json);
    } catch (error) {
      console.error("Error setting role:", error);
      res.status(500).json({ error: "Failed to set role" });
    }
  });

  app.post("/api/realtime-message", express.json(), async (req, res) => {
    try {
      // Validate text message
      const validation = validateTextMessage(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const { text } = req.body;
      const initData = req.header("x-telegram-init-data") || "";
      const verification = testMode
        ? {
            userId: getConfigValue("webapp.testId", "WEBAPP_TEST_ID"),
            ok: true,
          }
        : verifyInitData(initData, botToken);
      const userIdToCheck = verification.userId;

      if (
        !verification.ok ||
        !userIdToCheck ||
        !isUserAuthorized(userIdToCheck)
      ) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await sendMessageInChunks(bot.telegram, userIdToCheck, text, {
        parse_mode: "HTML",
        disable_web_page_preview: false,
      });
      res.json({ ok: true });
    } catch (error) {
      console.error("Error in realtime-message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Proxy WebRTC SDP exchange to OpenAI Realtime. Body is raw SDP text
  app.post(
    "/realtime/sdp",
    express.text({
      type: ["application/sdp", "text/plain", "*/*"],
      limit: "2mb",
    }),
    async (req, res) => {
      try {
        const initData = req.header("x-telegram-init-data") || "";
        const webToken = req.header("x-webapp-token") || "";

        if (!testMode) {
          const verification = verifyInitData(initData, botToken);
          const tokenData = verifyWebToken(webToken, botToken);
          const userIdToCheck = verification.userId || tokenData?.uid;
          if (
            !verification.ok ||
            !userIdToCheck ||
            !isUserAuthorized(userIdToCheck)
          ) {
            return res.status(401).json({ error: "Unauthorized" });
          }
        }

        const offerSdp = req.body || "";
        if (offerSdp.length === 0) {
          return res.status(400).json({ error: "Empty SDP" });
        }

        const url = `https://api.openai.com/v1/realtime?model=${encodeURIComponent(
          MODEL
        )}`;
        const oaResp = await httpClient.post(url, offerSdp, {
          headers: {
            Authorization: req.headers.authorization,
            "Content-Type": "application/sdp",
            "OpenAI-Beta": "realtime=v1",
          },
          timeout: 15000,
          responseType: "text",
          validateStatus: () => true,
        });

        if (oaResp.status < 200 || oaResp.status >= 300) {
          return res.status(oaResp.status).send(String(oaResp.data || ""));
        }

        res.setHeader("Content-Type", "application/sdp");
        return res.status(200).send(String(oaResp.data || ""));
      } catch (err) {
        const status = err?.response?.status || 500;
        const message = err?.response?.data || "Failed SDP exchange";
        return res
          .status(status)
          .send(
            typeof message === "string" ? message : JSON.stringify(message)
          );
      }
    }
  );
}
