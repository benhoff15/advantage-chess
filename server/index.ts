import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // Update if frontend port is different
    methods: ["GET", "POST"],
  },
});

// Track room player assignments
const rooms: Record<string, { white?: string; black?: string }> = {};

type PlayerStats = {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  elo: number;
};

const playerStats: Record<string, PlayerStats> = {};

function updateElo(winnerId: string, loserId: string, isDraw = false) {
  const getOrInit = (id: string): PlayerStats => {
    return playerStats[id] ||= { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, elo: 1200 };
  };

  const winner = getOrInit(winnerId);
  const loser = getOrInit(loserId);

  const K = 32;
  const expectedScore = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

  const expectedWin = expectedScore(winner.elo, loser.elo);
  const expectedLose = expectedScore(loser.elo, winner.elo);

  if (isDraw) {
    winner.elo += K * (0.5 - expectedWin);
    loser.elo += K * (0.5 - expectedLose);
    winner.draws += 1;
    loser.draws += 1;
  } else {
    winner.elo += K * (1 - expectedWin);
    loser.elo += K * (0 - expectedLose);
    winner.wins += 1;
    loser.losses += 1;
  }

  winner.gamesPlayed++;
  loser.gamesPlayed++;
}


io.on("connection", (socket) => {
  socket.on("joinRoom", (roomId: string) => {
    socket.join(roomId);
    const room = rooms[roomId] || {};

    if (!room.white) {
      room.white = socket.id;
      socket.emit("colorAssigned", "white");
    } else if (!room.black) {
      room.black = socket.id;
      socket.emit("colorAssigned", "black");
    } else {
      socket.emit("roomFull");
      return;
    }

    rooms[roomId] = room;
    socket.to(roomId).emit("opponentJoined");
  });

  socket.on("disconnect", () => {
    // Find and remove player from their room
    for (const [roomId, players] of Object.entries(rooms)) {
      if (players.white === socket.id) {
        delete rooms[roomId].white;
        socket.to(roomId).emit("opponentDisconnected");
      } else if (players.black === socket.id) {
        delete rooms[roomId].black;
        socket.to(roomId).emit("opponentDisconnected");
      }
    }

    console.log("🔴 Disconnected:", socket.id);
  });

    socket.on("gameOver", ({ roomId, winnerColor }) => {
    const room = rooms[roomId];
    if (!room) return;

    const winnerId = winnerColor === "white" ? room.white : room.black;
    const loserId  = winnerColor === "white" ? room.black : room.white;
    
    if (winnerId && loserId) {
      updateElo(winnerId, loserId);
      console.log(`🏁 ELO updated. Winner: ${winnerId}, Loser: ${loserId}`);
    }
  });

  socket.on("gameDraw", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room?.white || !room?.black) return;
    updateElo(room.white, room.black, true);
  });
});



server.listen(4000, () => {
  console.log("🚀 Server running on http://localhost:4000");
});

app.get("/stats/:playerId", (req, res) => {
  const stats = playerStats[req.params.playerId];
  if (!stats) return res.status(404).json({ error: "Player not found" });
  res.json(stats);
});
