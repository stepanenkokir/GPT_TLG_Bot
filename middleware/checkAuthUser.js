import fs from "fs/promises";
import { resolve } from "path";

let authorizedUsers = [];
let lastLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // перезагружать не чаще раза в 5 минут
let loadingPromise = null;

const AUTH_FILE_PATH = resolve(process.cwd(), "authorizedUsers.txt");

const ensureAuthorizedUsersFileExists = async () => {
  try {
    await fs.access(AUTH_FILE_PATH);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      await fs.writeFile(AUTH_FILE_PATH, "[]", "utf-8");
    } else {
      console.error("Error accessing authorized users file:", err);
    }
  }
};

const loadAuthorizedUsers = async () => {
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
  try {
    await ensureAuthorizedUsersFileExists();
    const data = await fs.readFile(AUTH_FILE_PATH, "utf-8");
    try {
      const parsed = JSON.parse(data);
      authorizedUsers = Array.isArray(parsed) ? parsed : [];
      if (!Array.isArray(parsed)) {
        await fs.writeFile(AUTH_FILE_PATH, "[]", "utf-8");
      }
    } catch {
      authorizedUsers = [];
      await fs.writeFile(AUTH_FILE_PATH, "[]", "utf-8");
    }
    lastLoadedAt = Date.now();
  } catch (err) {
    console.error("Error loading authorized users:", err);
    throw err;
  } finally {
    loadingPromise = null;
  }
  })();

  return loadingPromise;
};

const loadIfStale = async () => {
  if (Date.now() - lastLoadedAt > CACHE_TTL_MS) {
    await loadAuthorizedUsers();
  }
};

// Load initially
loadAuthorizedUsers().catch(() => {});

export const checkAuthUserImproved = async (ctx, next) => {
  try {
    await loadIfStale();
    const userId = ctx.from.id;
    if (authorizedUsers.includes(userId)) {
      await next();
    } else {
      await ctx.reply(
        "Извините, вы не авторизованы для использования этого бота."
      );
    }
  } catch (err) {
    console.error("Error checking user authorization:", err);
    await ctx.reply(
      "Временная ошибка проверки авторизации. Попробуйте позже."
    );
  }
};

export const isUserAuthorized = async (userId) => {
  try {
    await loadIfStale();
    return authorizedUsers.includes(userId);
  } catch {
    return false;
  }
};
