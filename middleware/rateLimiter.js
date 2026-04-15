import rateLimit from "express-rate-limit";

/**
 * Rate limiter for API endpoints
 * Limits: 100 requests per 15 minutes per IP
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Слишком много запросов с этого IP, попробуйте позже.",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Strict rate limiter for sensitive endpoints
 * Limits: 10 requests per 15 minutes per IP
 */
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: "Превышен лимит запросов. Попробуйте позже.",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter middleware for Telegram bot
 * Uses a simple in-memory store to track requests per user
 */
class BotRateLimiter {
  constructor(maxRequests = 30, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map(); // userId -> { count, resetAt }
  }

  /**
   * Check if user has exceeded rate limit
   * @param {number} userId - Telegram user ID
   * @returns {boolean} True if rate limit exceeded
   */
  isRateLimited(userId) {
    const now = Date.now();
    const userData = this.requests.get(userId);

    if (!userData || now > userData.resetAt) {
      // Reset or create new window
      this.requests.set(userId, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return false;
    }

    if (userData.count >= this.maxRequests) {
      return true;
    }

    userData.count++;
    return false;
  }

  /**
   * Get remaining requests for user
   * @param {number} userId - Telegram user ID
   * @returns {number} Remaining requests
   */
  getRemaining(userId) {
    const userData = this.requests.get(userId);
    if (!userData || Date.now() > userData.resetAt) {
      return this.maxRequests;
    }
    return Math.max(0, this.maxRequests - userData.count);
  }

  /**
   * Clean up old entries (call periodically)
   */
  cleanup() {
    const now = Date.now();
    for (const [userId, data] of this.requests.entries()) {
      if (now > data.resetAt) {
        this.requests.delete(userId);
      }
    }
  }
}

export { BotRateLimiter };

// Create bot rate limiter instance
export const botRateLimiter = new BotRateLimiter(30, 60000); // 30 requests per minute

// Cleanup old entries every 5 minutes
setInterval(() => {
  botRateLimiter.cleanup();
}, 5 * 60 * 1000);

/**
 * Middleware for Telegram bot rate limiting
 * @param {object} ctx - Telegraf context
 * @param {function} next - Next middleware
 */
export const botRateLimitMiddleware = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) {
    return next();
  }

  if (botRateLimiter.isRateLimited(userId)) {
    const remaining = botRateLimiter.getRemaining(userId);
    await ctx.reply(
      `Превышен лимит запросов. Подождите немного перед следующим сообщением.`
    );
    return;
  }

  return next();
};

