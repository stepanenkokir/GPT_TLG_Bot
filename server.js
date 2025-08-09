import express from "express";
import cors from "cors";
import config from "config";
import { registerApiRoutes } from "./routes/api.js";

export function createHttpServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  registerApiRoutes(app);

  const PORT = config.has("webapp.PORT") ? config.get("webapp.PORT") : 3000;
  const server = app.listen(PORT, () => {
    console.log(`HTTP server listening on http://localhost:${PORT}`);
  });
  return { app, server };
}
