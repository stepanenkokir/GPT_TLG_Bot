import OpenAI from "openai";
import { getConfigValue, getConfigValueWithDefault } from "../config/loader.js";
import { validateMessages } from "../middleware/validators.js";
import { handleError } from "../utils/errorHandler.js";
import fs, { createReadStream } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

let globalOpenAI = null;

const __dirname = dirname(fileURLToPath(import.meta.url));
const speechDir = resolve(__dirname, "../voices");

const getSpeechFile = (id) =>
  resolve(speechDir, `speech_${id}_${Date.now()}.mp3`);

// ===== Инициализация =====
export const createOpenAiInstance = () => {
  if (globalOpenAI) return;
  const openAiApiKey = getConfigValue("openai.apiKey", "OPENAI_API_KEY");
  if (!openAiApiKey) throw new Error("OpenAI API key is missing in config");
  globalOpenAI = new OpenAI({ apiKey: openAiApiKey });
};

// ===== Вспомогательные =====
const getModel = () => {
  try {
    const m = getConfigValueWithDefault(
      "openai.model",
      "OPENAI_MODEL",
      "gpt-4o-mini"
    );
    return typeof m === "string" && m.trim() ? m.trim() : "gpt-4o-mini";
  } catch {
    return "gpt-4o-mini";
  }
};

const toChatMessages = (messages) =>
  messages
    .filter((m) => m && m.role)
    .map((m) => {
      if (typeof m.content === "string") {
        return {
          role: m.role,
          content: m.content,
        };
      }
      if (Array.isArray(m.content)) {
        return {
          role: m.role,
          content: m.content.map((part) => {
            if (part?.type === "text") {
              return { type: "text", text: part.text };
            }
            if (part?.type === "image_url") {
              return {
                type: "image_url",
                image_url: part.image_url?.url || part.image_url,
              };
            }
            return {
              type: "text",
              text: typeof part === "string" ? part : JSON.stringify(part),
            };
          }),
        };
      }
      return {
        role: m.role,
        content: String(m.content),
      };
    });

const extractTextFromResponse = (resp) => {
  if (!resp) return "";

  // Стандартный Chat Completions ответ
  if (resp.choices && resp.choices[0]?.message?.content) {
    const content = resp.choices[0].message.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object") {
            if (typeof part.text === "string") return part.text;
            if (typeof part.output_text === "string") return part.output_text;
            if (typeof part.content === "string") return part.content;
          }
          return "";
        })
        .filter(Boolean)
        .join("")
        .trim();
      if (text.length > 0) return text;
      // Если не нашли явный текст — отдадим JSON, чтобы не было [object Object]
      try {
        return JSON.stringify(content);
      } catch (_) {
        return "";
      }
    }
    if (typeof content === "object" && content) {
      // Пытаемся вытащить поле text из объекта
      if (typeof content.text === "string") return content.text.trim();
      if (typeof content.output_text === "string")
        return content.output_text.trim();
      try {
        return JSON.stringify(content);
      } catch (_) {
        return "";
      }
    }
  }

  // Фоллбэк для других форматов
  if (resp.output_text) {
    return Array.isArray(resp.output_text)
      ? resp.output_text.join("").trim()
      : String(resp.output_text).trim();
  }

  return "";
};

const isRetryableError = (error) => {
  const status = error?.status;
  if ([408, 409, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(error?.message || "");
  return /timeout|ETIMEDOUT|network|fetch failed|socket hang up/i.test(message);
};

// Универсальный запрос с ретраем
const requestWithRetry = async (fn, retries = 2) => {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableError(err) || i === retries) throw err;
    }
  }
  throw lastErr;
};

// ===== Основные методы =====
export const handleOpenAiRequest = async (messages) => {
  try {
    // Validate messages before processing
    const validation = validateMessages(messages);
    if (!validation.valid) {
      return {
        text: "",
        error: `Invalid messages format: ${validation.error}`,
      };
    }

    const model = getModel();
    const chatMessages = toChatMessages(messages);

    const resp = await requestWithRetry(() =>
      globalOpenAI.chat.completions.create({
        model,
        messages: chatMessages,
        max_completion_tokens: 2000, // Reduced from 2000 to speed up responses
      })
    );

    return { text: extractTextFromResponse(resp) };
  } catch (e) {
    handleError(e, { operation: "handleOpenAiRequest" });
    return { text: "", error: e.message };
  }
};

// Выполнить запрос с использованием Responses API и инструмента web_search
export const handleOpenAiRequestWithWebSearch = async (
  messages,
  options = {}
) => {
  try {
    // Validate messages before processing
    const validation = validateMessages(messages);
    if (!validation.valid) {
      return {
        text: "",
        error: `Invalid messages format: ${validation.error}`,
      };
    }

    const model = getModel();

    // Преобразуем сообщения в единый текстовый ввод для Responses API
    const chatMessages = toChatMessages(messages);
    const input = chatMessages
      .map((m) => {
        const content = Array.isArray(m.content)
          ? m.content
              .map((p) => (typeof p === "string" ? p : p.text || ""))
              .filter(Boolean)
              .join("\n")
          : String(m.content || "");
        const role = m.role || "user";
        if (role === "system") return `System: ${content}`;
        if (role === "assistant") return `Assistant: ${content}`;
        return `User: ${content}`;
      })
      .join("\n\n");

    const tools = [
      {
        type: "web_search",
        search_context_size: options.search_context_size || "medium",
        user_location: options.user_location || {
          type: "approximate",
          country: "RU",
        },
      },
    ];

    const resp = await requestWithRetry(() =>
      globalOpenAI.responses.create({
        model,
        tools,
        input,
      })
    );

    return { text: extractTextFromResponse(resp) };
  } catch (e) {
    handleError(e, { operation: "handleOpenAiRequestWithWebSearch" });
    return { text: "", error: e.message };
  }
};

export const handleOpenAiRequestVoice = async (messages, id = "default") => {
  const speechFile = getSpeechFile(id);
  try {
    await fs.promises.mkdir(speechDir, { recursive: true });

    const { text, error } = await handleOpenAiRequest(messages);
    if (error) return { text, error };

    const mp3 = await globalOpenAI.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(speechFile, buffer);

    return { text, buffer };
  } catch (e) {
    handleError(e, { operation: "handleOpenAiRequestVoice" });
    return { text: "", error: e.message };
  } finally {
    await fs.promises.unlink(speechFile).catch(() => {});
  }
};

export const handleOpenAiVoice = async (filepath) => {
  try {
    const resp = await requestWithRetry(() =>
      globalOpenAI.audio.transcriptions.create({
        model: "whisper-1",
        file: createReadStream(filepath),
      })
    );
    return { text: resp.text };
  } catch (e) {
    handleError(e, { operation: "handleOpenAiVoice" });
    return { text: "", error: e.message };
  }
};

export const createOpenAiImage = async (prompt, quality = false) => {
  const resolveQuality = (q) =>
    typeof q === "string"
      ? q === "high"
        ? "hd"
        : "standard"
      : q
      ? "hd"
      : "standard";

  try {
    const resp = await requestWithRetry(() =>
      globalOpenAI.images.generate({
        model: "dall-e-3",
        prompt,
        size: "1024x1024",
        quality: resolveQuality(quality),
        n: 1,
      })
    );
    return { url: resp.data?.[0]?.url || null };
  } catch (e) {
    handleError(e, { operation: "createOpenAiImage" });
    return { url: null, error: e.message };
  }
};
