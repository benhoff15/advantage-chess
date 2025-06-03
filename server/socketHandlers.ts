import { Server, Socket } from "socket.io";
import { Chess, Move } from "chess.js"; // Import Chess and Move
import { assignRandomAdvantage } from "./assignAdvantage";
import { Advantage, ShieldedPieceInfo, PlayerAdvantageStates, RoyalEscortState } from "../shared/types";
import { handlePawnRush } from "./logic/advantages/pawnRush";
import { handleCastleMaster } from "./logic/advantages/castleMaster";
import { handleAutoDeflect } from "./logic/advantages/autoDeflect";
import { handleShieldWallServer } from "./logic/advantages/shieldWall";
import { 
  handleFocusedBishopServer, 
  FocusedBishopAdvantageState 
} from "./logic/advantages/focusedBishop";
import { 
  handleCornerBlitzServer, 
  CornerBlitzAdvantageRookState 
} from "./logic/advantages/cornerBlitz";
import { selectProtectedPiece } from "./logic/advantages/silentShield";
import { validateRoyalEscortServerMove } from './logic/advantages/royalEscort';

console.log("setupSocketHandlers loaded");

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
  fen?: string;
  // Add new states for Focused Bishop
  whiteFocusedBishopState?: FocusedBishopAdvantageState;
  blackFocusedBishopState?: FocusedBishopAdvantageState;
  whiteRooksMoved?: CornerBlitzAdvantageRookState; // For Corner Blitz
  blackRooksMoved?: CornerBlitzAdvantageRookState; // For Corner Blitz
  whiteRoyalEscortState?: RoyalEscortState;
  blackRoyalEscortState?: RoyalEscortState;
  silentShieldPieces?: {
    white: ShieldedPieceInfo | null;
    black: ShieldedPieceInfo | null;
  };
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
          console.log(`${socket.id} already joined room ${roomId}`);
          return;
        }

      socket.join(roomId);
      console.log(`${socket.id} is joining room ${roomId}`);
      
      if (!rooms[roomId]) {
        rooms[roomId] = { 
          fen: new Chess().fen(),
          // Initialize advantage states
          whiteFocusedBishopState: { focusedBishopUsed: false },
          blackFocusedBishopState: { focusedBishopUsed: false },
          // Initialize other new states as needed
          whiteRooksMoved: { a1: false, h1: false, a8: false, h8: false }, 
          blackRooksMoved: { a1: false, h1: false, a8: false, h8: false }, 
          // Royal Escort states will be initialized when advantages are assigned
          silentShieldPieces: { white: null, black: null },
        };
        console.log(`[joinRoom] Room ${roomId} created with starting FEN: ${rooms[roomId].fen} and default advantage states.`);
      } else {
        // If room exists but a player slot might be rejoining, ensure states are there
        if (!rooms[roomId].silentShieldPieces) {
          rooms[roomId].silentShieldPieces = { white: null, black: null };
        }
        if (rooms[roomId].white) {
          if (!rooms[roomId].whiteFocusedBishopState) rooms[roomId].whiteFocusedBishopState = { focusedBishopUsed: false };
          if (!rooms[roomId].whiteRooksMoved) rooms[roomId].whiteRooksMoved = { a1: false, h1: false, a8: false, h8: false };
        }
        if (rooms[roomId].black) {
          if (!rooms[roomId].blackFocusedBishopState) rooms[roomId].blackFocusedBishopState = { focusedBishopUsed: false };
          if (!rooms[roomId].blackRooksMoved) rooms[roomId].blackRooksMoved = { a1: false, h1: false, a8: false, h8: false };
        }
      }
      
      const room = rooms[roomId]; 

      if (!room.white) {
        room.white = socket.id;
        room.whiteAdvantage = assignRandomAdvantage();
        socket.emit("colorAssigned", "white");
        // socket.emit("advantageAssigned", room.whiteAdvantage); // Removed: Handled below
        console.log(`Assigned ${socket.id} as white with advantage: ${room.whiteAdvantage.name}`);
      } else if (!room.black) {
        room.black = socket.id;
        room.blackAdvantage = assignRandomAdvantage();
        socket.emit("colorAssigned", "black");
        // socket.emit("advantageAssigned", room.blackAdvantage); // Removed: Handled below
        console.log(`Assigned ${socket.id} as black with advantage: ${room.blackAdvantage.name}`);
        
        // ---- START NEW LOGIC BLOCK ----
        // This block runs when the second player (black) has just joined.
        const initialGame = new Chess(); 

        // White player's advantage processing
        // White player's advantage processing
        if (room.whiteAdvantage && room.white) {
            if (room.whiteAdvantage.id === "silent_shield" && room.silentShieldPieces) {
                const whiteShieldedPiece = selectProtectedPiece(initialGame, 'w');
                if (whiteShieldedPiece) {
                    room.silentShieldPieces.white = whiteShieldedPiece;
                    console.log(`White player (${room.white}) protected piece: ${whiteShieldedPiece.type} at ${whiteShieldedPiece.initialSquare}`);
                    io.sockets.sockets.get(room.white)?.emit("advantageAssigned", { advantage: room.whiteAdvantage, shieldedPiece: whiteShieldedPiece });
                } else {
                    io.sockets.sockets.get(room.white)?.emit("advantageAssigned", { advantage: room.whiteAdvantage });
                }
            } else if (room.whiteAdvantage.id === "royal_escort") {
                room.whiteRoyalEscortState = { usedCount: 0 };
                io.sockets.sockets.get(room.white)?.emit("advantageAssigned", { advantage: room.whiteAdvantage });
                console.log(`White player (${room.white}) assigned Royal Escort, state initialized.`);
            } else { // Standard advantage emission for white
                io.sockets.sockets.get(room.white)?.emit("advantageAssigned", { advantage: room.whiteAdvantage });
            }
        }

        // Black player's advantage processing (socket is black's socket here)
        if (room.blackAdvantage) {
            if (room.blackAdvantage.id === "silent_shield" && room.silentShieldPieces) {
                const blackShieldedPiece = selectProtectedPiece(initialGame, 'b');
                if (blackShieldedPiece) {
                    room.silentShieldPieces.black = blackShieldedPiece;
                    console.log(`Black player (${room.black}) protected piece: ${blackShieldedPiece.type} at ${blackShieldedPiece.initialSquare}`);
                    socket.emit("advantageAssigned", { advantage: room.blackAdvantage, shieldedPiece: blackShieldedPiece });
                } else {
                     socket.emit("advantageAssigned", { advantage: room.blackAdvantage });
                }
            } else if (room.blackAdvantage.id === "royal_escort") {
                room.blackRoyalEscortState = { usedCount: 0 };
                socket.emit("advantageAssigned", { advantage: room.blackAdvantage });
                console.log(`Black player (${socket.id}) assigned Royal Escort, state initialized.`);
            } else { // Standard advantage emission for black
                socket.emit("advantageAssigned", { advantage: room.blackAdvantage });
            }
        }
        // ---- END Advantage Assignment and State Init ----

        io.to(roomId).emit("opponentJoined"); 
      } else {
        socket.emit("roomFull");
        console.log(`Room ${roomId} is full`);
        return;
      }
      console.log(`Room state:`, rooms[roomId]);

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
        const receivedMove = clientMoveData as ClientMovePayload;
        const originalFenBeforeAttempt = room.fen!; // Assert non-null if sure room.fen exists

        // Fetch advantage states for the current player
        let currentPlayerAdvantageState_FB: FocusedBishopAdvantageState | undefined;
        let currentPlayerRooksMoved_CB: CornerBlitzAdvantageRookState | undefined;
        let currentPlayerRoyalEscortState_RE: RoyalEscortState | undefined;

        if (senderColor === 'white') {
            currentPlayerAdvantageState_FB = room.whiteFocusedBishopState;
            currentPlayerRooksMoved_CB = room.whiteRooksMoved;
            currentPlayerRoyalEscortState_RE = room.whiteRoyalEscortState;
        } else if (senderColor === 'black') {
            currentPlayerAdvantageState_FB = room.blackFocusedBishopState;
            currentPlayerRooksMoved_CB = room.blackRooksMoved;
            currentPlayerRoyalEscortState_RE = room.blackRoyalEscortState;
        }
        
        // Fallback initialization for states if they are somehow missing (should be set during joinRoom)
        if (senderColor === 'white') {
            if (room.whiteAdvantage?.id === "focused_bishop" && !currentPlayerAdvantageState_FB) currentPlayerAdvantageState_FB = room.whiteFocusedBishopState = { focusedBishopUsed: false };
            if (room.whiteAdvantage?.id === "corner_blitz" && !currentPlayerRooksMoved_CB) currentPlayerRooksMoved_CB = room.whiteRooksMoved = { a1: false, h1: false, a8: false, h8: false }; // Note: a8/h8 for white is unusual but for completeness
            if (room.whiteAdvantage?.id === "royal_escort" && !currentPlayerRoyalEscortState_RE) currentPlayerRoyalEscortState_RE = room.whiteRoyalEscortState = { usedCount: 0 };
        } else if (senderColor === 'black') {
            if (room.blackAdvantage?.id === "focused_bishop" && !currentPlayerAdvantageState_FB) currentPlayerAdvantageState_FB = room.blackFocusedBishopState = { focusedBishopUsed: false };
            if (room.blackAdvantage?.id === "corner_blitz" && !currentPlayerRooksMoved_CB) currentPlayerRooksMoved_CB = room.blackRooksMoved = { a1: false, h1: false, a8: false, h8: false }; // Note: a1/h1 for black is unusual
            if (room.blackAdvantage?.id === "royal_escort" && !currentPlayerRoyalEscortState_RE) currentPlayerRoyalEscortState_RE = room.blackRoyalEscortState = { usedCount: 0 };
        }

        // ---- Start of Silent Shield Capture Prevention ----
        const opponentShieldedPieceInfo: ShieldedPieceInfo | null =
          room.silentShieldPieces && opponentColor ? room.silentShieldPieces[opponentColor] : null;

        if (opponentShieldedPieceInfo) {
          // The client is attempting to move to the square currently occupied by the opponent's shielded piece.
          // This is an attempt to capture it.
          if (receivedMove.to === opponentShieldedPieceInfo.currentSquare) {
            // We also need to ensure there's actually a piece on that square for a capture to be possible.
            // And that the piece belongs to the opponent.
            const pieceOnTargetSquare = serverGame.get(receivedMove.to as any); // 'any' to satisfy chess.js Square type

            if (pieceOnTargetSquare && pieceOnTargetSquare.color === opponentColor[0] && pieceOnTargetSquare.type === opponentShieldedPieceInfo.type) {
              console.warn(`[sendMove] Player ${senderColor} (${senderId}) attempt to capture shielded piece ${opponentShieldedPieceInfo.type} at ${opponentShieldedPieceInfo.currentSquare} in room ${roomId}.`);
              socket.emit("invalidMove", {
                message: `Opponent's ${opponentShieldedPieceInfo.type.toUpperCase()} on ${opponentShieldedPieceInfo.currentSquare} is protected by Silent Shield.`,
                move: receivedMove
              });
              return; // Stop further processing of this move
            }
          }
        }
        // ---- End of Silent Shield Capture Prevention ----

        if (receivedMove.special?.startsWith("castle-master")) {
          // Assumes handleCastleMaster sets moveResult and updates serverGame internally
          if (senderColor === null) {
            console.error(`[sendMove] senderColor is null before calling handleCastleMaster for room ${roomId}.`);
            socket.emit("serverError", { message: "Internal server error processing your move." });
            return;
          }
          const castleMasterResult = handleCastleMaster({
            game: serverGame, // serverGame is used and potentially modified
            clientMoveData: receivedMove as any, 
            currentFen: originalFenBeforeAttempt!, // Pass original FEN
            playerColor: senderColor![0] as 'w' | 'b',
          });
          moveResult = castleMasterResult.moveResult;
          // If castleMasterResult.moveResult is null, serverGame should be reverted by handleCastleMaster or here.
          // Assuming handleCastleMaster reverts serverGame to 'currentFen' if moveResult is null.
          if (!moveResult) serverGame.load(originalFenBeforeAttempt!); // Ensure revert if special move fails
        } else if (receivedMove.special === "pawn_rush_manual") {
          if (senderColor === null) { 
            console.error(`[sendMove] senderColor is null before calling handlePawnRush for room ${roomId}. This should not happen.`);
            socket.emit("serverError", { message: "Internal server error processing your move." });
            return;
          }
          const pawnRushResult = handlePawnRush({
            game: serverGame,
            clientMoveData: receivedMove,
            currentFen: originalFenBeforeAttempt!,
            playerColor: senderColor![0] as 'w' | 'b',
          });
          moveResult = pawnRushResult.moveResult;
          if (!moveResult) serverGame.load(originalFenBeforeAttempt!); // Ensure revert
        } else if (receivedMove.special === "focused_bishop") {
          if (!senderColor) { // Should be caught by earlier checks, but as safeguard
             socket.emit("serverError", { message: "Player color not determined."});
             return; // Exit early
          }
          const fbResult = handleFocusedBishopServer({
            game: serverGame, // serverGame is pristine (originalFenBeforeAttempt)
            clientMoveData: receivedMove as any,
            currentFen: originalFenBeforeAttempt!,
            playerColor: senderColor![0] as 'w' | 'b',
            advantageState: currentPlayerAdvantageState_FB!,
          });

          moveResult = fbResult.moveResult;

          if (moveResult) {
            // serverGame was modified by handleFocusedBishopServer successfully
            room.fen = serverGame.fen(); // Get the FEN from the modified serverGame
            if (senderColor === 'white') {
              room.whiteFocusedBishopState = fbResult.advantageStateUpdated;
            } else {
              room.blackFocusedBishopState = fbResult.advantageStateUpdated;
            }
          } else {
            // handleFocusedBishopServer should have reverted serverGame if it failed.
            // If not, serverGame.load(originalFenBeforeAttempt!) here is a safeguard.
            if (serverGame.fen() !== originalFenBeforeAttempt!) {
                 serverGame.load(originalFenBeforeAttempt!);
            }
            socket.emit("invalidMove", { 
              message: "Focused Bishop move rejected by server.", 
              move: clientMoveData 
            });
            // moveResult remains null if Focused Bishop was invalid
          }
        } else if (receivedMove.special === "corner_blitz") {
          if (!currentPlayerRooksMoved_CB) { // Should be initialized, but safeguard
            socket.emit("invalidMove", { message: "Corner Blitz state not found.", move: clientMoveData });
            return; // Exit, as state is crucial
          }
          const cbResult = handleCornerBlitzServer({
            game: serverGame, 
            clientMoveData: receivedMove as any, 
            currentFen: originalFenBeforeAttempt!,
            playerColor: senderColor![0] as 'w' | 'b',
            rooksMovedState: currentPlayerRooksMoved_CB, 
          });

          moveResult = cbResult.moveResult;

          if (moveResult) {
            room.fen = serverGame.fen(); 
            if (senderColor === 'white') {
              room.whiteRooksMoved = cbResult.advantageStateUpdated;
            } else {
              room.blackRooksMoved = cbResult.advantageStateUpdated;
            }
          } else {
            if (serverGame.fen() !== originalFenBeforeAttempt!) {
                 serverGame.load(originalFenBeforeAttempt!);
            }
            socket.emit("invalidMove", { 
              message: "Corner Blitz move rejected by server.", 
              move: clientMoveData 
            });
            // moveResult remains null
          }
        } else if (receivedMove.special === "royal_escort") {
          const playerAdvantage = senderColor === 'white' ? room.whiteAdvantage : room.blackAdvantage;
          if (!currentPlayerRoyalEscortState_RE || playerAdvantage?.id !== "royal_escort") {
            socket.emit("invalidMove", { message: "Royal Escort state not found or advantage mismatch.", move: clientMoveData });
            return; // Exit, as state is crucial
          }
          const reResult = validateRoyalEscortServerMove({
            game: serverGame, // serverGame is loaded with originalFenBeforeAttempt
            clientMoveData: receivedMove as any,
            playerColor: senderColor![0] as 'w' | 'b',
            royalEscortState: currentPlayerRoyalEscortState_RE,
          });

          moveResult = reResult.moveResult;

          if (moveResult) {
            room.fen = reResult.nextFen; // Use nextFen from result
            serverGame.load(room.fen); // Sync serverGame instance with this new FEN

            if (reResult.updatedRoyalEscortState) {
              if (senderColor === 'white') {
                room.whiteRoyalEscortState = reResult.updatedRoyalEscortState;
              } else {
                room.blackRoyalEscortState = reResult.updatedRoyalEscortState;
              }
            }
          } else {
            // validateRoyalEscortServerMove should not modify serverGame if move is invalid
            // and should return original FEN. But as a safeguard:
            if (serverGame.fen() !== originalFenBeforeAttempt!) {
                 serverGame.load(originalFenBeforeAttempt!);
            }
            socket.emit("invalidMove", { 
              message: "Royal Escort move rejected by server.", 
              move: clientMoveData 
            });
            // moveResult remains null
          }
        } else { 
          // Standard move attempt
        try {
          moveResult = serverGame.move({ 
            from: receivedMove.from,
            to: receivedMove.to,
            promotion: receivedMove.promotion as any
          });
      } catch (err) {
        console.warn(`[sendMove] Chess.js threw an error on move attempt:`, err);
        socket.emit("invalidMove", {
          message: "Move rejected by chess engine (internal validation).",
          move: clientMoveData
        });
        return;
      }

          if (moveResult) {
            // Shield Wall Check - only if the standard move itself was valid
            if (moveResult.captured && opponentAdvantage?.id === 'shield_wall' && opponentColor) {
              const shieldWallCheck = handleShieldWallServer({
                game: serverGame, // serverGame state is *after* the provisional move
                move: moveResult,
                shieldPlayerColor: opponentColor === 'white' ? 'w' : 'b',
                shieldPlayerAdvantageActive: true 
              });

              if (shieldWallCheck.rejected) {
                serverGame.load(originalFenBeforeAttempt); // Revert serverGame
                socket.emit("invalidMove", { 
                  message: shieldWallCheck.reason || "Move rejected by opponent's Shield Wall.", 
                  move: clientMoveData 
                });
                moveResult = null; // Nullify moveResult
              }
            }
          }
        }
        // End of special/standard move blocks. moveResult is either a valid Move object or null.

        
        // Universal post-move processing (if moveResult is not null)
        if (moveResult) {
          const currentResultFen = serverGame.fen(); // FEN after successful move 

          const isDeflected = handleAutoDeflect({
            game: serverGame, 
            moveResult: moveResult, 
            opponentAdvantage: opponentAdvantage,
          });

          if (isDeflected) {
            if (serverGame.fen() !== originalFenBeforeAttempt!) {
                 serverGame.load(originalFenBeforeAttempt!); // Revert serverGame
            }
            socket.emit("moveDeflected", { move: clientMoveData }); 
          } else {
            // Authoritative FEN update was already done by the specific handler
            // if it modified serverGame and we set room.fen = serverGame.fen().
            // For standard moves, room.fen is updated here.
            if (room.fen !== currentResultFen && !receivedMove.special) { // Standard move path
                 room.fen = currentResultFen;
            } else if (room.fen !== currentResultFen && receivedMove.special) {

            }
             if (room.fen !== currentResultFen && (receivedMove.special?.startsWith("castle-master") || receivedMove.special === "pawn_rush_manual")) {
                 room.fen = currentResultFen; // This should be fine if all handlers update serverGame.
            }

            // ---- Start of Silent Shield currentSquare update ----
            let updatedShieldedPieceForEmit: ShieldedPieceInfo | null = null;
            if (room.silentShieldPieces && senderColor && moveResult) { // moveResult must be non-null here
              const playerShieldInfo = room.silentShieldPieces[senderColor];
              if (playerShieldInfo && moveResult.from === playerShieldInfo.currentSquare) {
                playerShieldInfo.currentSquare = moveResult.to;
                updatedShieldedPieceForEmit = playerShieldInfo;
                console.log(`[SilentShield] Player ${senderColor}'s shielded piece ${playerShieldInfo.type} moved from ${moveResult.from} to ${moveResult.to}. Updated currentSquare.`);
              }
            }
            // ---- End of Silent Shield currentSquare update ----

            console.log(`[sendMove] Move by ${senderColor} validated. New FEN for room ${roomId}: ${room.fen}`);
            
            // Ensure the move data to be broadcast includes the sender's color
            const moveDataForBroadcast: ClientMovePayload = {
                ...clientMoveData, // Spread original client move data
                color: senderColor! // Explicitly set/override color with server's authoritative senderColor
                                   // The '!' asserts senderColor is not null here, which it should be.
            };

            const payload = {
                move: moveDataForBroadcast, // Use the modified move data
                ...(updatedShieldedPieceForEmit && { updatedShieldedPiece: updatedShieldedPieceForEmit })
            };
            io.to(roomId).emit("receiveMove", payload);

          }
        } else {
          // This block executes if moveResult is null.
          let message = "Your move was deemed invalid by the server (generic fallback).";
          // Attempt to provide a slightly more specific message if possible
          if (receivedMove.special) {
            // This might be redundant if special handlers always emit their own errors on failure.
            // However, if a special handler fails before emitting, this provides some context.
            message = `Your special move (${receivedMove.special}) could not be processed or was invalid.`;
          } else if (serverGame.fen() === originalFenBeforeAttempt) {
            // If it was not a special move and the FEN hasn't changed, it was likely an invalid standard move.
             message = "Your move was invalid according to chess rules or internal server validation.";
          }
          
          console.warn(`[sendMove] Fallback or failed special move: Null moveResult for ${senderColor} (${senderId}) in room ${roomId}:`, receivedMove, `FEN before attempt: ${originalFenBeforeAttempt}. Emitting error: ${message}`);
          socket.emit("invalidMove", { message: message, move: clientMoveData });
        }

        // After any move attempt (successful or not, if moveResult became non-null then nullified by deflection)
        // Check for game over conditions if a move was made and not deflected, or if a move was made and deflection logic doesn't handle game over.
        // The current structure with `if (moveResult)` then `handleAutoDeflect` implies that if deflected, `moveResult` might effectively be nullified for client broadcast.
        // Game over checks should ideally be after the final state of the board for the turn is determined.
        // The `isDeflected` block above doesn't re-check for game over.
        // Let's assume game over checks are only for non-deflected, successful moves.
        if (moveResult && room.fen === serverGame.fen()) { // Ensure serverGame is authoritative
            if (serverGame.isCheckmate()) {
                const loserTurn = serverGame.turn(); // 'w' if white is checkmated, 'b' if black is checkmated
                const winnerColor = loserTurn === 'w' ? 'black' : 'white';
                io.to(roomId).emit("gameOver", { 
                    message: `${winnerColor.charAt(0).toUpperCase() + winnerColor.slice(1)} wins by checkmate!`,
                    winnerColor: winnerColor 
                });
            } else if (serverGame.isDraw()) {
                io.to(roomId).emit("gameOver", { message: "Draw!", winnerColor: null });
            } else if (serverGame.isStalemate()) {
                io.to(roomId).emit("gameOver", { message: "Stalemate!", winnerColor: null });
            } else if (serverGame.isThreefoldRepetition()) {
                io.to(roomId).emit("gameOver", { message: "Draw by Threefold Repetition!", winnerColor: null });
            } else if (serverGame.isInsufficientMaterial()) {
                io.to(roomId).emit("gameOver", { message: "Draw by Insufficient Material!", winnerColor: null });
            }
            // Standard turn update logic might be here or handled by FEN
            // room.turn = serverGame.turn() === 'w' ? 'white' : 'black'; // Example
            // io.to(roomId).emit("turnChange", { turn: room.turn, fen: room.fen }); // Example
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
      console.log("Disconnected:", socket.id);
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
