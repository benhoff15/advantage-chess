import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { setupSocketHandlers } from "./socketHandlers";
import { playerStatsRouter } from "./playerStatsRoutes";

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Mount stats route
app.use("/stats", playerStatsRouter);

// Socket handlers
setupSocketHandlers(io);

server.listen(4000, () => {
  console.log("Server running on http://localhost:4000");
});
