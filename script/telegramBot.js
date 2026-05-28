import { ogg } from "./ogg.js";
import * as menu from "./tlgBotMenu.js";
import { getConfigValue, getConfigValueWithDefault } from "../config/loader.js";
import { signWebToken } from "../utils/webToken.js";
import { replyInChunks } from "./telegramUtils.js";
import { handleError } from "../utils/errorHandler.js";
import { checkSession, createNewSession } from "./telegram/session.js";
import {
  textHandler,
  handleOpenAiVoice,
  handlePhotoMessage,
} from "./telegram/textHandler.js";

const setRole = async (ctx) => {
  await checkSession(ctx);
  ctx.session.parametres.setrole = true;
  await ctx.reply("Скажите, кто я сейчас?");
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
    menu.mainMenu,
  );
};

const backMsg = async (ctx) => {
  await ctx.reply("Ok", menu.mainMenu);
};

export function setupBotCommands(bot) {
  bot.start(async (ctx) => {
    console.log(`Start bot for ${ctx.chat.id}`);
    await createNewSession(ctx);
    await welcomeMsg(ctx);
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
      menu.buildWebSearchInlineKeyboard(enabled),
    );
  });

  if (menu.isRealtimeEnabled) {
    bot.hears(menu.menuRealtime, async (ctx) => {
      await checkSession(ctx);
      const baseUrlRaw = getConfigValueWithDefault(
        "webapp.baseUrl",
        "WEBAPP_BASE_URL",
        "http://localhost:3000",
      );
      let baseUrl;
      try {
        baseUrl = new URL(baseUrlRaw);
      } catch {
        await ctx.reply(
          "Realtime недоступен: WEBAPP_BASE_URL задан некорректно. Обратитесь к администратору и Укажите полный HTTPS URL, например https://yourdomain.com.",
        );
        return;
      }
      if (baseUrl.protocol !== "https:") {
        await ctx.reply(
          "Realtime недоступен: Telegram принимает Web App только по HTTPS. Обратитесь к администратору и Обновите WEBAPP_BASE_URL на публичный HTTPS адрес.",
        );
        return;
      }
      const secret = getConfigValue("telegramBot.token", "TELEGRAM_BOT_TOKEN");
      const token = signWebToken({ uid: ctx.from.id }, secret, 60);
      const url = new URL("/", baseUrl);
      url.searchParams.set("t", token);
      await ctx.reply(
        "Открыть мини‑приложение Realtime",
        menu.buildRealtimeInlineKeyboard(url.toString()),
      );
    });
  }

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
        menu.buildWebSearchInlineKeyboard(now).reply_markup,
      );
    } catch (_) {}
    await ctx.answerCbQuery(
      now ? "Web Search включён" : "Web Search выключен",
      { show_alert: false },
    );
  });

  bot.on("message", async (ctx) => {
    const userId = ctx.chat.id;
    try {
      if (ctx.message.voice) {
        await ctx.telegram.sendChatAction(ctx.chat.id, "upload_voice");
        const oggLink = await ctx.telegram.getFileLink(
          ctx.message.voice.file_id,
        );
        const oggPath = await ogg.create(oggLink.href, userId);
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
        await handlePhotoMessage(ctx);
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
