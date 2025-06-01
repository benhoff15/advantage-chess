import { Server, Socket } from "socket.io";
import { Chess, Move } from "chess.js"; // Import Chess and Move
import { assignRandomAdvantage } from "./assignAdvantage";
import { Advantage } from "../shared/types";

console.log("✅ setupSocketHandlers loaded");

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
        // Initialize room with starting FEN when the first player joins
        rooms[roomId] = { fen: new Chess().fen() };
        console.log(`[joinRoom] Room ${roomId} created with starting FEN: ${rooms[roomId].fen}`);
      }
      
      const room = rooms[roomId]; // room will exist here

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

      // Server-side move validation and Auto-Deflect logic
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
        // let opponentId: string | null = null; // Not strictly needed for this logic
        let opponentColor: "white" | "black" | null = null;
        let opponentAdvantage: Advantage | undefined;

        if (senderId === room.white) {
          senderColor = "white";
          // opponentId = room.black;
          opponentColor = "black";
          opponentAdvantage = room.blackAdvantage;
        } else if (senderId === room.black) {
          senderColor = "black";
          // opponentId = room.white;
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
        
        let moveResult: Move | null = null; // Use chess.js Move type
        let resultFen = room.fen; // Store the FEN after the move is applied on serverGame

        // Type for incoming move data (matches client's special move structure)
        type ClientMovePayload = {
            from: string; to: string; special?: string; color?: string; 
            rookFrom?: string; rookTo?: string; promotion?: string;
        };
        const receivedMove = clientMoveData as ClientMovePayload;

        if (receivedMove.special?.startsWith("castle-master")) {
          if (!receivedMove.color || !receivedMove.rookFrom || !receivedMove.rookTo || receivedMove.color !== senderColor) {
            console.error(`[sendMove] Invalid Castle Master move received from ${senderId}, missing/mismatched data:`, receivedMove);
            socket.emit("invalidMove", { message: "Invalid Castle Master data.", move: clientMoveData });
            return;
          }
          const castlingPlayerChessJsColor = receivedMove.color === "white" ? "w" : "b";

          // (Assuming client-side canCastle checks were sufficient for validity regarding paths/check states)
          serverGame.remove(receivedMove.from as any);
          serverGame.remove(receivedMove.rookFrom as any);
          serverGame.put({ type: "k", color: castlingPlayerChessJsColor }, receivedMove.to as any);
          serverGame.put({ type: "r", color: castlingPlayerChessJsColor }, receivedMove.rookTo as any);

          let fenParts = serverGame.fen().split(" ");
          fenParts[0] = serverGame.board().map(rank => {
            let empty = 0; let fenRow = "";
            rank.forEach(sq => {
              if (sq === null) { empty++; } 
              else {
                if (empty > 0) { fenRow += empty; empty = 0; }
                fenRow += sq.color === 'w' ? sq.type.toUpperCase() : sq.type.toLowerCase();
              }
            });
            if (empty > 0) fenRow += empty;
            return fenRow;
          }).join('/');
          fenParts[1] = (receivedMove.color === "white") ? "b" : "w";
          let currentCastlingRights = fenParts[2];
          if (receivedMove.color === "white") currentCastlingRights = currentCastlingRights.replace("K", "").replace("Q", "");
          else currentCastlingRights = currentCastlingRights.replace("k", "").replace("q", "");
          if (currentCastlingRights === "") currentCastlingRights = "-";
          fenParts[2] = currentCastlingRights;
          fenParts[3] = "-"; 
          fenParts[4] = "0"; 
          const currentFullMove = parseInt(fenParts[5], 10);
          if (receivedMove.color === "black") fenParts[5] = (currentFullMove + 1).toString();
          
          const nextFen = fenParts.join(" ");
          try {
            serverGame.load(nextFen);
            if (serverGame.fen() !== nextFen) {
              console.warn(`[sendMove] Castle Master FEN mismatch on server for room ${roomId}: "${serverGame.fen()}" vs "${nextFen}". Using loaded FEN.`);
            }
            // Simulate a moveResult for history/deflection check
            moveResult = { 
              piece: 'k', flags: 'c', // 'c' for castle, though chess.js uses 'k'/'q'
              from: receivedMove.from as any, to: receivedMove.to as any,
              color: castlingPlayerChessJsColor,
              san: receivedMove.to === 'g1' || receivedMove.to === 'g8' ? 'O-O' : 'O-O-O', // Approximate SAN
            } as Move;
            resultFen = serverGame.fen();
          } catch (e) {
            console.error(`[sendMove] Error loading FEN for Castle Master on server, room ${roomId}:`, e, `FEN: ${nextFen}`);
            socket.emit("invalidMove", { message: "Server error processing Castle Master FEN.", move: clientMoveData });
            return;
          }
        } else if (receivedMove.special === "pawn_rush_manual") {
          if (!receivedMove.from || !receivedMove.to || !receivedMove.color || receivedMove.color !== senderColor) {
            console.error(`[sendMove] Invalid Pawn Rush Manual move received from ${senderId}, missing/mismatched data:`, receivedMove);
            socket.emit("invalidMove", { message: "Invalid Pawn Rush Manual data.", move: clientMoveData });
            return;
          }
          const pawnChessJsColor = receivedMove.color === "white" ? "w" : "b";

          // (Assuming client-side path clear checks were sufficient)
          serverGame.remove(receivedMove.from as any);
          serverGame.put({ type: 'p', color: pawnChessJsColor }, receivedMove.to as any);

          let fenParts = serverGame.fen().split(" ");
          fenParts[0] = serverGame.board().map(rank => { // FEN row logic (same as Castle Master)
            let empty = 0; let fenRow = "";
            rank.forEach(sq => {
              if (sq === null) { empty++; } 
              else {
                if (empty > 0) { fenRow += empty; empty = 0; }
                fenRow += sq.color === 'w' ? sq.type.toUpperCase() : sq.type.toLowerCase();
              }
            });
            if (empty > 0) fenRow += empty;
            return fenRow;
          }).join('/');
          
          fenParts[1] = (receivedMove.color === "white") ? "b" : "w"; // Toggle turn
          // fenParts[2] (castling rights) are preserved from current serverGame.fen()
          fenParts[3] = "-"; // En passant square
          fenParts[4] = "0"; // Halfmove clock
          
          const currentFullMove = parseInt(fenParts[5], 10);
          if (receivedMove.color === "black") {
            fenParts[5] = (currentFullMove + 1).toString();
          }
          
          const nextFen = fenParts.join(" ");
          try {
            serverGame.load(nextFen);
            if (serverGame.fen() !== nextFen) {
              console.warn(`[sendMove] Pawn Rush Manual FEN mismatch on server for room ${roomId}: "${serverGame.fen()}" vs "${nextFen}". Using loaded FEN.`);
            }
            moveResult = {
              piece: 'p', flags: 'b', // 'b' for two-square push
              from: receivedMove.from as any, to: receivedMove.to as any,
              color: pawnChessJsColor,
              san: `${receivedMove.to}` // Simplified SAN
            } as Move;
            resultFen = serverGame.fen();
          } catch (e) {
            console.error(`[sendMove] Error loading FEN for Pawn Rush Manual on server, room ${roomId}:`, e, `FEN: ${nextFen}`);
            socket.emit("invalidMove", { message: "Server error processing Pawn Rush Manual FEN.", move: clientMoveData });
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

        let isDeflected = false;
        if (opponentAdvantage?.id === "auto_deflect") {
          // The moveResult is from the perspective of the sender.
          // serverGame.inCheck() now refers to whether the *opponent* (receiver of the move) is in check.
          if (moveResult.piece === 'n' && serverGame.inCheck()) {
            isDeflected = true;
            console.log(`[sendMove] Knight move by ${senderColor} deflected for ${opponentColor} in room ${roomId}.`);
            socket.emit("moveDeflected", { move: clientMoveData }); 
          }
        }

        if (!isDeflected) {
          room.fen = resultFen; // Update server's FEN state for the room
          console.log(`[sendMove] Move by ${senderColor} validated. New FEN for room ${roomId}: ${room.fen}`);
          socket.to(roomId).emit("receiveMove", clientMoveData); // Broadcast the original client move data
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
