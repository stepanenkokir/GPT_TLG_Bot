export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export function splitTextIntoChunks(text, limit = TELEGRAM_MAX_MESSAGE_LENGTH) {
  if (typeof text !== "string") text = String(text ?? "");
  if (text.length <= limit) return [text];

  const chunks = [];

  // Первый проход — по абзацам
  const paragraphs = text.split(/\n\n+/);
  let current = "";
  const pushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= limit) {
      current = candidate;
    } else if (para.length <= limit) {
      pushCurrent();
      current = para;
    } else {
      // Второй проход — по строкам
      pushCurrent();
      const lines = para.split(/\n/);
      let block = "";
      for (const line of lines) {
        const cand = block ? `${block}\n${line}` : line;
        if (cand.length <= limit) {
          block = cand;
        } else if (line.length <= limit) {
          if (block) chunks.push(block);
          block = line;
        } else {
          // Третий проход — жёсткая резка
          if (block) chunks.push(block);
          for (let i = 0; i < line.length; i += limit) {
            chunks.push(line.slice(i, i + limit));
          }
          block = "";
        }
      }
      if (block) chunks.push(block);
    }
  }
  pushCurrent();

  return chunks;
}

export async function replyInChunks(ctx, text, extra = {}) {
  const parts = splitTextIntoChunks(text);
  for (const part of parts) {
    // eslint-disable-next-line no-await-in-loop
    await ctx.reply(part, extra);
  }
}

export async function sendMessageInChunks(telegram, chatId, text, extra = {}) {
  const parts = splitTextIntoChunks(text);
  for (const part of parts) {
    // eslint-disable-next-line no-await-in-loop
    await telegram.sendMessage(chatId, part, extra);
  }
}
