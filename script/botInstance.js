let botInstance = null;

export function setBotInstance(bot) {
  botInstance = bot || null;
}

export function getBotInstance() {
  return botInstance;
}
