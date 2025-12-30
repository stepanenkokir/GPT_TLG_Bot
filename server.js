import express from "express";
import cors from "cors";
import { getConfigValueWithDefault } from "./config/loader.js";
import { registerApiRoutes } from "./routes/api.js";
import { apiRateLimiter } from "./middleware/rateLimiter.js";

export function createHttpServer() {
  const app = express();
  app.use(cors());
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
