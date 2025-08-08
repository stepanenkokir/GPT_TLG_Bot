// Файл: telegramBot.js
import { code } from "telegraf/format";
import {
  createOpenAiImage,
  handleOpenAiRequest,
  handleOpenAiVoice,
  handleOpenAiRequestVoice,
} from "./openai.js";
import { ogg } from "./ogg.js";
import * as menu from "./tlgBotMenu.js";

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
  realImage: true,
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
      const response = await createOpenAiImage(
        userMessage,
        ctx.session.parametres.realImage
      );
      ctx.session.parametres.drawImage = false;
      await ctx.reply(response);
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
        await ctx.reply(
          "Что-то я устал, надо поспать... Попробуй спросить меня попозже"
        );
      }
    } else {
      await ctx.telegram.sendChatAction(ctx.chat.id, "typing");
      ctx.session.messages.push({ role: roles.USER, content: userMessage });
      const response = await handleOpenAiRequest(ctx.session.messages);
      if (response) {
        ctx.session.messages.push({ role: roles.ASSISTANT, content: response });
        await ctx.reply(response, { parse_mode: "Markdown" });
      } else {
        await ctx.reply(
          "Что-то я устал, надо поспать... Попробуй спросить меня попозже"
        );
      }
    }
  } catch (error) {
    await ctx.reply(`Ошибочка вышла: ${error.message}`);
  }
};

const realImage = async (ctx) => {
  await checkSession(ctx);
  await ctx.reply("Опиши детально что нарисовать как фото");
  ctx.session.parametres.drawImage = true;
  ctx.session.parametres.realImage = true;
};

const surrImage = async (ctx) => {
  await checkSession(ctx);
  await ctx.reply("Опиши детально что нарисовать");
  ctx.session.parametres.drawImage = true;
  ctx.session.parametres.realImage = false;
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

  bot.hears(menu.menuImageImReal, realImage);
  bot.hears(menu.menuImageImSurr, surrImage);

  bot.hears(menu.menuSelectVoice, selectVoice);
  bot.hears(menu.menuSelectText, selectText);

  bot.hears(menu.menuVoiceMan, setMaleVoice);
  bot.hears(menu.menuVoiceWoman, setWomanVoice);

  bot.hears(menu.menuImage, async (ctx) => {
    await ctx.reply("Меню картинок:", menu.imageMenu);
  });
  bot.hears(menu.menuVoice, async (ctx) => {
    await ctx.reply("Меню голоса:", menu.voiceMenu);
  });

  // Обработка сообщений
  bot.on("text", async (ctx) => {
    const userMessage = ctx.message.text;
    await textHandler(ctx, userMessage);
  });

  bot.on("message", async (ctx) => {
    console.log(ctx.message.sticker);
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
