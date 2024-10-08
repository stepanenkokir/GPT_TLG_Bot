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
        // Генерация анекдота
        const jokeMessage = await handleOpenAiRequest([{ role: 'system', content: 'Сгенерируй смешной анекдот' }])

        if (!jokeMessage) {
            console.error('Не удалось получить анекдот.')
            return
        }

        const sendMessage = `Утренний анекдотик от Дилана\n ${jokeMessage}`

        // Отправка анекдота всем пользователям
        for (const userId of this.userIds) {
            try {
                await bot.telegram.sendMessage(userId, sendMessage)
                await bot.telegram.sendMessage(userId, "Хорошего дня. Если что - обращайтесь 😍")
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
