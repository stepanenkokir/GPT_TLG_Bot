// Файл: index.js
import { Telegraf, session } from 'telegraf'
import config from 'config'
import { createOpenAiInstance } from './script/openai.js'
import { setupBotCommands } from './script/telegramBot.js'
import { checkAuthUserImproved } from './middleware/checkAuthUser.js'
import { createLogger, format, transports }from 'winston'

// Настройки конфигурации из config/default.json
const botToken = config.get('telegramBot.token')

const { combine, timestamp, printf } = format

// Инициализация OpenAI
createOpenAiInstance()

// Инициализация бота
const bot = new Telegraf(botToken)

// Log format
const logFormat = printf(({ level, message, timestamp }) => {
    return `[${timestamp}] ${level}: ${message}`;
})

const saveLog = async (ctx, next) => {
    if (ctx && ctx.message && ctx.message.text){           
        const userLogger = createLogger({
            format: combine(timestamp(), logFormat),
            transports: [new transports.Console(), new transports.File({ filename: `log/${ctx.chat.id}.log` })],
        })        
        userLogger.info(`message: ${ctx.message.text}`)
    }
    next()
}

// Middleware для проверки авторизации
bot.use(session())
bot.use(checkAuthUserImproved, saveLog)

// Настройка команд бота
setupBotCommands(bot)

bot.launch().then(() => {
    console.log('Бот запущен')
});

// Остановка бота корректно при завершении процесса
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
