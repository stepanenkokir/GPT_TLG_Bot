// Файл: newsSender.js
import cron from "node-cron";
import { handleOpenAiRequestWithWebSearch } from "./openai.js";
import { getTelegramBot } from "./telegramBotInstance.js";
import { sendMessageInChunks } from "./telegramUtils.js";
import { BaseSender } from "./baseSender.js";

// Класс для рассылки новостей
class NewsSender extends BaseSender {
  constructor(filePath) {
    super(filePath);
    // Start watching file for changes
    this.startWatching();
  }

  async sendNewsToAllUsers() {
    const currentDate = new Date();
    const dateStr = currentDate.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const dayOfMonth = currentDate.getDate();
    const month = currentDate.getMonth() + 1;

    console.log(`Генерация новостей о праздниках и событиях на ${dateStr}`);

    // Генерация новостного сводки с использованием web-search
    const newsResponse = await handleOpenAiRequestWithWebSearch([
      {
        role: "system",
        content: `You are a cheerful and engaging news editor and English teacher for Russian speakers. You create fun and interesting news summaries about holidays, celebrations, and special events that help Russians learn English while staying informed about cultural events. Your task is to:
1. Find what holidays, celebrations, and special events are happening today in Russia and the USA
2. Include fun facts, interesting traditions, and cultural background
3. Create an engaging summary in Russian with key English terms in parentheses
4. Make it cheerful, positive, and entertaining
5. Include 3-5 main items about what people celebrate today in both countries
6. Add vocabulary notes for important English words related to holidays and celebrations
7. End with an encouraging note about learning English through cultural events`,
      },
      {
        role: "user",
        content: `Find fun and interesting information about what holidays, celebrations, and special events are happening today (${dateStr}, ${month}/${dayOfMonth}) in Russia and the United States. Include:
- Official holidays and observances
- Fun unofficial holidays and celebrations
- Historical events that happened on this date
- Cultural traditions and how people celebrate
- Interesting facts and stories

Create a cheerful and engaging news digest in Russian with English terms in parentheses. Make it entertaining and educational.`,
      },
      {
        role: "user",
        content: `Format the news as a structured digest with clear sections for Russia and USA, include fun facts, and finish with a positive note about learning English through cultural events.`,
      },
    ]);

    if (!newsResponse || !newsResponse.text) {
      console.error(
        "Не удалось получить новости:",
        newsResponse?.error || "Неизвестная ошибка"
      );
      return;
    }

    const sendMessage = `🎉 Весёлые новости и праздники от Дилана\n📅 ${dateStr}\n\n${newsResponse.text}`;

    // Отправка новостей всем пользователям
    const bot = getTelegramBot();
    for (const userId of this.userIds) {
      try {
        await sendMessageInChunks(bot.telegram, userId, sendMessage, {
          parse_mode: "HTML",
          disable_web_page_preview: false,
        });
        console.log(`Новости отправлены пользователю ${userId}`);
      } catch (error) {
        console.error(
          `Ошибка отправки новостей пользователю ${userId}:`,
          error
        );
      }
    }
  }

  async sendCustomNews(topic) {
    const currentDate = new Date().toLocaleDateString("ru-RU");

    console.log(`Генерация кастомных новостей по теме: ${topic}`);

    const newsResponse = await handleOpenAiRequestWithWebSearch([
      {
        role: "system",
        content: `You are a professional news editor and English teacher for Russian speakers. Create an engaging news summary about the requested topic that helps Russians learn English while staying informed.`,
      },
      {
        role: "user",
        content: `Find the latest news about "${topic}" for today ${currentDate}. Create a news digest in Russian with English terms in parentheses. Include vocabulary explanations for key terms and format as a structured digest.`,
      },
    ]);

    return newsResponse;
  }

  startDailyJob() {
    console.log("Запуск планировщика новостей в ", new Date());

    // Утренние новости в 9:00
    cron.schedule(
      "0 9 * * *",
      async () => {
        console.log("Запуск утренней рассылки новостей");
        await this.loadUserIds();
        await this.sendNewsToAllUsers();
      },
      {
        timezone: "America/Los_Angeles",
      }
    );

    // Вечерние новости в 22:00
    cron.schedule(
      "47 20 * * *",
      async () => {
        console.log("Запуск вечерней рассылки новостей");
        await this.loadUserIds();
        await this.sendNewsToAllUsers();
      },
      {
        timezone: "America/Los_Angeles",
      }
    );
  }

  startWeeklyJob() {
    // Еженедельная сводка по воскресеньям в 10:00
    cron.schedule(
      "* 10 * * 0",
      async () => {
        console.log("Запуск еженедельной сводки новостей...");
        await this.loadUserIds();

        const weeklyDigest = await handleOpenAiRequestWithWebSearch([
          {
            role: "system",
            content: `Create a comprehensive weekly news digest in Russian with English terms. Cover the most important events of the past week across different categories: technology, economy, science, politics, and culture. Help Russian speakers learn English through current events.`,
          },
          {
            role: "user",
            content: `Create a weekly news digest for the past week. Include the most significant global events with English vocabulary notes.`,
          },
        ]);

        if (weeklyDigest && weeklyDigest.text) {
          const weeklyMessage = `📰 Еженедельная сводка новостей от Дилана\n\n${weeklyDigest.text}`;

          const bot = getTelegramBot();
          for (const userId of this.userIds) {
            try {
              await sendMessageInChunks(bot.telegram, userId, weeklyMessage, {
                parse_mode: "HTML",
              });
            } catch (error) {
              console.error(
                `Ошибка отправки еженедельной сводки пользователю ${userId}:`,
                error
              );
            }
          }
        }
      },
      {
        timezone: "America/Los_Angeles",
      }
    );
  }
}

export default NewsSender;
