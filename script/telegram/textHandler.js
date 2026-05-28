import {
  createOpenAiImage,
  handleOpenAiRequest,
  handleOpenAiRequestWithWebSearch,
  handleOpenAiVoice,
  handleOpenAiRequestVoice,
} from "../openai.js";
import { replyInChunks } from "../telegramUtils.js";
import { handleError } from "../../utils/errorHandler.js";
import {
  checkSession,
  createNewSession,
  roles,
  trimMessages,
} from "./session.js";

export const textHandler = async (ctx, userMessage) => {
  await checkSession(ctx);
  try {
    if (ctx.session.parametres.setrole) {
      await createNewSession(ctx, userMessage);
      ctx.session.parametres.setrole = false;
      return;
    }

    if (ctx.session.parametres.drawImage) {
      ctx.session.parametres.drawImage = false;
      const chatActionInterval = setInterval(
        () => ctx.telegram.sendChatAction(ctx.chat.id, "upload_photo").catch(() => {}),
        4000
      );
      await ctx.telegram.sendChatAction(ctx.chat.id, "upload_photo");
      let response;
      try {
        response = await createOpenAiImage(userMessage);
      } finally {
        clearInterval(chatActionInterval);
      }
      if (response?.buffer) {
        await ctx.replyWithPhoto({ source: response.buffer });
      } else {
        await ctx.reply(
          response?.userMessage || "Не удалось получить изображение. Попробуйте позже."
        );
      }
      return;
    }

    if (ctx.session.parametres.answerVoice) {
      await ctx.telegram.sendChatAction(ctx.chat.id, "record_voice");
      const requestString = `${userMessage} Отвечай, пожалуйста на ${ctx.session.parametres.voiceLang} язык`;
      ctx.session.messages.push({ role: roles.USER, content: requestString });

      const trimmedMessages = trimMessages(ctx.session.messages);
      const response = await handleOpenAiRequestVoice(trimmedMessages, ctx.chat.id);
      if (response?.text) {
        ctx.session.messages.push({
          role: roles.ASSISTANT,
          content: response.text,
        });
        await ctx.replyWithVoice({ source: response.buffer });
      } else {
        await ctx.reply(
          response?.userMessage || "Что-то я устал, надо поспать... Давай позже"
        );
      }
    } else {
      await ctx.telegram.sendChatAction(ctx.chat.id, "typing");
      ctx.session.messages.push({ role: roles.USER, content: userMessage });

      const trimmedMessages = trimMessages(ctx.session.messages);

      const useWeb = Boolean(ctx.session.parametres.useWebSearch);
      const handler = useWeb
        ? handleOpenAiRequestWithWebSearch
        : handleOpenAiRequest;
      const { text, error, userMessage: userErrMessage } = await handler(trimmedMessages);

      if (error) {
        await replyInChunks(
          ctx,
          userErrMessage || "Ошибка при обращении к API. Попробуйте позже."
        );
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

export const handleVoiceMessage = async (ctx) => {
  const userId = ctx.chat.id;
  await ctx.telegram.sendChatAction(ctx.chat.id, "upload_voice");
  const oggLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
  return { userId, oggLink };
};

export const handlePhotoMessage = async (ctx) => {
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

  const chatActionInterval = setInterval(
    () => ctx.telegram.sendChatAction(ctx.chat.id, "upload_photo").catch(() => {}),
    4000
  );
  await ctx.telegram.sendChatAction(ctx.chat.id, "upload_photo");

  try {
    const trimmedMessages = trimMessages(ctx.session.messages);
    const {
      text: photoResp,
      error: photoErr,
      userMessage: photoUserMessage,
    } = await handleOpenAiRequest(trimmedMessages, { maxTokens: 4000 });
    await ctx.reply(
      photoErr ? photoUserMessage || "Ошибка при обращении к API. Попробуйте позже." : photoResp || "Пустой ответ"
    );
  } finally {
    clearInterval(chatActionInterval);
  }
};

export { handleOpenAiVoice };
