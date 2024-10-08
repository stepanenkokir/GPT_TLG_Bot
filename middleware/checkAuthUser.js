import fs from 'fs/promises'

let authorizedUsers = []; // Initialize authorized users list

const loadAuthorizedUsers = async () => {
    try {
        const data = await fs.readFile('authorizedUsers.txt', 'utf-8')
        authorizedUsers = JSON.parse(data)        
    } catch (err) {
        console.error('Ошибка при загрузке авторизованных пользователей:', err)
    }
}

// Load the authorized users initially
loadAuthorizedUsers()

export const checkAuthUserImproved = async (ctx, next) => {
    try {
        const userId = ctx.from.id
        if (authorizedUsers.includes(userId)) {
            await next()
        } else {
            await ctx.reply('Извините, вы не авторизованы для использования этого бота.')
        }
    } catch (err) {
        console.error('Ошибка при проверке авторизации пользователя:', err)
    }
}