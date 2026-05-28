import { getConfigValueWithDefault } from "./loader.js";
import { VOICE_ROLES } from "./voiceRoles.js";

export const DEFAULT_REALTIME_ROLE = "default";

export const REALTIME_ROLES = Object.freeze({
  default: {
    name: "Просто Дилан",
    voice: "echo",
    instructions: VOICE_ROLES.default,
  },
  doctor: {
    name: "Доктор наук",
    voice: "ash",
    instructions: VOICE_ROLES.doctor,
  },
  teacher: {
    name: "Учительница начальной школы",
    voice: "sage",
    instructions: VOICE_ROLES.teacher,
  },
  hooligan: {
    name: "Умный хулиган",
    voice: "alloy",
    instructions: VOICE_ROLES.hooligan,
  },
});

export const REALTIME_ROLE_KEYS = Object.keys(REALTIME_ROLES);

const DEFAULT_REALTIME_MODEL = "gpt-realtime-2";
const LEGACY_REALTIME_MODEL_PREFIXES = ["gpt-4o-realtime-preview"];

export function getRealtimeModel() {
  const model = getConfigValueWithDefault(
    "openai.realtimeModel",
    "OPENAI_REALTIME_MODEL",
    DEFAULT_REALTIME_MODEL
  );

  if (
    typeof model !== "string" ||
    /^\$\{.+\}$/.test(model) ||
    LEGACY_REALTIME_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix))
  ) {
    return DEFAULT_REALTIME_MODEL;
  }

  return model;
}

export function getRealtimeRoleConfig(role = DEFAULT_REALTIME_ROLE) {
  return REALTIME_ROLES[role] ?? REALTIME_ROLES[DEFAULT_REALTIME_ROLE];
}

export function createRealtimeSessionConfig({
  role = DEFAULT_REALTIME_ROLE,
  userName = "Unknown",
} = {}) {
  const roleConfig = getRealtimeRoleConfig(role);

  return {
    type: "realtime",
    model: getRealtimeModel(),
    instructions: `User: ${userName}. ${roleConfig.instructions}`,
    audio: {
      input: {
        transcription: {
          model: "whisper-1",
        },
      },
      output: {
        voice: roleConfig.voice,
      },
    },
  };
}
