/**
 * Centralized error handling utility
 * Provides user-friendly error messages and proper error logging
 */

/**
 * Map error types to user-friendly messages
 */
const ERROR_MESSAGES = {
  RATE_LIMIT: "Слишком много запросов. Подождите немного перед следующим сообщением.",
  NETWORK_ERROR: "Проблемы с сетью. Проверьте подключение к интернету и попробуйте позже.",
  API_ERROR: "Ошибка при обращении к API. Попробуйте позже.",
  VALIDATION_ERROR: "Некорректные данные. Проверьте введенную информацию.",
  AUTH_ERROR: "Ошибка авторизации. Убедитесь, что вы авторизованы.",
  TIMEOUT_ERROR: "Превышено время ожидания. Попробуйте еще раз.",
  UNKNOWN_ERROR: "Произошла ошибка. Попробуйте позже или обратитесь к администратору.",
};

/**
 * Determine error type from error object
 * @param {Error} error - Error object
 * @returns {string} Error type key
 */
function getErrorType(error) {
  if (!error) return "UNKNOWN_ERROR";

  const status = error?.status || error?.response?.status;
  const message = String(error?.message || "").toLowerCase();

  // Rate limit errors
  if (status === 429 || message.includes("rate limit")) {
    return "RATE_LIMIT";
  }

  // Network errors
  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("etimedout") ||
    message.includes("econnrefused") ||
    message.includes("socket hang up")
  ) {
    return status === 408 || message.includes("timeout")
      ? "TIMEOUT_ERROR"
      : "NETWORK_ERROR";
  }

  // API errors
  if (status >= 400 && status < 500) {
    return status === 401 || status === 403 ? "AUTH_ERROR" : "API_ERROR";
  }

  if (status >= 500) {
    return "API_ERROR";
  }

  // Validation errors
  if (message.includes("validation") || message.includes("invalid")) {
    return "VALIDATION_ERROR";
  }

  return "UNKNOWN_ERROR";
}

/**
 * Get user-friendly error message
 * @param {Error} error - Error object
 * @param {string} customMessage - Optional custom message
 * @returns {string} User-friendly error message
 */
export function getUserErrorMessage(error, customMessage = null) {
  if (customMessage) {
    return customMessage;
  }

  const errorType = getErrorType(error);
  return ERROR_MESSAGES[errorType] || ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * Log error with context
 * @param {Error} error - Error object
 * @param {object} context - Additional context (userId, chatId, etc.)
 * @param {string} operation - Operation name where error occurred
 */
export function logError(error, context = {}, operation = "unknown") {
  const errorInfo = {
    message: error?.message || String(error),
    stack: error?.stack,
    status: error?.status || error?.response?.status,
    operation,
    context,
    timestamp: new Date().toISOString(),
  };

  console.error(`[ERROR] ${operation}:`, errorInfo);

  // In production, you might want to send to error tracking service
  // Example: Sentry.captureException(error, { extra: errorInfo });
}

/**
 * Handle error and return user-friendly response
 * @param {Error} error - Error object
 * @param {object} options - Options
 * @param {string} options.operation - Operation name
 * @param {object} options.context - Additional context
 * @param {string} options.customMessage - Custom user message
 * @returns {{message: string, logged: boolean}} Error handling result
 */
export function handleError(error, options = {}) {
  const { operation = "unknown", context = {}, customMessage = null } = options;

  // Log error with context
  logError(error, context, operation);

  // Get user-friendly message
  const userMessage = getUserErrorMessage(error, customMessage);

  return {
    message: userMessage,
    logged: true,
  };
}

/**
 * Wrap async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {object} options - Error handling options
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn, options = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const { message } = handleError(error, options);
      throw new Error(message);
    }
  };
}

