import { Server, Socket } from "socket.io";
import { Chess, Move } from "chess.js"; // Import Chess and Move
import { assignRandomAdvantage } from "./assignAdvantage";
import { Advantage } from "../shared/types";
import { handlePawnRush } from "./logic/advantages/pawnRush";
import { handleCastleMaster } from "./logic/advantages/castleMaster";
import { handleAutoDeflect } from "./logic/advantages/autoDeflect";

console.log("✅ setupSocketHandlers loaded");

// Module-level definition for ClientMovePayload
type ClientMovePayload = {
  from: string;
  to: string;
  special?: string;
  color?: 'white' | 'black'; // color is optional and can be 'white' or 'black'
  rookFrom?: string;
  rookTo?: string;
  promotion?: string;
};

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
  fen?: string; // Added FEN for server-side state
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
    console.log("🔌 A client connected:", socket.id);
    socket.on("joinRoom", (roomId: string) => { 
      const alreadyInRoom = rooms[roomId] &&
        (rooms[roomId].white === socket.id || rooms[roomId].black === socket.id);

        if (alreadyInRoom) {
          console.log(`⚠️ ${socket.id} already joined room ${roomId}`);
          return;
        }

      socket.join(roomId);
      console.log(`🔌 ${socket.id} is joining room ${roomId}`);
      
      if (!rooms[roomId]) {
        rooms[roomId] = { fen: new Chess().fen() };
        console.log(`[joinRoom] Room ${roomId} created with starting FEN: ${rooms[roomId].fen}`);
      }
      
      const room = rooms[roomId]; 

      if (!room.white) {
        room.white = socket.id;
        room.whiteAdvantage = assignRandomAdvantage();
        socket.emit("colorAssigned", "white");
        socket.emit("advantageAssigned", room.whiteAdvantage); 
        console.log(`⚪ Assigned ${socket.id} as white with advantage: ${room.whiteAdvantage.name}`);
      } else if (!room.black) {
        room.black = socket.id;
        room.blackAdvantage = assignRandomAdvantage();
        socket.emit("colorAssigned", "black");
        socket.emit("advantageAssigned", room.blackAdvantage);
        console.log(`⚫ Assigned ${socket.id} as black with advantage: ${room.blackAdvantage.name}`);
        io.to(roomId).emit("opponentJoined");
      } else {
        socket.emit("roomFull");
        console.log(`❌ Room ${roomId} is full`);
        return;
      }
      console.log(`✅ Room state:`, rooms[roomId]);

      socket.on("sendMove", ({ roomId, move: clientMoveData }) => {
        const room = rooms[roomId];
        if (!room || !room.fen || !room.white || !room.black) {
          console.error(`[sendMove] Room ${roomId} not found, no FEN, or incomplete (white: ${room?.white}, black: ${room?.black}, fen: ${room?.fen})`);
          socket.emit("serverError", { message: "Room not found or incomplete." });
          return;
        }

        const serverGame = new Chess(room.fen);
        const senderId = socket.id;
        let senderColor: "white" | "black" | null = null;
        let opponentColor: "white" | "black" | null = null;
        let opponentAdvantage: Advantage | undefined;

        if (senderId === room.white) {
          senderColor = "white";
          opponentColor = "black";
          opponentAdvantage = room.blackAdvantage;
        } else if (senderId === room.black) {
          senderColor = "black";
          opponentColor = "white";
          opponentAdvantage = room.whiteAdvantage;
        } else {
          console.error(`[sendMove] Sender ${senderId} not in room ${roomId}.`);
          socket.emit("serverError", { message: "You are not a player in this room." });
          return;
        }

        if (serverGame.turn() !== senderColor[0]) {
          console.warn(`[sendMove] Not ${senderColor}'s turn in room ${roomId}. Server FEN: ${room.fen}, Server turn: ${serverGame.turn()}, Sender claims: ${senderColor[0]}`);
          socket.emit("invalidMove", { message: "Not your turn.", move: clientMoveData });
          return;
        }
        
        let moveResult: Move | null = null; 
        let resultFen = room.fen; 

        // clientMoveData is initially 'unknown' or 'any' from socket.io
        // Cast it to our defined ClientMovePayload type
        const receivedMove = clientMoveData as ClientMovePayload;

        // TEST: Verify Castle Master server-side logic (king/rook moved, path clear/blocked, in check, through attacked squares).
        if (receivedMove.special?.startsWith("castle-master")) {
          if (senderColor === null) { 
            console.error(`[sendMove] senderColor is null before calling handleCastleMaster for room ${roomId}.`);
            socket.emit("serverError", { message: "Internal server error processing your move." });
            return;
          }
          const castleMasterResult = handleCastleMaster({
            game: serverGame,
            clientMoveData: receivedMove as any, // handleCastleMaster has specific type with required color, rookFrom, rookTo
            currentFen: room.fen,
            playerColor: senderColor[0] as 'w' | 'b',
          });
          moveResult = castleMasterResult.moveResult;
          resultFen = castleMasterResult.nextFen;
          if (!moveResult) {
             socket.emit("invalidMove", { message: "Invalid Castle Master move or server error.", move: clientMoveData });
            return;
          }
        } else if (receivedMove.special === "pawn_rush_manual") {
          // TEST: Verify Pawn Rush server-side logic with various pawn moves.
          if (senderColor === null) { 
            console.error(`[sendMove] senderColor is null before calling handlePawnRush for room ${roomId}. This should not happen.`);
            socket.emit("serverError", { message: "Internal server error processing your move." });
            return;
          }
          // handlePawnRush expects clientMoveData.color to be defined. 
          // The ClientMovePayload type has color as optional.
          // The handlePawnRush function itself checks if clientMoveData.color is present.
          const pawnRushResult = handlePawnRush({
            game: serverGame, 
            clientMoveData: receivedMove, // Pass receivedMove directly
            currentFen: room.fen, 
            playerColor: senderColor[0] as 'w' | 'b', 
          });
          moveResult = pawnRushResult.moveResult;
          resultFen = pawnRushResult.nextFen; 
          if (!moveResult) {
            socket.emit("invalidMove", { message: "Invalid Pawn Rush Manual move.", move: clientMoveData });
            return; 
          }
        } else {
          moveResult = serverGame.move({ 
              from: receivedMove.from, 
              to: receivedMove.to, 
              promotion: receivedMove.promotion as any 
          });
          if (moveResult) {
            resultFen = serverGame.fen();
          }
        }

        if (moveResult === null) {
          console.warn(`[sendMove] Invalid move by ${senderColor} (${senderId}) in room ${roomId}:`, receivedMove, `Server FEN: ${room.fen}`);
          socket.emit("invalidMove", { message: "Your move was deemed invalid by the server.", move: clientMoveData });
          return;
        }

        // TEST: Verify Auto Deflect server-side logic (knight moves, resulting in check/no check for opponent).
        const isDeflected = handleAutoDeflect({
          game: serverGame, 
          moveResult: moveResult, 
          opponentAdvantage: opponentAdvantage,
        });

        if (isDeflected) {
          console.log(`[sendMove] Knight move by ${senderColor} deflected by ${opponentColor}'s Auto Deflect in room ${roomId}.`);
          socket.emit("moveDeflected", { move: clientMoveData }); 
        } else {
          room.fen = resultFen; 
          console.log(`[sendMove] Move by ${senderColor} validated. New FEN for room ${roomId}: ${room.fen}`);
          socket.to(roomId).emit("receiveMove", clientMoveData); 
        }
      });
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
