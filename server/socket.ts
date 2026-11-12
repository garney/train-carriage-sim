import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { config } from "./config.js";
import { supabaseAuth } from "./supabase.js";

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (typeof token !== "string") {
      next(new Error("Missing auth token"));
      return;
    }

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) {
      next(new Error("Invalid auth token"));
      return;
    }

    socket.data.userId = data.user.id;
    socket.data.isAdmin = config.adminUserIds.has(data.user.id);
    next();
  });

  io.on("connection", (socket) => {
    socket.join("chat:general");
    socket.join(`user:${socket.data.userId}`);
    socket.emit("hello", { userId: socket.data.userId });
  });

  return io;
}
