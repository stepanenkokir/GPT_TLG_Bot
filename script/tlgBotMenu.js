import { Markup } from "telegraf";
import { getConfigValueWithDefault } from "../config/loader.js";

export const menuNewSession = "Новая сессия";
export const menuRole = "Роль";
export const menuBack = "Назад";
export const menuImage = "Картинка";
export const menuSelectVoice = "Отвечать голосом";
export const menuSelectText = "Отвечать текстом";
export const menuRealtime = "Realtime";
export const menuWebSearch = "Web Search";
export const menuVerbosity = "Детализация";

export const VERBOSITY_LEVELS = {
  brief: { label: "Лаконично", tokens: 400, hint: "Answer very briefly, 2-4 sentences max." },
  medium: { label: "Средне", tokens: 1000, hint: "Answer with moderate detail." },
  detailed: { label: "Подробно", tokens: 2500, hint: "Answer in detail with examples and explanations." },
};

export const buildVerbosityInlineKeyboard = (current) =>
  Markup.inlineKeyboard(
    Object.entries(VERBOSITY_LEVELS).map(([key, { label }]) => [
      Markup.button.callback(
        key === current ? `✅ ${label}` : label,
        `set_verbosity_${key}`
      ),
    ])
  );

export const isRealtimeEnabled = getConfigValueWithDefault(
  "webapp.realtimeEnabled",
  "REALTIME_ENABLED",
  false
);

const menuArr = [
  [menuNewSession],
  [menuRole],
  // голосовое меню скрыто, не показываем кнопку
  [menuImage],
  [menuWebSearch],
  [menuVerbosity],
  ...(isRealtimeEnabled ? [[menuRealtime]] : []),
];

const voiceArr = [[menuSelectVoice], [menuBack]];

const voiceArrText = [[menuSelectText], [menuBack]];

export const mainMenu = Markup.keyboard(menuArr).resize();
export const voiceMenu = Markup.keyboard(voiceArr).resize();
export const voiceTextMenu = Markup.keyboard(voiceArrText).resize();

export const buildRealtimeInlineKeyboard = (url) =>
  Markup.inlineKeyboard([[Markup.button.webApp("Открыть Realtime", url)]]);

export const buildWebSearchInlineKeyboard = (enabled) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback(
        enabled ? "✅ Web Search ВКЛ" : "❌ Web Search ВЫКЛ",
        "toggle_websearch"
      ),
    ],
  ]);
