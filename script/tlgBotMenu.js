import { Markup } from "telegraf";

export const menuNewSession = "Новая сессия";
export const menuRole = "Роль";
export const menuBack = "Назад";
export const menuImage = "Картинка";
export const menuSelectVoice = "Отвечать голосом";
export const menuSelectText = "Отвечать текстом";
export const menuRealtime = "Realtime";

const menuArr = [
  [menuNewSession],
  [menuRole],
  // голосовое меню скрыто, не показываем кнопку
  [menuImage],
  [menuRealtime],
];

const voiceArr = [[menuSelectVoice], [menuBack]];

const voiceArrText = [[menuSelectText], [menuBack]];

export const mainMenu = Markup.keyboard(menuArr).resize();
export const voiceMenu = Markup.keyboard(voiceArr).resize();
export const voiceTextMenu = Markup.keyboard(voiceArrText).resize();

export const buildRealtimeInlineKeyboard = (url) =>
  Markup.inlineKeyboard([[Markup.button.webApp("Открыть Realtime", url)]]);
