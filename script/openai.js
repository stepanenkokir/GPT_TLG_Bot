import OpenAI from "openai";
import config from "config";
import fs from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createReadStream } from "fs";

let globalOpenAI = null;

const __dirname = dirname(fileURLToPath(import.meta.url));

const speechFile = resolve(__dirname, "../voices", "speach.mp3");

export const createOpenAiInstance = () => {
  const openAiApiKey = config.get("openai.apiKey");
  globalOpenAI = new OpenAI({ apiKey: openAiApiKey });
};

// Helpers
const toResponsesInput = (messages) => {
  // Convert legacy Chat Completions style messages to Responses API input
  // Use input part types supported by Responses API: 'input_text' and 'input_image'
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return {
        role: m.role,
        content: [{ type: "input_text", text: m.content }],
      };
    }
    if (Array.isArray(m.content)) {
      return {
        role: m.role,
        content: m.content.map((part) => {
          if (part.type === "text") {
            return { type: "input_text", text: part.text };
          }
          if (part.type === "image_url") {
            return {
              type: "input_image",
              image_url: part.image_url.url || part.image_url,
            };
          }
          // Fallback: stringify unknown parts as text
          return {
            type: "input_text",
            text: typeof part === "string" ? part : JSON.stringify(part),
          };
        }),
      };
    }
    return {
      role: m.role,
      content: [{ type: "input_text", text: String(m.content) }],
    };
  });
};

const extractTextFromResponse = (resp) => {
  // SDK v4 exposes convenient output_text; fallback to walking the output structure
  if (
    resp &&
    typeof resp.output_text === "string" &&
    resp.output_text.length > 0
  ) {
    return resp.output_text;
  }
  try {
    const blocks = resp?.output ?? resp?.response?.output;
    if (!Array.isArray(blocks)) return null;
    // Find the first text block
    for (const block of blocks) {
      const content = block?.content;
      if (!Array.isArray(content)) continue;
      for (const item of content) {
        if (item?.type === "output_text" && typeof item?.text === "string") {
          return item.text;
        }
        if (item?.type === "text" && typeof item?.text === "string") {
          return item.text;
        }
      }
    }
  } catch (_) {
    // ignore
  }
  return null;
};

const isRetryableError = (error) => {
  const status = error?.status ?? error?.code?.status;
  if ([408, 409, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(error?.message || "");
  if (/timeout|ETIMEDOUT|network|fetch failed|socket hang up/i.test(message)) {
    return true;
  }
  const code = error?.code || error?.error?.code;
  return code === "rate_limit_exceeded" || code === "overloaded";
};

const withTimeout = async (promise, ms, onAbort) => {
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (typeof onAbort === "function") {
          try {
            onAbort();
          } catch (_) {}
        }
        reject(new Error(`Request timed out after ${ms}ms`));
      }, ms);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

const tryModelsInOrder = async (models, buildRequest, timeoutMs = 30000) => {
  let lastError = null;
  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    try {
      const req = buildRequest(model);
      const resp = await withTimeout(
        globalOpenAI.responses.create(req),
        timeoutMs
      );
      const text = extractTextFromResponse(resp);
      if (text) return { text, resp };
    } catch (e) {
      lastError = e;
      const canRetry = isRetryableError(e) && i < models.length - 1;
      if (!canRetry) break;
      // otherwise continue to next model
    }
  }
  if (lastError) throw lastError;
  return { text: null, resp: null };
};

export const handleOpenAiRequest = async (messages) => {
  try {
    const preferred = (() => {
      try {
        return config.get("openai.model");
      } catch (_) {
        return undefined;
      }
    })();
    const defaultModel = preferred || "gpt-4o-mini";
    // Only fall back to one alternative on transient errors
    const models = [defaultModel, "gpt-4.1-mini"];

    const input = toResponsesInput(messages);
    const { text } = await tryModelsInOrder(
      models,
      (model) => ({
        model,
        // Web search adds noticeable latency; keep it off by default
        input,
        max_output_tokens: 800,
      }),
      30000
    );
    console.log(text);
    return text;
  } catch (e) {
    console.log("Error in GPT Responses API", e.message);
    return "Ошибка открытия чата";
  }
};

export const handleOpenAiRequestVoice = async (messages, maleVoice = true) => {
  try {
    const preferred = (() => {
      try {
        return config.get("openai.model");
      } catch (_) {
        return undefined;
      }
    })();
    const models = [preferred || "gpt-4o-mini", "gpt-4.1-mini"];

    const input = toResponsesInput(messages);
    const { text } = await tryModelsInOrder(models, (model) => ({
      model,
      input,
    }));

    const mp3 = await globalOpenAI.audio.speech.create({
      model: "tts-1",
      voice: maleVoice ? "alloy" : "nova",
      input: text,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(speechFile, buffer);

    return { text, buffer };
  } catch (e) {
    console.log("Error in GPT VOICE API", e.message);
    return { content: "Ошибка открытия чата" };
  }
};

export const handleOpenAiVoice = async (filepath) => {
  try {
    const response = await globalOpenAI.audio.transcriptions.create({
      model: "whisper-1",
      file: createReadStream(filepath),
    });
    return response.text;
  } catch (e) {
    console.log("Error in transcription", e.message);
    return "Ошибка распознавания текста";
  }
};

export const createOpenAiImage = async (prompt, quality = false) => {
  const resolveQualityForDalle3 = (q) => {
    if (typeof q === "string") return q === "high" ? "hd" : "standard";
    return q ? "hd" : "standard"; // boolean compatibility
  };

  try {
    const response = await globalOpenAI.images.generate({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      quality: resolveQualityForDalle3(quality),
      n: 1,
    });
    return response.data[0]?.url || response.data[0]?.b64_json || null;
  } catch (e) {
    console.log("Error in createOpenAiImage", e.message);
    return "Ошибка рисования";
  }
};

// Streaming text responses for incremental UI updates
export const streamOpenAiText = async (
  messages,
  { model: forcedModel, onDelta, onDone, onError, maxOutputTokens = 800 } = {}
) => {
  const preferred = (() => {
    try {
      return config.get("openai.model");
    } catch (_) {
      return undefined;
    }
  })();
  const model = forcedModel || preferred || "gpt-4o-mini";
  const input = toResponsesInput(messages);

  try {
    const stream = await globalOpenAI.responses.stream({
      model,
      input,
      max_output_tokens: maxOutputTokens,
    });

    // Prefer high-level textDelta if available
    if (typeof stream.on === "function") {
      let finished = false;
      const finish = (err) => {
        if (finished) return;
        finished = true;
        try {
          if (err) {
            if (typeof onError === "function") onError(err);
          } else if (typeof onDone === "function") {
            onDone();
          }
        } catch (_) {}
      };

      // SDK may emit textDelta events
      try {
        stream.on("textDelta", (delta) => {
          if (typeof onDelta === "function" && delta) onDelta(String(delta));
        });
      } catch (_) {}

      // Fallback to low-level event feed
      try {
        stream.on("event", (event) => {
          if (event?.type === "response.output_text.delta") {
            const delta = event?.delta || event?.text || "";
            if (typeof onDelta === "function" && delta) onDelta(String(delta));
          }
        });
      } catch (_) {}

      stream.on("end", () => finish());
      stream.on("close", () => finish());
      stream.on("finished", () => finish());
      stream.on("error", (err) => finish(err));

      // Wait for stream to complete
      try {
        await stream.done();
      } catch (_) {
        // done() may throw if already ended; ignore
      }
      return;
    }

    // If stream object doesn't support events, fallback to non-stream
    const { text } = await tryModelsInOrder([model], (m) => ({
      model: m,
      input,
      max_output_tokens: maxOutputTokens,
    }));
    if (typeof onDelta === "function" && text) onDelta(text);
    if (typeof onDone === "function") onDone();
  } catch (err) {
    if (typeof onError === "function") onError(err);
  }
};
