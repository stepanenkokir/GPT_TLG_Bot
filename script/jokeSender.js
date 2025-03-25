// Файл: jokeSender.js
import fs from 'fs/promises'
import cron from 'node-cron'
import { handleOpenAiRequest } from './openai.js'
import { Telegraf } from 'telegraf'
import config from 'config'

// Инициализация бота для отправки сообщений
const botToken = config.get('telegramBot.token')
const bot = new Telegraf(botToken)

// Класс для рассылки анекдотов
class JokeSender {
    constructor(filePath) {
        this.filePath = filePath
        this.userIds = []
    }

    async loadUserIds() {
        try {
            const data = await fs.readFile(this.filePath, 'utf-8')
            this.userIds = JSON.parse(data)
            console.log('Список пользователей загружен:', this.userIds)
        } catch (error) {
            console.error('Ошибка при загрузке списка пользователей:', error)
        }
    }

    async sendJokeToAllUsers() {

        const themes = [
 'Family Life – Jokes about the daily lives of spouses, in-law relationships (mother-in-law or father-in-law), and funny things kids say.',
  'Work and Office – Workplace mishaps, funny coworkers, and bosses with a "great" sense of humor.',
  'Everyday Nuances – Home repairs, shopping, utility services, and neighborly conversations.',
  'School and Studying – Teachers, exams, underachievers, pop quizzes, and school pranks.',
  'Medical Humor – Patients and doctors, funny diagnoses, and questionable medical advice.',
  'Animals and Their Personalities – Cats as wise beings, sneaky dogs, and talkative parrots.',
  'Modern Technology – Gadgets, the internet, social media, Zoom fails, and chat mishaps.',
  'Sports and Fitness – Beginner athletes, gym workouts, and failed diet attempts.',
  'Travel and Tourism – Packing suitcases, vacation resorts, guided tours, and unexpected travel adventures.',
  'Coincidences and Randomness – Unexpected encounters, funny situations on public transport or the street.',
  'Dating and Relationships – Awkward first dates, online dating fails, and relationship quirks.',
  'Social Media Trends – Viral challenges, TikTok fails, and influencer culture.',
  'Gaming and Gamers – Glitches, rage quits, and funny in-game moments.',
  'Food and Cooking – Kitchen disasters, weird food combinations, and restaurant mishaps.',
  'Politics and Current Events – Satirical takes on politicians, elections, and global news.',
  'Celebrities and Pop Culture – Celebrity gossip, award show blunders, and movie/TV references.',
  'Environmental Issues – Climate change jokes, recycling fails, and eco-friendly struggles.',
  'Remote Work Life – Working from home, Zoom meetings in pajamas, and dealing with distractions.',
  'Parenting Challenges – Sleep-deprived parents, toddler tantrums, and school projects gone wrong.',
  'Fitness Trends – Yoga fails, Peloton mishaps, and over-the-top health fads.'
        ]

        const currTheme = themes[Math.floor(Math.random() * themes.length)];
        const positiveFinish = "Вотъ. Даже если не очень понятно - улыбнись, я ведь старался. Хорошего дня. Если что - пиши, я буду ждать 😍"
        // Генерация анекдота
        const jokeMessage = await handleOpenAiRequest([
            { role: 'system', content: `You're an awesome Eanglish teacher for russians and also joke teller. You create short, hilarious jokes on any topic. First, you translate the joke into Russian, keeping in mind modern Russian slang and cultural references, and then in new line you include the original English version in parentheses. ` },
            { role: 'user', content: `Расскажи новый смешной анекдот: ${currTheme} и объясни его соль по русски если есть игра слов в английском варианте` },
            { role: 'user', content: `Закончи позитивной фразой и добавь, что жаждешь общения и готов отвечать на вопросы` },
        ])

        if (!jokeMessage) {
            console.error('Не удалось получить анекдот.')
            return
        }

        const sendMessage = `Учим английский по анекдотам от Дилана\n ${jokeMessage}`

        // Отправка анекдота всем пользователям
        for (const userId of this.userIds) {
            try {
                await bot.telegram.sendMessage(userId, sendMessage)              
                console.log(`Анекдот отправлен пользователю ${userId}`)
            } catch (error) {
                console.error(`Ошибка отправки анекдота пользователю ${userId}:`, error)
            }
        }
    }

    startDailyJob() {
        console.log("Start some at ", new Date())
        cron.schedule('0 8 * * *', async () => {
            console.log('Запуск ежедневной отправки анекдотов в 8 утра...')
            await this.loadUserIds()
            await this.sendJokeToAllUsers()
        }, {
            timezone: 'America/Los_Angeles'
        })
    }
}

export default JokeSender
