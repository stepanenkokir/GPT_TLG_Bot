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
            'Семейная жизнь – шутки о буднях супругов, отношениях с тещей или свекровью, детских высказываниях.',
            'Работа и офис – курьезы на работе, смешные коллеги, начальник с "хорошим" чувством юмора.',
            'Бытовые мелочи – ремонт, покупки, коммунальные службы, разговоры соседей.',
            'Школа и учеба – учителя, экзамены, двоечники, контрольные, школьные проделки.',
            'Врачебная тема – пациенты и врачи, смешные диагнозы и советы по "лечению".',
            'Животные и их характер – коты как мудрецы, хитрые собаки, говорящие попугаи.',
            'Современные технологии – гаджеты, интернет, соцсети, проблемы с зумом и чатами.',
            'Спорт и ЗОЖ – начинающие спортсмены, тренировки в зале, несостоявшиеся диеты.',
            'Поездки и туризм – чемоданы, курорты, экскурсии, непредвиденные приключения в отпуске.',
            'Случайности и совпадения – неожиданные встречи, забавные ситуации в транспорте или на улице.',
        ]

        const currTheme = themes[Math.floor(Math.random() * themes.length)];
        const positiveFinish = "Вотъ. Даже если не очень понятно - улыбнись, я ведь старался. Хорошего дня. Если что - пиши, я буду ждать 😍"
        // Генерация анекдота
        const jokeMessage = await handleOpenAiRequest([
            { role: 'system', content: `Ты хороший рассказчик небольших анекдотов на русском языке` },
            { role: 'user', content: `Расскажи новый смешной анекдот: ${currTheme}` },
            { role: 'user', content: `Закончи позитивной фразой (переделай чтобы было похоже на ${positiveFinish})` },
        ])

        if (!jokeMessage) {
            console.error('Не удалось получить анекдот.')
            return
        }

        const sendMessage = `Утренний анекдотик от Дилана\n ${jokeMessage}`

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
