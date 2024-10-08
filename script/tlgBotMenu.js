import { Markup } from "telegraf";

export const menuNewSession    = 'Новая сессия'
export const menuRole          = 'Роль'
export const menuBack          = 'Назад'
export const menuVoice         = 'Голос'
export const menuVoiceMan      = 'Мужской'
export const menuVoiceWoman    = 'Женский'
export const menuVoiceRu       = 'Русский'
export const menuVoiceEn       = 'Английский'
export const menuVoiceSetL     = 'Задать язык'
export const menuImage         = 'Картинка'
export const menuImageImReal   = 'Реализм'
export const menuImageImSurr   = 'Рисунок'
export const menuSelectVoice   = 'Отвечать голосом'
export const menuSelectText    = 'Отвечать текстом'

const menuArr = [
    [menuNewSession], 
    [menuRole],
   // [menuVoice], 
    [menuImage],   
]

const voiceArr = [
    [menuSelectVoice],
    [menuVoiceMan,menuVoiceWoman], 
    [menuVoiceRu,menuVoiceEn,menuVoiceSetL],
    [menuBack],
]

const voiceArrText = [
    [menuSelectText],
    [menuVoiceMan,menuVoiceWoman], 
    [menuVoiceRu,menuVoiceEn,menuVoiceSetL],
    [menuBack],
]


const imageArr = [
    [menuImageImReal],
    [menuImageImSurr],
    [menuBack],
]

const extraMenuAdmin    = [...menuArr,['AdminPanel']]

export const mainMenu          = Markup.keyboard(menuArr).resize()
export const mainMenuAdmin     = Markup.keyboard(extraMenuAdmin).resize()
export const voiceMenu         = Markup.keyboard(voiceArr).resize()
export const voiceTextMenu     = Markup.keyboard(voiceArrText).resize()
export const imageMenu         = Markup.keyboard(imageArr).resize()