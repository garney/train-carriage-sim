import path from "node:path";
import http from "node:http";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createApiRouter } from "./routes.js";
import { assertServerConfig, config } from "./config.js";
import { createSocketServer } from "./socket.js";

assertServerConfig();

const app = express();
const server = http.createServer(app);
createSocketServer(server);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", createApiRouter());

if (config.nodeEnv === "production") {
  const clientDist = path.resolve(process.cwd(), "client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
    root: path.resolve(process.cwd(), "client")
  });
  app.use(vite.middlewares);
}

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Carriage Watch listening on http://0.0.0.0:${config.port}`);
});
