// Файл: telegramBot.js
import {
  createOpenAiImage,
  handleOpenAiRequest,
  handleOpenAiRequestWithWebSearch,
  handleOpenAiVoice,
  handleOpenAiRequestVoice,
} from "./openai.js";
import { ogg } from "./ogg.js";
import * as menu from "./tlgBotMenu.js";
import { getConfigValue, getConfigValueWithDefault } from "../config/loader.js";
import { createHmac } from "crypto";
import { replyInChunks } from "./telegramUtils.js";
import { handleError } from "../utils/errorHandler.js";

const roles = {
  ASSISTANT: "assistant",
  USER: "user",
  SYSTEM: "system",
};

const stickersGvineaPig = [
  "CAACAgIAAxkBAAILXGcIz5dXde_lMvnbDG7VHZriKgYBAAJjAAO2j0oJI4AaNSm1CfM2BA",
  "CAACAgIAAxkBAAILsGcMf8U7inPKs-hXrq_OGN-J9tgFAAJGAAOvxlEabdtbgJpfZjo2BA",
  "CAACAgIAAxkBAAILr2cMf7xQ9ElczU1-2rUIHwABtsuF0gACFgADr8ZRGup1yzuO6cBRNgQ",
  "CAACAgIAAxkBAAILlmcMfq4QHEQm-GI2fgFIU6kjN0rPAAIHAAOvxlEauNf458e89zQ2BA",
  "CAACAgIAAxkBAAILk2cMfn2TKscbUzdPtjz5DzqNPwhzAAIDAAOvxlEa6DmfjqiNi6E2BA",
  "CAACAgIAAxkBAAILoGcMf1EhEA_BIZ00yoJt6OXZJ9RVAAIOAAOvxlEat1uC7H4BJ_c2BA",
];

const defaultParameters = () => ({
  setrole: false,
  answerVoice: false,
  drawImage: false,
  voiceLang: "Russian",
  useWebSearch: false,
});

// Maximum number of messages to keep in history (excluding system message)
const MAX_MESSAGES = 20;

/**
 * Trim messages history to prevent it from growing too large
 * Keeps system message and last N messages
 * @param {Array} messages - Array of messages
 * @returns {Array} Trimmed messages array
 */
const trimMessages = (messages) => {
  if (!Array.isArray(messages) || messages.length <= MAX_MESSAGES + 1) {
    return messages;
  }

  // Find system message
  const systemMessage = messages.find((m) => m.role === roles.SYSTEM);
  const otherMessages = messages.filter((m) => m.role !== roles.SYSTEM);

  // Keep last MAX_MESSAGES messages
  const recentMessages = otherMessages.slice(-MAX_MESSAGES);

  // Reconstruct with system message first
  return systemMessage
    ? [systemMessage, ...recentMessages]
    : recentMessages;
};

const setRole = async (ctx) => {
  await checkSession(ctx);
  ctx.session.parametres.setrole = true;
  await ctx.reply("Скажите, кто я сейчас?");
};

const createNewSession = async (
  ctx,
  currRole = "Ты весёлый помощник по имени Дилан. Ты стараешься отвечать с юмором и сарказмом."
) => {
  try {
    await ctx.telegram.sendChatAction(ctx.chat.id, "typing");
    ctx.session = {
      messages: [],
      created: new Date(),
      parametres: defaultParameters(),
    };
    ctx.session.messages = [{ role: roles.SYSTEM, content: currRole }];

    const randSticker = Math.floor(Math.random() * stickersGvineaPig.length);
    const file_id = stickersGvineaPig[randSticker];

    await ctx.replyWithSticker(file_id);
  } catch (error) {
    console.log("Не могу почистить память ", error);
  }
};

const checkSession = async (ctx) => {
  if (!ctx.session?.parametres) {
    await createNewSession(ctx);
    return false;
  }
  const currentTime = new Date();
  if (currentTime - new Date(ctx.session.created) > 5 * 60 * 1000) {
    await createNewSession(ctx);
    return false;
  }
  return true;
};

const textHandler = async (ctx, userMessage) => {
  await checkSession(ctx);
  try {
    if (ctx.session.parametres.setrole) {
      await createNewSession(ctx, userMessage);
      ctx.session.parametres.setrole = false;
      return;
    }

    if (ctx.session.parametres.drawImage) {
      await ctx.telegram.sendChatAction(ctx.chat.id, "upload_photo");
      const response = await createOpenAiImage(userMessage);
      ctx.session.parametres.drawImage = false;
      const imageUrl = response?.url || null;
      if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
        await ctx.replyWithPhoto(imageUrl);
      } else {
        const { message } = handleError(
          new Error(response?.error || "Image generation failed"),
          {
            operation: "createOpenAiImage",
            context: { chatId: ctx.chat.id },
            customMessage: "Не удалось получить изображение. Попробуйте позже.",
          }
        );
        await ctx.reply(message);
      }
      return;
    }

    if (ctx.session.parametres.answerVoice) {
      await ctx.telegram.sendChatAction(ctx.chat.id, "record_voice");
      const requestString = `${userMessage} Отвечай, пожалуйста на ${ctx.session.parametres.voiceLang} язык`;
      ctx.session.messages.push({ role: roles.USER, content: requestString });
      
      // Trim messages before sending to OpenAI
      const trimmedMessages = trimMessages(ctx.session.messages);
      const response = await handleOpenAiRequestVoice(trimmedMessages);
      if (response?.text) {
        ctx.session.messages.push({
          role: roles.ASSISTANT,
          content: response.text,
        });
        await ctx.replyWithVoice({ source: response.buffer });
      } else {
        const { message } = handleError(
          new Error(response?.error || "Voice generation failed"),
          {
            operation: "handleOpenAiRequestVoice",
            context: { chatId: ctx.chat.id },
            customMessage: "Что-то я устал, надо поспать... Давай позже",
          }
        );
        await ctx.reply(message);
      }
    } else {
      // Simple text reply with typing action
      await ctx.telegram.sendChatAction(ctx.chat.id, "typing");
      ctx.session.messages.push({ role: roles.USER, content: userMessage });

      // Trim messages before sending to OpenAI to prevent history from growing too large
      const trimmedMessages = trimMessages(ctx.session.messages);

      const useWeb = Boolean(ctx.session.parametres.useWebSearch);
      const handler = useWeb
        ? handleOpenAiRequestWithWebSearch
        : handleOpenAiRequest;
      const { text, error } = await handler(trimmedMessages);

      if (error) {
        const { message } = handleError(new Error(error), {
          operation: "handleOpenAiRequest",
          context: { chatId: ctx.chat.id, useWebSearch: useWeb },
        });
        await replyInChunks(ctx, message);
      } else if (text && text.trim().length > 0) {
        ctx.session.messages.push({
          role: roles.ASSISTANT,
          content: text,
        });
        await replyInChunks(ctx, text);
      } else {
        await replyInChunks(
          ctx,
          "Что-то я устал, надо поспать... Давай попробуем позже"
        );
      }
    }
  } catch (error) {
    const { message } = handleError(error, {
      operation: "textHandler",
      context: { chatId: ctx.chat.id },
    });
    await ctx.reply(message);
  }
};

// Единый режим рисования без выбора реализм/рисунок
const drawImageStart = async (ctx) => {
  await checkSession(ctx);
  await ctx.reply("Опиши детально что нарисовать");
  ctx.session.parametres.drawImage = true;
};

const selectVoice = async (ctx) => {
  await checkSession(ctx);
  await ctx.reply("Ответы будут голосом", menu.voiceTextMenu);
  ctx.session.parametres.answerVoice = true;
};
const selectText = async (ctx) => {
  await checkSession(ctx);
  await ctx.reply("Ответы будут текстом", menu.voiceMenu);
  ctx.session.parametres.answerVoice = false;
};

// Удалены функции смены голоса (мужской/женский), используем голос по умолчанию

const welcomeMsg = async (ctx) => {
  await ctx.reply(
    "Привет! Я Дилан. Задай мне свой вопрос, и я попробую на него ответить.",
    menu.mainMenu
  );
};

const backMsg = async (ctx) => {
  ctx.reply("Ok", menu.mainMenu);
};

export function setupBotCommands(bot) {
  bot.start(async (ctx) => {
    console.log(`Start bot for ${ctx.chat.id}`);
    createNewSession(ctx);
    welcomeMsg(ctx);
  });

  bot.hears(menu.menuNewSession, async (ctx) => await createNewSession(ctx));
  bot.hears(menu.menuRole, setRole);
  bot.hears(menu.menuBack, backMsg);

  // Один пункт меню для рисования
  bot.hears(menu.menuImage, drawImageStart);

  bot.hears(menu.menuSelectVoice, selectVoice);
  bot.hears(menu.menuSelectText, selectText);
  bot.hears(menu.menuWebSearch, async (ctx) => {
    await checkSession(ctx);
    const enabled = Boolean(ctx.session.parametres.useWebSearch);
    await replyInChunks(
      ctx,
      `Режим Web Search: ${enabled ? "включён" : "выключен"}.` +
        "\nНажми кнопку ниже, чтобы переключить.",
      menu.buildWebSearchInlineKeyboard(enabled)
    );
  });

  // Realtime mini-app open button
  bot.hears(menu.menuRealtime, async (ctx) => {
    await checkSession(ctx);
    const baseUrl = getConfigValueWithDefault(
      "webapp.baseUrl",
      "WEBAPP_BASE_URL",
      "http://localhost:3000"
    );
    const signWebToken = (payload) => {
      const secret = getConfigValue("telegramBot.token", "TELEGRAM_BOT_TOKEN");
      const exp = Math.floor(Date.now() / 1000) + 60; // 1 минута на открытие
      const data = { ...payload, exp };
      const body = Buffer.from(JSON.stringify(data)).toString("base64url");
      const sig = createHmac("sha256", secret).update(body).digest("base64url");
      return `${body}.${sig}`;
    };
    const token = signWebToken({ uid: ctx.from.id });
    const url = `${baseUrl}/?t=${encodeURIComponent(token)}`;
    await ctx.reply(
      "Открыть мини‑приложение Realtime",
      menu.buildRealtimeInlineKeyboard(url)
    );
  });

  // Обработка сообщений
  bot.on("text", async (ctx) => {
    const userMessage = ctx.message.text;
    await textHandler(ctx, userMessage);
  });

  // Обработка инлайн-кнопки переключения Web Search
  bot.action("toggle_websearch", async (ctx) => {
    await checkSession(ctx);
    const prev = Boolean(ctx.session.parametres.useWebSearch);
    ctx.session.parametres.useWebSearch = !prev;
    const now = ctx.session.parametres.useWebSearch;
    try {
      await ctx.editMessageReplyMarkup(
        menu.buildWebSearchInlineKeyboard(now).reply_markup
      );
    } catch (_) {}
    await ctx.answerCbQuery(
      now ? "Web Search включён" : "Web Search выключен",
      { show_alert: false }
    );
  });

  bot.on("message", async (ctx) => {
    const userId = ctx.chat.id;
    try {
      if (ctx.message.voice) {
        await ctx.telegram.sendChatAction(ctx.chat.id, "upload_voice");
        const oggLink = await ctx.telegram.getFileLink(
          ctx.message.voice.file_id
        );
        const oggPath = await ogg.create(oggLink.href, userId, "ogg");
        const mp3Path = await ogg.toMP3(oggPath, userId);
        try {
          const { text } = await handleOpenAiVoice(mp3Path);
          await textHandler(ctx, text);
        } finally {
          // Cleanup temporary files
          await ogg.removeFile(mp3Path).catch(() => {});
          // oggPath is already removed by toMP3, but ensure cleanup
          await ogg.removeFile(oggPath).catch(() => {});
        }
      }

      if (ctx.message.photo) {
        await ctx.telegram.sendChatAction(ctx.chat.id, "upload_photo");
        const caption = ctx.message.caption
          ? ctx.message.caption
          : "Фото из публичного доступа. Попробуй рассказать что изображено на этом фото. Это не приватная информация.";
        const photos = ctx.message.photo;
        const bestPhoto = photos[photos.length - 1];
        const photoUrl = await ctx.telegram.getFileLink(bestPhoto.file_id);
        await createNewSession(
          ctx,
          "Ты весёлый художник по имени Дилан. Ты стараешься увидеть мелкие детали в рисунках и описывать их с умеренной иронией"
        );
        ctx.session.messages.push({
          role: roles.USER,
          content: [
            { type: "text", text: caption },
            { type: "image_url", image_url: { url: photoUrl.href } },
          ],
        });
        
        // Trim messages before sending to OpenAI
        const trimmedMessages = trimMessages(ctx.session.messages);
        const { text: photoResp, error: photoErr } = await handleOpenAiRequest(
          trimmedMessages
        );
        await ctx.reply(
          photoErr ? `Ошибка: ${photoErr}` : photoResp || "Пустой ответ"
        );
      }
    } catch (error) {
      const { message } = handleError(error, {
        operation: "bot.message handler",
        context: { userId: ctx.chat?.id },
      });
      await ctx.reply(message).catch(() => {}); // Ignore errors when replying about errors
    }
  });
}
