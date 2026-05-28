// Файл: index.js
import "./config/loader.js"; // Load environment variables first
import JokeSender from "./script/jokeSender.js";
import NewsSender from "./script/newsSender.js";
import { createHttpServer } from "./server.js";
import { launchTelegramBot } from "./bot.js";
import { getConfigValueWithDefault } from "./config/loader.js";

async function main() {
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

  await launchTelegramBot();

  const jokeSender = new JokeSender("listToSendJoke.txt");
  jokeSender.startDailyJob();

  const newsSender = new NewsSender("listToSendNews.txt");
  newsSender.startDailyJob();
  newsSender.startWeeklyJob();
}

main().catch((error) => {
  console.error("Application startup failed:", error);
  process.exit(1);
});
