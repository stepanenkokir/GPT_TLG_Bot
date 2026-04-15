// Файл: index.js
import "./config/loader.js"; // Load environment variables first
import JokeSender from "./script/jokeSender.js";
import NewsSender from "./script/newsSender.js";
import { createHttpServer } from "./server.js";
import { launchTelegramBot } from "./bot.js";

// Launch HTTP API server
createHttpServer();

// Launch Telegram bot
launchTelegramBot();

// Background jobs
const jokeSender = new JokeSender("listToSendJoke.txt");
jokeSender.startDailyJob();

// News background jobs
const newsSender = new NewsSender("listToSendNews.txt");
newsSender.startDailyJob();
newsSender.startWeeklyJob();
