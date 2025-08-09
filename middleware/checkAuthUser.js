import fs from "fs/promises";
import { resolve } from "path";

let authorizedUsers = []; // Initialize authorized users list

const AUTH_FILE_PATH = resolve(process.cwd(), "authorizedUsers.txt");

const ensureAuthorizedUsersFileExists = async () => {
  try {
    await fs.access(AUTH_FILE_PATH);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      await fs.writeFile(AUTH_FILE_PATH, "[]", "utf-8");
    } else {
      console.error(
        "Ошибка доступа к файлу авторизованных пользователей:",
        err
      );
    }
  }
};

const loadAuthorizedUsers = async () => {
  try {
    await ensureAuthorizedUsersFileExists();
    const data = await fs.readFile(AUTH_FILE_PATH, "utf-8");
    try {
      authorizedUsers = JSON.parse(data);
      if (!Array.isArray(authorizedUsers)) {
        authorizedUsers = [];
        await fs.writeFile(AUTH_FILE_PATH, "[]", "utf-8");
      }
    } catch (parseErr) {
      // Если файл повреждён — переинициализируем
      authorizedUsers = [];
      await fs.writeFile(AUTH_FILE_PATH, "[]", "utf-8");
    }
  } catch (err) {
    console.error("Ошибка при загрузке авторизованных пользователей:", err);
  }
};

// Load the authorized users initially
loadAuthorizedUsers();

export const checkAuthUserImproved = async (ctx, next) => {
  try {
    const userId = ctx.from.id;
    if (authorizedUsers.includes(userId)) {
      await next();
    } else {
      await ctx.reply(
        "Извините, вы не авторизованы для использования этого бота."
      );
    }
  } catch (err) {
    console.error("Ошибка при проверке авторизации пользователя:", err);
  }
};

export const isUserAuthorized = (userId) => {
  try {
    return authorizedUsers.includes(userId);
  } catch (_) {
    return false;
  }
};
