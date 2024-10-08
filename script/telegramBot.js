// Файл: telegramBot.js
import { session } from 'telegraf'
import {code} from "telegraf/format"
import { createOpenAiImage, handleOpenAiRequest, handleOpenAiVoice, handleOpenAiRequestVoice } from './openai.js'
import { ogg } from "./ogg.js"
import * as menu from "./tlgBotMenu.js"

const roles = {
    ASSISTANT: 'assistant',
    USER: 'user',
    SYSTEM: 'system',
}

const parametres = {
    setrole         : false,
    answerVoice     : false,
    drawImage       : false,
    realImage       : true,
    voiceLang       : 'Russian',
    voiceMale       :  true
}

const setRole = async (ctx) =>{
    checkSession(ctx)
    session[ctx.chat.id].parametres.setrole = true
    await ctx.reply('Скажите, кто я сейчас?')
}

const createNewSession = async ( ctx, 
    currRole = 'Ты весёлый помощник по имени Дилан. Ты стараешься отвечать с юмором'
    ) => {
    await ctx.telegram.sendChatAction(ctx.chat.id, "typing")
    session[ctx.chat.id] = {
        messages    : [],
        created     : new Date(),
        parametres  : parametres
    }
    session[ctx.chat.id].messages = [{role : roles.SYSTEM, content : currRole }]
    await ctx.reply(code('Ok'))
}

const checkSession = (ctx) => {
    console.log("Check session")
    if (!session[ctx.chat.id]?.messages){
        createNewSession(ctx)
        return false
    }
    const currentTime  = new Date()

    if (currentTime - session[ctx.chat.id].created > 30 * 60 * 1000) {
        createNewSession(ctx)
        return false
    }
    return true
}

const textHandler = async (ctx, userMessage) => {
    
    checkSession(ctx)
        
    try {

        if (session[ctx.chat.id].parametres.setrole){
            createNewSession(ctx, userMessage)
            session[ctx.chat.id].parametres.setrole = false
            return
        }

        if (session[ctx.chat.id].parametres.drawImage){
            await ctx.telegram.sendChatAction(ctx.chat.id, "upload_photo")           
            const response = await createOpenAiImage( userMessage, session[ctx.chat.id].parametres.realImage)
            session[ctx.chat.id].parametres.drawImage = false
            await ctx.reply(response)
            return
        }

        console.log("ANSWER VOICE = ",session[ctx.chat.id].parametres.answerVoice)

        if (session[ctx.chat.id].parametres.answerVoice){
            await ctx.telegram.sendChatAction(ctx.chat.id, "record_voice")
            const requestString = `${userMessage} Отвечай, пожалуйста на ${session[ctx.chat.id].parametres.voiceLang} язык`
            session[ctx.chat.id].messages.push({role:roles.USER, content: requestString})
            const response = await handleOpenAiRequestVoice(session[ctx.chat.id].messages, session[ctx.chat.id].parametres.voiceMale)
            session[ctx.chat.id].messages.push({role:roles.ASSISTANT, content:response})
            if (response ){
                await ctx.replyWithVoice({source:response.buffer})
            }else {
                await ctx.reply("Что-то я устал, надо поспать... Попробуй спросить меня попозже")
            }
        } else {
            await ctx.telegram.sendChatAction(ctx.chat.id, "typing")
            session[ctx.chat.id].messages.push({role:roles.USER, content: userMessage})
            const response = await handleOpenAiRequest(session[ctx.chat.id].messages)
            session[ctx.chat.id].messages.push({role:roles.ASSISTANT, content:response})
            if (response ){
                await ctx.reply(response, { parse_mode: 'Markdown' })
            }else {
                await ctx.reply("Что-то я устал, надо поспать... Попробуй спросить меня попозже")
            }
        }

       

    } catch (error) {

        await ctx.reply(`Ошибочка вышла: ${error.message}`)

    }
}

const realImage = async (ctx) => {
    checkSession(ctx)
    await ctx.reply('Опиши детально что нарисовать как фото')
    session[ctx.chat.id].parametres.drawImage = true
    session[ctx.chat.id].parametres.realImage = true
}

const surrImage = async (ctx) => {
    checkSession(ctx)
    await ctx.reply('Опиши детально что нарисовать')
    session[ctx.chat.id].parametres.drawImage = true
    session[ctx.chat.id].parametres.realImage = false
}

const selectVoice = async (ctx) => {
    checkSession(ctx)
    console.log("SELECT VOICE")
    await ctx.reply('Ответы будут голосом', menu.voiceTextMenu)
    session[ctx.chat.id].parametres.answerVoice = true
}
const selectText = async (ctx) => {
    checkSession(ctx)
    console.log("SELECT TEXT")
    await ctx.reply('Ответы будут текстом', menu.voiceMenu)
    session[ctx.chat.id].parametres.answerVoice = false
}

const setMaleVoice = async (ctx) => {
    checkSession(ctx)
    console.log("SELECT Male")
    await ctx.reply('Ответы будут мужским голосом')
    session[ctx.chat.id].parametres.voiceMale = true
}

const setWomanVoice = async (ctx) => {
    checkSession(ctx)
    console.log("SELECT FEMALE")
    await ctx.reply('Ответы будут женским голосом')
    session[ctx.chat.id].parametres.voiceMale = false
}

const welcomeMsg = async (ctx)=>{
    await ctx.reply('Привет! Я Дилан. Задай мне свой вопрос, и я попробую на него ответить.',  menu.mainMenu)
}

const backMsg = async (ctx)=>{
    ctx.reply('Ok',  menu.mainMenu)
}

export function setupBotCommands(bot) {
    bot.start(async (ctx) => {
        console.log(`Start bot for ${ctx.chat.id}`)
        createNewSession(ctx)
        welcomeMsg(ctx)
    })

    bot.hears(menu.menuNewSession, (ctx) => createNewSession(ctx))
    bot.hears(menu.menuRole, setRole)
    bot.hears(menu.menuBack, backMsg)

    bot.hears(menu.menuImageImReal, realImage)
    bot.hears(menu.menuImageImSurr, surrImage)    

    bot.hears(menu.menuSelectVoice, selectVoice)
    bot.hears(menu.menuSelectText, selectText)

    bot.hears(menu.menuVoiceMan, setMaleVoice)
    bot.hears(menu.menuVoiceWoman, setWomanVoice)

    bot.hears(menu.menuImage, async (ctx) => {await ctx.reply('Меню картинок:', menu.imageMenu)})
    bot.hears(menu.menuVoice, async (ctx) => {await ctx.reply('Меню голоса:', menu.voiceMenu)})

    // Обработка сообщений
    bot.on('text', async (ctx) => {
        const userMessage = ctx.message.text
        await textHandler(ctx, userMessage)
    })

    bot.on('message', async (ctx) => {
        const userId = ctx.chat.id
        try {
            if (ctx.message.voice){ 
                await ctx.telegram.sendChatAction(ctx.chat.id, "upload_voice")             
                const oggLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id)
                const oggPath = await ogg.create(oggLink.href, userId,'ogg')
                const mp3Path = await ogg.toMP3(oggPath, userId)
                const text = await  handleOpenAiVoice(mp3Path)
                await textHandler(ctx, text)
            }

            if (ctx.message.photo){
                await ctx.telegram.sendChatAction(ctx.chat.id, "upload_photo")
                const caption = ctx.message.caption ? ctx.message.caption : 'Фото из публичного доступа. Попробуй рассказать что изображено на этом фото. Это не приватная информация.'     
                const photoUrl = await ctx.telegram.getFileLink(ctx.message.photo[3].file_id)
                createNewSession(ctx, 'Ты весёлый художник по имени Дилан. Ты стараешься увидеть мелкие детали в рисунках и описывать их с умеренной иронией')
                session[userId].messages.push({
                    role:roles.USER, 
                    content: [
                        { type    : "text",       text : caption },
                        { type    : "image_url",  image_url: { url: photoUrl.href } }
                    ]
                })
                const response = await handleOpenAiRequest(session[ctx.chat.id].messages)
                await ctx.reply(response)              
            }
        } catch (error) {
            console.log("Error message where bot.message ", error.message)
        }
    })
}