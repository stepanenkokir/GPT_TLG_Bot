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
  // Supports string content and multimodal array content [{type:'text'|'image_url', ...}]
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

const tryModelsInOrder = async (models, buildRequest) => {
  let lastError = null;
  for (const model of models) {
    try {
      const req = buildRequest(model);
      const resp = await globalOpenAI.responses.create(req);
      const text = extractTextFromResponse(resp);
      if (text) return { text, resp };
    } catch (e) {
      lastError = e;
      // try next model
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
    const models = [preferred] || ["gpt-5", "gpt-4.1-mini", "gpt-4o-mini"];

    console.log("Selected model:", models);

    const input = toResponsesInput(messages);
    const { text } = await tryModelsInOrder(models, (model) => ({
      model,
      tools: [{ type: "web_search_preview" }],
      input,
    }));
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
    const models = [preferred || "gpt-5", "gpt-4.1-mini", "gpt-4o-mini"];

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
  try {
    const response = await globalOpenAI.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: quality ? "hd" : "standard",
      n: 1,
    });
    return response.data[0].url;
  } catch (e) {
    console.log("Error in createOpenAiImage", e.message);
    return "Ошибка рисования";
  }
};
