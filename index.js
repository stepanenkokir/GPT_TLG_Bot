// Файл: index.js
import JokeSender from "./script/jokeSender.js";
import { createHttpServer } from "./server.js";
import { launchTelegramBot } from "./bot.js";

// Launch HTTP API server
createHttpServer();

// Launch Telegram bot
launchTelegramBot();

// Background jobs
const jokeSender = new JokeSender("listToSendJoke.txt");
jokeSender.startDailyJob();
