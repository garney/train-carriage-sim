import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { Server } from "socket.io";
import { CarriageSimulation } from "./simulation-server.js";

const root = process.cwd();
const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8" };
const server = createServer((request, response) => {
  const requestPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const file = normalize(join(root, requestPath));
  if (!file.startsWith(root) || !existsSync(file)) { response.writeHead(404).end("Not found"); return; }
  response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control":"no-store" });
  createReadStream(file).pipe(response);
});
const io = new Server(server, { serveClient: true });
const simulations = new Map(["T1", "T4", "T9"].map((line) => [line, new CarriageSimulation(line)]));
const sendSnapshot = (socket, line) => socket.emit("simulation:snapshot", simulations.get(line).snapshot());
io.on("connection", (socket) => {
  socket.data.line = "T1"; sendSnapshot(socket, socket.data.line);
  socket.on("simulation:watch", (line) => { if (simulations.has(line)) { socket.data.line = line; sendSnapshot(socket, line); } });
  socket.on("simulation:pause", () => { const sim = simulations.get(socket.data.line); sim.state.paused = !sim.state.paused; });
  socket.on("simulation:rush", () => simulations.get(socket.data.line).arrive(8));
  socket.on("simulation:step", (milliseconds) => {
    const sim = simulations.get(socket.data.line);
    const steps = Math.max(1, Math.min(600, Math.round(Number(milliseconds) / (1000 / 60))));
    for (let i = 0; i < steps; i += 1) sim.tick(1 / 60);
    sendSnapshot(socket, socket.data.line);
  });
});
let previous = Date.now();
setInterval(() => { const now = Date.now(), dt = Math.min(0.05, (now - previous) / 1000); previous = now; simulations.forEach((simulation) => simulation.tick(dt)); io.sockets.sockets.forEach((socket) => sendSnapshot(socket, socket.data.line || "T1")); }, 50);
const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`Carriage Watch socket server running at http://localhost:${port}`));
