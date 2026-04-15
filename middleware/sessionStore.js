/**
 * Session store abstraction
 * Currently implements in-memory storage
 * Can be easily extended to use Redis or other storage backends
 */

class MemorySessionStore {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Get session by key
   * @param {string} key - Session key (usually chatId)
   * @returns {Promise<any>} Session data or null
   */
  async get(key) {
    return this.sessions.get(key) || null;
  }

  /**
   * Set session data
   * @param {string} key - Session key
   * @param {any} value - Session data
   * @returns {Promise<void>}
   */
  async set(key, value) {
    this.sessions.set(key, value);
  }

  /**
   * Delete session
   * @param {string} key - Session key
   * @returns {Promise<void>}
   */
  async delete(key) {
    this.sessions.delete(key);
  }

  /**
   * Clear all sessions
   * @returns {Promise<void>}
   */
  async clear() {
    this.sessions.clear();
  }

  /**
   * Get all session keys
   * @returns {Promise<string[]>}
   */
  async keys() {
    return Array.from(this.sessions.keys());
  }
}

/**
 * Redis session store (prepared for future use)
 * To use Redis, uncomment and install: npm install redis
 * 
 * import { createClient } from 'redis';
 * 
 * class RedisSessionStore {
 *   constructor() {
 *     this.client = createClient({
 *       url: process.env.REDIS_URL || 'redis://localhost:6379'
 *     });
 *     this.client.on('error', (err) => console.error('Redis Client Error', err));
 *     this.client.connect();
 *   }
 * 
 *   async get(key) {
 *     const data = await this.client.get(`session:${key}`);
 *     return data ? JSON.parse(data) : null;
 *   }
 * 
 *   async set(key, value) {
 *     await this.client.setEx(`session:${key}`, 3600, JSON.stringify(value)); // 1 hour TTL
 *   }
 * 
 *   async delete(key) {
 *     await this.client.del(`session:${key}`);
 *   }
 * 
 *   async clear() {
 *     const keys = await this.client.keys('session:*');
 *     if (keys.length > 0) {
 *       await this.client.del(keys);
 *     }
 *   }
 * 
 *   async keys() {
 *     const keys = await this.client.keys('session:*');
 *     return keys.map(k => k.replace('session:', ''));
 *   }
 * }
 */

// Export the store instance
let sessionStore = null;

/**
 * Get session store instance
 * @returns {MemorySessionStore|RedisSessionStore} Session store instance
 */
export function getSessionStore() {
  if (!sessionStore) {
    // Use Redis if REDIS_URL is set, otherwise use memory
    if (process.env.REDIS_URL) {
      // Uncomment when Redis is ready:
      // sessionStore = new RedisSessionStore();
      // For now, fallback to memory:
      console.log("Redis URL detected but Redis store not implemented yet. Using memory store.");
      sessionStore = new MemorySessionStore();
    } else {
      sessionStore = new MemorySessionStore();
    }
  }
  return sessionStore;
}

/**
 * Reset session store (useful for testing)
 */
export function resetSessionStore() {
  sessionStore = null;
}

export { MemorySessionStore };

