// Файл: newsSender.js
import fs from "fs/promises";
import cron from "node-cron";
import { handleOpenAiRequestWithWebSearch } from "./openai.js";
import { Telegraf } from "telegraf";
import config from "config";

// Инициализация бота для отправки сообщений
const botToken = config.get("telegramBot.token");
const bot = new Telegraf(botToken);

// Класс для рассылки новостей
class NewsSender {
  constructor(filePath) {
    this.filePath = filePath;
    this.userIds = [];
  }

  async loadUserIds() {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      this.userIds = JSON.parse(data);
      console.log("Список пользователей для новостей загружен:", this.userIds);
    } catch (error) {
      console.error(
        "Ошибка при загрузке списка пользователей для новостей:",
        error
      );
    }
  }

  async sendNewsToAllUsers() {
    const newsTopics = [
      "technology and AI developments",
      "global economy and markets",
      "science and research breakthroughs",
      "environmental and climate news",
      "space exploration and astronomy",
      "medical and health innovations",
      "cybersecurity and digital privacy",
      "renewable energy developments",
      "automotive and electric vehicles",
      "entertainment and pop culture",
      "sports highlights",
      "international politics and diplomacy",
    ];

    const currentTopic =
      newsTopics[Math.floor(Math.random() * newsTopics.length)];
    const currentDate = new Date().toLocaleDateString("ru-RU");

    console.log(`Генерация новостей по теме: ${currentTopic}`);

    // Генерация новостного сводки с использованием web-search
    const newsResponse = await handleOpenAiRequestWithWebSearch([
      {
        role: "system",
        content: `You are a professional news editor and English teacher for Russian speakers. You create engaging news summaries that help Russians learn English while staying informed. Your task is to:
1. Find the latest and most relevant news on the given topic
2. Create a concise summary in Russian with key English terms in parentheses
3. Include 3-5 main news items with brief explanations
4. Add vocabulary notes for important English words
5. End with an encouraging note about learning English through news`,
      },
      {
        role: "user",
        content: `Find the latest news about ${currentTopic} for today ${currentDate}. Create a news digest in Russian with English terms in parentheses. Include vocabulary explanations for key terms.`,
      },
      {
        role: "user",
        content: `Format the news as a structured digest with clear sections and finish with a positive note about continuous learning and being available for questions.`,
      },
    ]);

    if (!newsResponse || !newsResponse.text) {
      console.error(
        "Не удалось получить новости:",
        newsResponse?.error || "Неизвестная ошибка"
      );
      return;
    }

    const sendMessage = `📰 Изучаем английский через новости от Дилана\n${currentDate}\n\n${newsResponse.text}`;

    // Отправка новостей всем пользователям
    for (const userId of this.userIds) {
      try {
        await bot.telegram.sendMessage(userId, sendMessage, {
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

    // Вечерние новости в 18:00
    cron.schedule(
      "0 18 * * *",
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
      "0 10 * * 0",
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

          for (const userId of this.userIds) {
            try {
              await bot.telegram.sendMessage(userId, weeklyMessage, {
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
