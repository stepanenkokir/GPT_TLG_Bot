import express from "express";
import cors from "cors";
import { getConfigValueWithDefault } from "./config/loader.js";
import { registerApiRoutes } from "./routes/api.js";
import { apiRateLimiter } from "./middleware/rateLimiter.js";

const resolveTrustProxy = (value) => {
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value !== "string") return true;

  const trimmed = value.trim();
  if (!trimmed || /^\$\{.+\}$/.test(trimmed)) return true;
  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;
  return trimmed;
};

export function createHttpServer() {
  const app = express();
  const trustProxyRaw = getConfigValueWithDefault(
    "webapp.trustProxy",
    "WEBAPP_TRUST_PROXY",
    true
  );
  const trustProxy = resolveTrustProxy(trustProxyRaw);

  app.set("trust proxy", trustProxy);
  const allowedOrigin = getConfigValueWithDefault(
    "webapp.baseUrl",
    "WEBAPP_BASE_URL",
    "*"
  );
  app.use(cors({ origin: allowedOrigin }));
  app.use(express.json());

  // Apply rate limiting to all API routes
  app.use("/api/", apiRateLimiter);

  registerApiRoutes(app);

  const PORT = getConfigValueWithDefault("webapp.PORT", "WEBAPP_PORT", 3000);
  const server = app.listen(PORT, () => {
    console.log(`HTTP server listening on http://localhost:${PORT}`);
  });
  return { app, server };
}
