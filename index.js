// Файл: index.js
import "./config/loader.js"; // Load environment variables first
import JokeSender from "./script/jokeSender.js";
import NewsSender from "./script/newsSender.js";
import { createHttpServer } from "./server.js";
import { launchTelegramBot } from "./bot.js";
import { getConfigValueWithDefault } from "./config/loader.js";

const realtimeEnabled = getConfigValueWithDefault(
  "webapp.realtimeEnabled",
  "REALTIME_ENABLED",
  false
);

if (realtimeEnabled) {
  createHttpServer();
} else {
  console.log("Realtime is disabled (REALTIME_ENABLED=false). WebApp server not started.");
}

// Launch Telegram bot
launchTelegramBot();

// Background jobs
const jokeSender = new JokeSender("listToSendJoke.txt");
jokeSender.startDailyJob();

// News background jobs
const newsSender = new NewsSender("listToSendNews.txt");
newsSender.startDailyJob();
newsSender.startWeeklyJob();
