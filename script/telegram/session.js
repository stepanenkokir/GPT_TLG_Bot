import { handleError } from "../../utils/errorHandler.js";

export const roles = {
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

export const defaultParameters = () => ({
  setrole: false,
  answerVoice: false,
  drawImage: false,
  voiceLang: "Russian",
  useWebSearch: false,
});

const MAX_MESSAGES = 20;

export const trimMessages = (messages) => {
  if (!Array.isArray(messages) || messages.length <= MAX_MESSAGES + 1) {
    return messages;
  }

  const systemMessage = messages.find((m) => m.role === roles.SYSTEM);
  const otherMessages = messages.filter((m) => m.role !== roles.SYSTEM);
  const recentMessages = otherMessages.slice(-MAX_MESSAGES);

  return systemMessage ? [systemMessage, ...recentMessages] : recentMessages;
};

export const createNewSession = async (
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
    const fileId = stickersGvineaPig[randSticker];
    await ctx.replyWithSticker(fileId);
  } catch (error) {
    const { message } = handleError(error, {
      operation: "createNewSession",
      context: { chatId: ctx.chat?.id },
    });
    await ctx.reply(message).catch(() => {});
  }
};

export const checkSession = async (ctx) => {
  if (!ctx.session?.parametres) {
    await createNewSession(ctx);
    return false;
  }
  const currentTime = new Date();
  if (currentTime - new Date(ctx.session.created) > 60 * 60 * 1000) {
    await createNewSession(ctx);
    return false;
  }
  return true;
};
