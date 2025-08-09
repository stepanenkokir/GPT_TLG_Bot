// Файл: telegramBot.js
import {
  createOpenAiImage,
  handleOpenAiRequest,
  handleOpenAiVoice,
  handleOpenAiRequestVoice,
  streamOpenAiText,
} from "./openai.js";
import { ogg } from "./ogg.js";
import * as menu from "./tlgBotMenu.js";
import config from "config";

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
  voiceMale: true,
});

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
      // Если пришёл валидный URL от генерации — отправляем как фото, иначе текст
      if (response && /^https?:\/\//i.test(response)) {
        await ctx.replyWithPhoto(response);
      } else {
        await ctx.reply(response || "Не удалось получить изображение");
      }
      return;
    }

    if (ctx.session.parametres.answerVoice) {
      await ctx.telegram.sendChatAction(ctx.chat.id, "record_voice");
      const requestString = `${userMessage} Отвечай, пожалуйста на ${ctx.session.parametres.voiceLang} язык`;
      ctx.session.messages.push({ role: roles.USER, content: requestString });
      const response = await handleOpenAiRequestVoice(
        ctx.session.messages,
        ctx.session.parametres.voiceMale
      );
      if (response?.text) {
        ctx.session.messages.push({
          role: roles.ASSISTANT,
          content: response.text,
        });
        await ctx.replyWithVoice({ source: response.buffer });
      } else {
        await ctx.reply("Что-то я устал, надо поспать... Давай позже");
      }
    } else {
      // Streaming text reply with live edits
      await ctx.telegram.sendChatAction(ctx.chat.id, "typing");
      ctx.session.messages.push({ role: roles.USER, content: userMessage });

      // Placeholder message that we continuously edit
      const placeholder = await ctx.reply("Печатаю ответ…");

      let accumulated = "";
      let lastEditAt = 0;
      let typingTimer = setInterval(() => {
        ctx.telegram.sendChatAction(ctx.chat.id, "typing").catch(() => {});
      }, 1000);

      let finalized = false;
      const tryFinalize = async () => {
        if (finalized) return;
        finalized = true;
        clearInterval(typingTimer);
        if (accumulated.trim().length > 0) {
          // Final update with full text (guard against identical content)
          try {
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              placeholder.message_id,
              undefined,
              accumulated
            );
          } catch (e) {
            if (!/message is not modified/i.test(String(e?.description || e))) {
              try {
                await ctx.reply(accumulated);
              } catch (_) {}
            }
          }
          ctx.session.messages.push({
            role: roles.ASSISTANT,
            content: accumulated,
          });
        } else {
          // Fallback: no stream chunks arrived; perform non-stream request
          try {
            const fullText = await handleOpenAiRequest(ctx.session.messages);
            if (fullText && fullText.trim().length > 0) {
              try {
                await ctx.telegram.editMessageText(
                  ctx.chat.id,
                  placeholder.message_id,
                  undefined,
                  fullText
                );
              } catch (e2) {
                if (
                  !/message is not modified/i.test(
                    String(e2?.description || e2)
                  )
                ) {
                  try {
                    await ctx.reply(fullText);
                  } catch (_) {}
                }
              }
              ctx.session.messages.push({
                role: roles.ASSISTANT,
                content: fullText,
              });
            } else {
              try {
                await ctx.telegram.editMessageText(
                  ctx.chat.id,
                  placeholder.message_id,
                  undefined,
                  "Что-то я устал, надо поспать... Давай позже"
                );
              } catch (_) {}
            }
          } catch (_) {
            try {
              await ctx.telegram.editMessageText(
                ctx.chat.id,
                placeholder.message_id,
                undefined,
                "Что-то я устал, надо поспать... Давай позже"
              );
            } catch (_) {}
          }
        }
      };

      await streamOpenAiText(ctx.session.messages, {
        onDelta: async (delta) => {
          accumulated += delta;
          const now = Date.now();
          if (now - lastEditAt < 700) return; // throttle edits
          lastEditAt = now;
          try {
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              placeholder.message_id,
              undefined,
              accumulated
            );
          } catch (e) {
            // Ignore collisions / unchanged content
          }
        },
        onDone: async () => {
          await tryFinalize();
        },
        onError: async () => {
          await tryFinalize();
        },
      });
    }
  } catch (error) {
    await ctx.reply(`Ошибочка вышла: ${error.message}`);
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

const setMaleVoice = async (ctx) => {
  await checkSession(ctx);
  await ctx.reply("Ответы будут мужским голосом");
  ctx.session.parametres.voiceMale = true;
};

const setWomanVoice = async (ctx) => {
  await checkSession(ctx);
  await ctx.reply("Ответы будут женским голосом");
  ctx.session.parametres.voiceMale = false;
};

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

  bot.hears(menu.menuVoiceMan, setMaleVoice);
  bot.hears(menu.menuVoiceWoman, setWomanVoice);
  // removed dead handler for menuVoice (button is not present in main menu)

  // Realtime mini-app open button
  bot.hears(menu.menuRealtime, async (ctx) => {
    await checkSession(ctx);
    const baseUrl = (() => {
      try {
        const v = config.get("webapp.baseUrl");
        if (typeof v === "string" && v.trim().length > 0) return v.trim();
      } catch (_) {}
      return "http://localhost:3000";
    })();
    const url = `${baseUrl}/`;
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
        const text = await handleOpenAiVoice(mp3Path);
        await textHandler(ctx, text);
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
        const response = await handleOpenAiRequest(ctx.session.messages);
        await ctx.reply(response);
      }
    } catch (error) {
      console.log("Error message where bot.message ", error.message);
    }
  });
}
