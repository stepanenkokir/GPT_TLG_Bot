import OpenAI from "openai";
import { getConfigValue, getConfigValueWithDefault } from "../config/loader.js";
import { validateMessages } from "../middleware/validators.js";
import { handleError, isQuotaExceededError } from "../utils/errorHandler.js";
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
              const url = typeof part.image_url === "string"
                ? part.image_url
                : part.image_url?.url;
              return { type: "image_url", image_url: { url } };
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

  // Responses API: resp.output — массив блоков { type: "message", content: [...] }
  if (Array.isArray(resp.output)) {
    const text = resp.output
      .flatMap((block) => (Array.isArray(block?.content) ? block.content : []))
      .filter((part) => part?.type === "output_text" && part?.text)
      .map((part) => part.text)
      .join("")
      .trim();
    if (text.length > 0) return text;
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
  if (isQuotaExceededError(error)) return false;

  const status = error?.status;
  if ([408, 409, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(error?.message || "");
  return /timeout|ETIMEDOUT|network|fetch failed|socket hang up/i.test(message);
};

const buildOpenAiErrorResponse = (error, operation) => {
  const { message: userMessage } = handleError(error, { operation });

  return {
    text: "",
    error: error?.message || String(error),
    userMessage,
    status: error?.status || error?.response?.status,
    code: error?.code || error?.error?.code,
  };
};

// Универсальный запрос с ретраем и экспоненциальной задержкой
const requestWithRetry = async (fn, retries = 2) => {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableError(err) || i === retries) throw err;
      const delay = Math.min(1000 * 2 ** i, 8000);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastErr;
};

// ===== Основные методы =====
export const handleOpenAiRequest = async (messages, options = {}) => {
  try {
    const validation = validateMessages(messages);
    if (!validation.valid) {
      const validationError = new Error(`Invalid messages format: ${validation.error}`);
      return buildOpenAiErrorResponse(validationError, "handleOpenAiRequest.validation");
    }

    const model = getModel();
    const chatMessages = toChatMessages(messages);

    const completionParams = {
      model,
      messages: chatMessages,
    };
    if (options.maxTokens) {
      completionParams.max_completion_tokens = options.maxTokens;
    }

    const resp = await requestWithRetry(() =>
      globalOpenAI.chat.completions.create(completionParams)
    );

    const text = extractTextFromResponse(resp);
    if (!text) {
      console.warn(
        "[openai] Empty text extracted.",
        "finish_reason:", resp?.choices?.[0]?.finish_reason,
        "raw content:", JSON.stringify(resp?.choices?.[0]?.message?.content),
        "usage:", JSON.stringify(resp?.usage),
        "messages_count:", chatMessages.length,
        "max_tokens:", options.maxTokens ?? 1000
      );
    }
    return { text };
  } catch (e) {
    return buildOpenAiErrorResponse(e, "handleOpenAiRequest");
  }
};

// Выполнить запрос с использованием Responses API и инструмента web_search
export const handleOpenAiRequestWithWebSearch = async (
  messages,
  options = {}
) => {
  try {
    const validation = validateMessages(messages);
    if (!validation.valid) {
      const validationError = new Error(`Invalid messages format: ${validation.error}`);
      return buildOpenAiErrorResponse(validationError, "handleOpenAiRequestWithWebSearch.validation");
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
    return buildOpenAiErrorResponse(e, "handleOpenAiRequestWithWebSearch");
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
    return buildOpenAiErrorResponse(e, "handleOpenAiRequestVoice");
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
    return buildOpenAiErrorResponse(e, "handleOpenAiVoice");
  }
};

export const createOpenAiImage = async (prompt, quality = "medium") => {
  const resolveQuality = (q) => {
    if (q === "high" || q === "hd") return "high";
    if (q === "low") return "low";
    return "medium";
  };

  try {
    const resp = await requestWithRetry(() =>
      globalOpenAI.images.generate({
        model: "gpt-image-1-mini",
        prompt,
        size: "1024x1024",
        quality: resolveQuality(quality),
        n: 1,
      })
    );
    const b64 = resp.data?.[0]?.b64_json || null;
    if (!b64) return { buffer: null };
    return { buffer: Buffer.from(b64, "base64") };
  } catch (e) {
    const errorResponse = buildOpenAiErrorResponse(e, "createOpenAiImage");
    return { buffer: null, ...errorResponse };
  }
};
