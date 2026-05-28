import axios from "axios";
import http from "http";
import https from "https";

/**
 * Configured HTTP client with connection pooling and optimized settings
 * Reuse connections for better performance
 */

// Create HTTP agent with keep-alive for connection pooling
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
});

// Create HTTPS agent with keep-alive for connection pooling
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
});

/**
 * Configured axios instance with connection pooling
 * Use this instead of default axios for better performance
 */
export const httpClient = axios.create({
  timeout: 30000, // 30 seconds timeout
  maxRedirects: 5,
  httpAgent,
  httpsAgent,
  headers: {
    "User-Agent": "TelegramBot/1.0",
  },
});

/**
 * Cleanup agents (call on application shutdown)
 */
export function cleanupHttpAgents() {
  httpAgent.destroy();
  httpsAgent.destroy();
}

// Cleanup on process exit
process.on("SIGTERM", cleanupHttpAgents);
process.on("SIGINT", cleanupHttpAgents);

