import express from "express";
import cors from "cors";
import { getConfigValueWithDefault } from "./config/loader.js";
import { registerApiRoutes } from "./routes/api.js";
import { apiRateLimiter } from "./middleware/rateLimiter.js";

export function createHttpServer() {
  const app = express();
  const trustProxy = getConfigValueWithDefault(
    "webapp.trustProxy",
    "WEBAPP_TRUST_PROXY",
    true
  );

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
