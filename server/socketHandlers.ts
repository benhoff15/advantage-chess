import { Server, Socket } from "socket.io";
import { assignRandomAdvantage } from "./assignAdvantage";
import { Advantage } from "../shared/types";

type PlayerStats = {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  elo: number;
};

type RoomState = {
  white?: string;
  black?: string;
  whiteAdvantage?: Advantage;
  blackAdvantage?: Advantage;
};

const rooms: Record<string, RoomState> = {};
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

export function setupSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    socket.on("joinRoom", (roomId: string) => {
      socket.join(roomId);
      const room = rooms[roomId] || {};

      if (!room.white) {
        room.white = socket.id;
        room.whiteAdvantage = assignRandomAdvantage();
        socket.emit("colorAssigned", "white");
      } else if (!room.black) {
        room.black = socket.id;
        room.blackAdvantage = assignRandomAdvantage();
        socket.emit("colorAssigned", "black");
      } else {
        socket.emit("roomFull");
        return;
      }

      rooms[roomId] = room;
      socket.to(roomId).emit("opponentJoined");
    });

    socket.on("disconnect", () => {
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
      if (!room?.white || !room?.black) return;

      const winnerId = winnerColor === "white" ? room.white : room.black;
      const loserId = winnerColor === "white" ? room.black : room.white;

      updateElo(winnerId, loserId);

      io.to(roomId).emit("revealAdvantages", {
        whiteAdvantage: room.whiteAdvantage,
        blackAdvantage: room.blackAdvantage,
        winnerColor
      });
    });

    socket.on("gameDraw", ({ roomId }) => {
      const room = rooms[roomId];
      if (!room?.white || !room?.black) return;

      updateElo(room.white, room.black, true);

      io.to(roomId).emit("revealAdvantages", {
        whiteAdvantage: room.whiteAdvantage,
        blackAdvantage: room.blackAdvantage,
        winnerColor: null
      });
    });
  });
}
