import dotenv from "dotenv";
import config from "config";

// Load environment variables from .env file
dotenv.config();

/**
 * Get configuration value with fallback to environment variables
 * Priority: process.env > config file
 * @param {string} path - Config path (e.g., "telegramBot.token")
 * @param {string} envVar - Environment variable name (e.g., "TELEGRAM_BOT_TOKEN")
 * @returns {any} Configuration value
 */
export function getConfigValue(path, envVar) {
  // First try environment variable
  if (process.env[envVar] !== undefined) {
    const value = process.env[envVar];
    // Try to parse boolean strings
    if (value === "true") return true;
    if (value === "false") return false;
    // Try to parse numbers
    if (!isNaN(value) && value !== "") {
      const num = Number(value);
      if (!isNaN(num)) return num;
    }
    return value;
  }
  
  // Fallback to config file
  try {
    const value = config.get(path);
    // If value is a template string like "${VAR}", try to resolve it
    if (typeof value === "string" && value.startsWith("${") && value.endsWith("}")) {
      const envName = value.slice(2, -1);
      if (process.env[envName]) {
        return process.env[envName];
      }
    }
    return value;
  } catch (error) {
    throw new Error(`Configuration missing: ${path} or ${envVar} environment variable`);
  }
}

/**
 * Get configuration value with default
 * @param {string} path - Config path
 * @param {string} envVar - Environment variable name
 * @param {any} defaultValue - Default value if not found
 * @returns {any} Configuration value or default
 */
export function getConfigValueWithDefault(path, envVar, defaultValue) {
  try {
    return getConfigValue(path, envVar);
  } catch {
    return defaultValue;
  }
}

/**
 * Initialize configuration - ensures all required values are present
 */
export function initializeConfig() {
  const required = [
    { path: "telegramBot.token", env: "TELEGRAM_BOT_TOKEN" },
    { path: "openai.apiKey", env: "OPENAI_API_KEY" },
  ];

  const missing = [];
  for (const { path, env } of required) {
    try {
      getConfigValue(path, env);
    } catch {
      missing.push(`${path} or ${env}`);
    }
  }

  if (missing.length > 0) {
    console.warn("Warning: Missing required configuration:", missing.join(", "));
    console.warn("Please set environment variables or update config/default.json");
  }
}

// Auto-initialize on import
initializeConfig();

