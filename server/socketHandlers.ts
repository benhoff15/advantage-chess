import { Server, Socket } from "socket.io";
import { Chess, Move, Square } from "chess.js"; // Import Chess and Move
import { assignRandomAdvantage } from "./assignAdvantage";
import { Advantage, ShieldedPieceInfo, PlayerAdvantageStates, RoyalEscortState, ServerMovePayload, OpeningSwapState, SacrificialBlessingPendingState } from "../shared/types";
import { applyArcaneReinforcement } from "./logic/advantages/arcaneReinforcement";
import { handleQueenlyCompensation } from './logic/advantages/queenlyCompensation';
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
import { validateLightningCaptureServerMove } from './logic/advantages/lightningCapture';
import { validateQueensDomainServerMove } from './logic/advantages/queensDomain'; // QD Import
import { validateKnightmareServerMove } from './logic/advantages/knightmare';
import { LightningCaptureState, PawnAmbushState } from "../shared/types"; // Added PawnAmbushState
import { handlePawnAmbushServer } from './logic/advantages/pawnAmbush'; // Added
import { canTriggerSacrificialBlessing, getPlaceableKnightsAndBishops, handleSacrificialBlessingPlacement } from './logic/advantages/sacrificialBlessing';

console.log("setupSocketHandlers loaded");

// Helper function to determine if a move is castling
function isCastlingMove(move: Move, piece: { type: string, color: 'w' | 'b' }): boolean {
  if (piece.type !== 'k') {
    return false;
  }
  // chess.js move flags 'k' (kingside castling) and 'q' (queenside castling)
  return move.flags.includes('k') || move.flags.includes('q');
}

type PlayerStats = {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  elo: number;
};

export type RoomState = {
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
  whiteLightningCaptureState?: LightningCaptureState;
  blackLightningCaptureState?: LightningCaptureState;
  silentShieldPieces?: {
    white: ShieldedPieceInfo | null;
    black: ShieldedPieceInfo | null;
  };
  whiteOpeningSwapState?: OpeningSwapState;
  blackOpeningSwapState?: OpeningSwapState;
  whitePawnAmbushState?: PawnAmbushState; // Added
  blackPawnAmbushState?: PawnAmbushState; // Added
  royalDecreeRestriction?: { targetColor: "white" | "black", pieceType: string } | null;
  whiteHasUsedRoyalDecree?: boolean;
  blackHasUsedRoyalDecree?: boolean;
  sacrificialBlessingPending?: SacrificialBlessingPendingState | null;
  whiteHasUsedSacrificialBlessing?: boolean;
  blackHasUsedSacrificialBlessing?: boolean;
  restlessKingCheckBlock?: { white: boolean; black: boolean };
  restlessKingUsesLeft?: { white: number; black: number };
  whiteQueensDomainState?: { isActive: boolean; hasUsed: boolean };
  blackQueensDomainState?: { isActive: boolean; hasUsed: boolean };
  whiteKnightmareState?: { hasUsed: boolean };
  blackKnightmareState?: { hasUsed: boolean };
  whiteQueenlyCompensationState?: { hasUsed: boolean };
  blackQueenlyCompensationState?: { hasUsed: boolean };
  whiteArcaneReinforcementSpawnedSquare?: Square | null;
  blackArcaneReinforcementSpawnedSquare?: Square | null;
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
      
      let room = rooms[roomId]; // Declare room here

      if (!room) { // Check if room object exists
        rooms[roomId] = { 
          fen: new Chess().fen(),
          // Initialize advantage states
          whiteFocusedBishopState: { focusedBishopUsed: false },
          blackFocusedBishopState: { focusedBishopUsed: false },
          // Initialize other new states as needed
          whiteRooksMoved: { a1: false, h1: false, a8: false, h8: false }, 
          blackRooksMoved: { a1: false, h1: false, a8: false, h8: false }, 
          whiteRoyalEscortState: undefined, // Will be set if advantage is assigned
          blackRoyalEscortState: undefined,
          whiteLightningCaptureState: { used: false }, // Default init
          blackLightningCaptureState: { used: false }, // Default init
          silentShieldPieces: { white: null, black: null },
          whitePawnAmbushState: undefined, // Added
          blackPawnAmbushState: undefined, // Added
          royalDecreeRestriction: null,
          whiteHasUsedRoyalDecree: false,
          blackHasUsedRoyalDecree: false,
          sacrificialBlessingPending: null,
          whiteHasUsedSacrificialBlessing: false,
          blackHasUsedSacrificialBlessing: false,
          restlessKingCheckBlock: { white: false, black: false },
          restlessKingUsesLeft: { white: 3, black: 3 },
          whiteQueensDomainState: { isActive: false, hasUsed: false },
          blackQueensDomainState: { isActive: false, hasUsed: false },
          whiteKnightmareState: { hasUsed: false }, // Initialize with hasUsed: false
          blackKnightmareState: { hasUsed: false }, // Initialize with hasUsed: false
          whiteQueenlyCompensationState: { hasUsed: false },
          blackQueenlyCompensationState: { hasUsed: false },
          whiteArcaneReinforcementSpawnedSquare: null,
          blackArcaneReinforcementSpawnedSquare: null,
        };
        room = rooms[roomId]; // Assign the newly created room to the local variable
        console.log(`[joinRoom] Room ${roomId} created with starting FEN: ${room.fen} and default advantage states including Knightmare, Queenly Compensation ({hasUsed: false}), and Arcane Reinforcement (null).`);
      } else {
        // If room exists, ensure all necessary sub-states are initialized (e.g., after server restart)
        if (!room.silentShieldPieces) room.silentShieldPieces = { white: null, black: null };
        if (!room.whiteLightningCaptureState) room.whiteLightningCaptureState = { used: false };
        if (!room.blackLightningCaptureState) room.blackLightningCaptureState = { used: false };
        if (!room.whitePawnAmbushState && room.whiteAdvantage?.id === "pawn_ambush") room.whitePawnAmbushState = { ambushedPawns: [] }; // Added
        if (!room.blackPawnAmbushState && room.blackAdvantage?.id === "pawn_ambush") room.blackPawnAmbushState = { ambushedPawns: [] }; // Added
        if (!room.whiteFocusedBishopState) room.whiteFocusedBishopState = { focusedBishopUsed: false };
        if (!room.blackFocusedBishopState) room.blackFocusedBishopState = { focusedBishopUsed: false };
        if (!room.whiteRooksMoved) room.whiteRooksMoved = { a1: false, h1: false, a8: false, h8: false };
        if (!room.blackRooksMoved) room.blackRooksMoved = { a1: false, h1: false, a8: false, h8: false };
        // Royal Escort states are typically initialized upon advantage assignment, but good to check
        if (room.whiteAdvantage?.id === "royal_escort" && !room.whiteRoyalEscortState) room.whiteRoyalEscortState = { usedCount: 0};
        if (room.blackAdvantage?.id === "royal_escort" && !room.blackRoyalEscortState) room.blackRoyalEscortState = { usedCount: 0};
        if (room.royalDecreeRestriction === undefined) room.royalDecreeRestriction = null;
        if (room.whiteHasUsedRoyalDecree === undefined) room.whiteHasUsedRoyalDecree = false;
        if (room.blackHasUsedRoyalDecree === undefined) room.blackHasUsedRoyalDecree = false;
        if (room.sacrificialBlessingPending === undefined) room.sacrificialBlessingPending = null;
        if (room.whiteHasUsedSacrificialBlessing === undefined) room.whiteHasUsedSacrificialBlessing = false;
        if (room.blackHasUsedSacrificialBlessing === undefined) room.blackHasUsedSacrificialBlessing = false;
        if (room.restlessKingCheckBlock === undefined) room.restlessKingCheckBlock = { white: false, black: false };
        if (room.restlessKingUsesLeft === undefined) room.restlessKingUsesLeft = { white: 3, black: 3 };
        if (room.whiteQueensDomainState === undefined) room.whiteQueensDomainState = { isActive: false, hasUsed: false };
        if (room.blackQueensDomainState === undefined) room.blackQueensDomainState = { isActive: false, hasUsed: false };
        if (room.whiteAdvantage?.id === "knightmare" && (!room.whiteKnightmareState || typeof room.whiteKnightmareState.hasUsed === 'undefined')) room.whiteKnightmareState = { hasUsed: false };
        if (room.blackAdvantage?.id === "knightmare" && (!room.blackKnightmareState || typeof room.blackKnightmareState.hasUsed === 'undefined')) room.blackKnightmareState = { hasUsed: false };
        if (room.whiteAdvantage?.id === "queenly_compensation" && (!room.whiteQueenlyCompensationState || typeof room.whiteQueenlyCompensationState.hasUsed === 'undefined')) room.whiteQueenlyCompensationState = { hasUsed: false };
        if (room.blackAdvantage?.id === "queenly_compensation" && (!room.blackQueenlyCompensationState || typeof room.blackQueenlyCompensationState.hasUsed === 'undefined')) room.blackQueenlyCompensationState = { hasUsed: false };
        if (room.whiteArcaneReinforcementSpawnedSquare === undefined) room.whiteArcaneReinforcementSpawnedSquare = null;
        if (room.blackArcaneReinforcementSpawnedSquare === undefined) room.blackArcaneReinforcementSpawnedSquare = null;
      }
      
      // Now 'room' variable is guaranteed to be the correct RoomState object or undefined if something went wrong before this point.
      // However, the logic above ensures 'room' is assigned. A further check might be redundant but safe.
      if (!room) {
        console.error(`[joinRoom] Room object for ${roomId} is unexpectedly null after initialization block.`);
        socket.emit("serverError", { message: "Failed to initialize or retrieve room data." });
        return;
      }

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
        const initialGame = new Chess(); // Board is in starting position here

        // Apply Arcane Reinforcement for White if applicable
        // This needs to happen BEFORE other advantages that might rely on specific piece setups
        // or before the initial FEN is finalized for the game start.
        if (room.whiteAdvantage?.id === 'arcane_reinforcement' && room.white) {
            const result = applyArcaneReinforcement(initialGame, 'w');
            if (result.spawnedSquare) {
                room.whiteArcaneReinforcementSpawnedSquare = result.spawnedSquare;
                console.log(`[SocketHandlers] Arcane Reinforcement applied for white. Bishop at ${result.spawnedSquare}. New FEN preview: ${initialGame.fen()}`);
            } else {
                console.log(`[SocketHandlers] Arcane Reinforcement for white: No square found or failed to place.`);
            }
        }

        // Apply Arcane Reinforcement for Black if applicable
        if (room.blackAdvantage?.id === 'arcane_reinforcement' && room.black) {
            // Note: room.black is socket.id at this point in the code if black is just joining
            const result = applyArcaneReinforcement(initialGame, 'b');
            if (result.spawnedSquare) {
                room.blackArcaneReinforcementSpawnedSquare = result.spawnedSquare;
                console.log(`[SocketHandlers] Arcane Reinforcement applied for black. Bishop at ${result.spawnedSquare}. New FEN preview: ${initialGame.fen()}`);
            } else {
                console.log(`[SocketHandlers] Arcane Reinforcement for black: No square found or failed to place.`);
            }
        }
        
        // Now that Arcane Reinforcement (and any other pre-game board modifiers) are applied,
        // set the definitive starting FEN for the room.
        room.fen = initialGame.fen();
        console.log(`[joinRoom] Definitive starting FEN for room ${roomId} after all pre-game advantages: ${room.fen}`);


        // White player's advantage processing & emitting advantageAssigned
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
            } else if (room.whiteAdvantage.id === "lightning_capture") {
                room.whiteLightningCaptureState = { used: false }; // Initialize
                io.sockets.sockets.get(room.white)?.emit("advantageAssigned", { advantage: room.whiteAdvantage });
                console.log(`White player (${room.white}) assigned Lightning Capture, state initialized.`);
            } else if (room.whiteAdvantage.id === "opening_swap") {
                room.whiteOpeningSwapState = { hasSwapped: false };
                io.sockets.sockets.get(room.white)?.emit("advantageAssigned", { advantage: room.whiteAdvantage });
                console.log(`White player (${room.white}) assigned Opening Swap, state initialized.`);
            } else if (room.whiteAdvantage.id === "pawn_ambush") { // Added
                room.whitePawnAmbushState = { ambushedPawns: [] }; // Added
                io.sockets.sockets.get(room.white)?.emit("advantageAssigned", { advantage: room.whiteAdvantage }); // Standard emission
                console.log(`White player (${room.white}) assigned Pawn Ambush, state initialized.`); // Added
            } else if (room.whiteAdvantage.id === "royal_decree") {
                room.whiteHasUsedRoyalDecree = false;
                io.sockets.sockets.get(room.white)?.emit("advantageAssigned", { advantage: room.whiteAdvantage });
                console.log(`White player (${room.white}) assigned Royal Decree, state initialized.`);
            } else if (room.whiteAdvantage.id === "queens_domain") {
                room.whiteQueensDomainState = { isActive: false, hasUsed: false };
                io.sockets.sockets.get(room.white)?.emit("advantageAssigned", { advantage: room.whiteAdvantage });
                console.log(`White player (${room.white}) assigned Queen's Domain, state initialized.`);
            } else if (room.whiteAdvantage.id === "knightmare") { 
                room.whiteKnightmareState = { hasUsed: false }; // Initialize with hasUsed: false
                io.sockets.sockets.get(room.white)?.emit("advantageAssigned", { advantage: room.whiteAdvantage });
                console.log(`White player (${room.white}) assigned Knightmare, state initialized: ${JSON.stringify(room.whiteKnightmareState)}`);
            } else if (room.whiteAdvantage.id === "queenly_compensation") {
                room.whiteQueenlyCompensationState = { hasUsed: false };
                io.sockets.sockets.get(room.white)?.emit("advantageAssigned", { advantage: room.whiteAdvantage });
                console.log(`White player (${room.white}) assigned Queenly Compensation, state initialized.`);
            } else if (room.whiteAdvantage.id === "arcane_reinforcement") {
                const whitePayload = {
                    advantage: room.whiteAdvantage,
                    advantageDetails: { spawnedSquare: room.whiteArcaneReinforcementSpawnedSquare }
                };
                console.log('[Arcane Reinforcement Debug Server] Emitting advantageAssigned to white. Payload:', JSON.stringify(whitePayload));
                io.sockets.sockets.get(room.white)?.emit("advantageAssigned", whitePayload);
                console.log(`White player (${room.white}) assigned Arcane Reinforcement. Spawned at: ${room.whiteArcaneReinforcementSpawnedSquare}`);
            } else { // Standard advantage emission for white
                io.sockets.sockets.get(room.white)?.emit("advantageAssigned", { advantage: room.whiteAdvantage });
            }
        }

        // Black player's advantage processing (socket is black's socket here)
        // The applyArcaneReinforcement logic for black has already run above and set room.blackArcaneReinforcementSpawnedSquare
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
            } else if (room.blackAdvantage.id === "lightning_capture") {
                room.blackLightningCaptureState = { used: false }; // Initialize
                socket.emit("advantageAssigned", { advantage: room.blackAdvantage });
                console.log(`Black player (${socket.id}) assigned Lightning Capture, state initialized.`);
            } else if (room.blackAdvantage.id === "opening_swap") {
                room.blackOpeningSwapState = { hasSwapped: false };
                socket.emit("advantageAssigned", { advantage: room.blackAdvantage });
                console.log(`Black player (${socket.id}) assigned Opening Swap, state initialized.`);
            } else if (room.blackAdvantage.id === "pawn_ambush") { // Added
                room.blackPawnAmbushState = { ambushedPawns: [] }; // Added
                socket.emit("advantageAssigned", { advantage: room.blackAdvantage }); // Standard emission for black
                console.log(`Black player (${socket.id}) assigned Pawn Ambush, state initialized.`); // Added
            } else if (room.blackAdvantage.id === "royal_decree") {
                room.blackHasUsedRoyalDecree = false;
                socket.emit("advantageAssigned", { advantage: room.blackAdvantage });
                console.log(`Black player (${socket.id}) assigned Royal Decree, state initialized.`);
            } else if (room.blackAdvantage.id === "queens_domain") {
                room.blackQueensDomainState = { isActive: false, hasUsed: false };
                socket.emit("advantageAssigned", { advantage: room.blackAdvantage });
                console.log(`Black player (${socket.id}) assigned Queen's Domain, state initialized.`);
            } else if (room.blackAdvantage.id === "knightmare") {
                room.blackKnightmareState = { hasUsed: false }; // Initialize with hasUsed: false
                socket.emit("advantageAssigned", { advantage: room.blackAdvantage });
                console.log(`Black player (${socket.id}) assigned Knightmare, state initialized: ${JSON.stringify(room.blackKnightmareState)}`);
            } else if (room.blackAdvantage.id === "queenly_compensation") {
                room.blackQueenlyCompensationState = { hasUsed: false };
                socket.emit("advantageAssigned", { advantage: room.blackAdvantage });
                console.log(`Black player (${socket.id}) assigned Queenly Compensation, state initialized.`);
            } else if (room.blackAdvantage.id === "arcane_reinforcement") {
                const blackPayload = {
                    advantage: room.blackAdvantage,
                    advantageDetails: { spawnedSquare: room.blackArcaneReinforcementSpawnedSquare }
                };
                console.log('[Arcane Reinforcement Debug Server] Emitting advantageAssigned to black. Payload:', JSON.stringify(blackPayload));
                socket.emit("advantageAssigned", blackPayload);
                console.log(`Black player (${socket.id}) assigned Arcane Reinforcement. Spawned at: ${room.blackArcaneReinforcementSpawnedSquare}`);
            } else { // Standard advantage emission for black
                socket.emit("advantageAssigned", { advantage: room.blackAdvantage });
            }
        }
        // ---- END Advantage Assignment and State Init ----
        
        // After all advantages are processed and initial FEN is set (including Arcane Reinforcement pieces):
        io.to(roomId).emit("gameStart", { fen: room.fen, whitePlayer: room.white, blackPlayer: room.black });
        io.to(roomId).emit("opponentJoined"); // This might be redundant if gameStart implies opponent is there.
                                            // Or, it could be useful for client-side logic that specifically waits for this.
                                            // Keeping it for now as per existing structure.

      } else {
        socket.emit("roomFull");
        console.log(`Room ${roomId} is full`);
        return;
      }
      console.log(`Room state:`, rooms[roomId]);

      socket.on("sendMove", ({ roomId, move: clientMoveData }) => {
        const room = rooms[roomId];
        // Moved the initial log to after senderColor is defined.
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
        // Now senderColor is defined, so we can log it.
        console.log(`[SocketHandlers sendMove] Received. Room: ${roomId}, Move: ${JSON.stringify(clientMoveData)}, PlayerColor: ${senderColor}`);

        if (serverGame.turn() !== senderColor[0]) {
          console.warn(`[sendMove] Not ${senderColor}'s turn in room ${roomId}. Server FEN: ${room.fen}, Server turn: ${serverGame.turn()}, Sender claims: ${senderColor[0]}`);
          socket.emit("invalidMove", { message: "Not your turn.", move: clientMoveData });
          return;
        }
        
        let moveResult: Move | null = null; 
        const receivedMove = clientMoveData as ServerMovePayload; // Use ServerMovePayload
        const originalFenBeforeAttempt = room.fen!; // Assert non-null if sure room.fen exists

        // --- Royal Decree Restriction Check ---
        let isRoyalDecreeOverridden = false; 

        if (room.royalDecreeRestriction && room.royalDecreeRestriction.targetColor === senderColor) {
          const restriction = room.royalDecreeRestriction;
          // serverGame is already initialized with room.fen

          console.log(`[Royal Decree Server] Player ${senderColor} has an active restriction: move ${restriction.pieceType}`);

          if (serverGame.inCheck()) {
            console.log(`[Royal Decree Server] Restriction for ${senderColor} (piece: ${restriction.pieceType}) lifted due to CHECK.`);
            room.royalDecreeRestriction = null; // Clear restriction
            isRoyalDecreeOverridden = true;
            socket.emit("royalDecreeLifted", { 
              reason: "check", 
              pieceType: restriction.pieceType 
            });
          } else {
            const legalMoves = serverGame.moves({ verbose: true });
            const hasMatchingMoves = legalMoves.some(move => {
              const pieceDetails = serverGame.get(move.from);
              return pieceDetails && pieceDetails.type === restriction.pieceType;
            });

            if (!hasMatchingMoves) {
              console.log(`[Royal Decree Server] Restriction for ${senderColor} (piece: ${restriction.pieceType}) lifted due to NO VALID MOVES with that piece type.`);
              room.royalDecreeRestriction = null; // Clear restriction
              isRoyalDecreeOverridden = true;
              socket.emit("royalDecreeLifted", { 
                reason: "no_valid_moves", 
                pieceType: restriction.pieceType 
              });
            } else {
              console.log(`[Royal Decree Server] ENFORCING restriction for ${senderColor} to move a ${restriction.pieceType}.`);
            }
          }
        }
        // --- End Royal Decree Restriction Check ---

        // ---- Restless King Check PREVENTION Logic ----
        if (senderColor && room.restlessKingCheckBlock?.[senderColor] === true) {
          // Temporarily try the move to see if it results in a check
          const testGame = new Chess(room.fen!); // Use current FEN
          const testMove = testGame.move({
            from: receivedMove.from,
            to: receivedMove.to,
            promotion: receivedMove.promotion as any // Use 'any' for chess.js compatibility
          });

          if (testMove && testGame.inCheck()) { // inCheck() checks if the *current* player to move is in check
                                              // After a move, turn switches, so this checks if opponent was put in check.
            console.warn(`[Restless King] Player ${senderColor} (${senderId}) prevented from checking opponent due to Restless King in room ${roomId}. Move: ${receivedMove.from}-${receivedMove.to}`);
            socket.emit("invalidMove", {
              message: "Restless King prevents you from giving check this turn.",
              move: clientMoveData // clientMoveData is the original move object from the client
            });
            return; // Prevent further processing of this move
          }
          // If the move does not result in a check, the block is lifted for this turn.
          // No, the block should persist for any move that turn. The prompt implies the block is for *giving* check.
          // The wording "Restless King prevents you from giving check this turn" means ANY move that would give check is illegal.
          // The block is only lifted *after* a successful non-checking move is made (handled in post-move logic).
        }
        // ---- End Restless King Check PREVENTION Logic ----

        // Fetch advantage states for the current player
        let currentPlayerAdvantageState_FB: FocusedBishopAdvantageState | undefined;
        let currentPlayerRooksMoved_CB: CornerBlitzAdvantageRookState | undefined;
        let currentPlayerRoyalEscortState_RE: RoyalEscortState | undefined;
        let currentPlayerLightningCaptureState_LC: LightningCaptureState | undefined;
        let playerQueensDomainState: { isActive: boolean; hasUsed: boolean } | undefined;
        let currentPlayerKnightmareState: { hasUsed: boolean } | undefined;


        if (senderColor === 'white') {
            currentPlayerAdvantageState_FB = room.whiteFocusedBishopState;
            currentPlayerRooksMoved_CB = room.whiteRooksMoved;
            currentPlayerRoyalEscortState_RE = room.whiteRoyalEscortState;
            currentPlayerLightningCaptureState_LC = room.whiteLightningCaptureState;
            playerQueensDomainState = room.whiteQueensDomainState;
        } else if (senderColor === 'black') {
            currentPlayerAdvantageState_FB = room.blackFocusedBishopState;
            currentPlayerRooksMoved_CB = room.blackRooksMoved;
            currentPlayerRoyalEscortState_RE = room.blackRoyalEscortState;
            currentPlayerLightningCaptureState_LC = room.blackLightningCaptureState;
            playerQueensDomainState = room.blackQueensDomainState;
            currentPlayerKnightmareState = room.blackKnightmareState;
        }
        
        // Fallback initialization for states if they are somehow missing
        if (senderColor === 'white') {
            if (room.whiteAdvantage?.id === "focused_bishop" && !currentPlayerAdvantageState_FB) currentPlayerAdvantageState_FB = room.whiteFocusedBishopState = { focusedBishopUsed: false };
            if (room.whiteAdvantage?.id === "corner_blitz" && !currentPlayerRooksMoved_CB) currentPlayerRooksMoved_CB = room.whiteRooksMoved = { a1: false, h1: false, a8: false, h8: false };
            if (room.whiteAdvantage?.id === "royal_escort" && !currentPlayerRoyalEscortState_RE) currentPlayerRoyalEscortState_RE = room.whiteRoyalEscortState = { usedCount: 0 };
            if (room.whiteAdvantage?.id === "lightning_capture" && !currentPlayerLightningCaptureState_LC) currentPlayerLightningCaptureState_LC = room.whiteLightningCaptureState = { used: false };
            if (room.whiteAdvantage?.id === "queens_domain" && !playerQueensDomainState) playerQueensDomainState = room.whiteQueensDomainState = { isActive: false, hasUsed: false };
            if (room.whiteAdvantage?.id === "knightmare" && (!currentPlayerKnightmareState || typeof currentPlayerKnightmareState.hasUsed === 'undefined')) {
                 console.log(`[sendMove] Initializing/resetting whiteKnightmareState to {hasUsed: false} due to missing or malformed state.`);
                 currentPlayerKnightmareState = room.whiteKnightmareState = { hasUsed: false };
            }
        } else if (senderColor === 'black') {
            if (room.blackAdvantage?.id === "focused_bishop" && !currentPlayerAdvantageState_FB) currentPlayerAdvantageState_FB = room.blackFocusedBishopState = { focusedBishopUsed: false };
            if (room.blackAdvantage?.id === "corner_blitz" && !currentPlayerRooksMoved_CB) currentPlayerRooksMoved_CB = room.blackRooksMoved = { a1: false, h1: false, a8: false, h8: false };
            if (room.blackAdvantage?.id === "royal_escort" && !currentPlayerRoyalEscortState_RE) currentPlayerRoyalEscortState_RE = room.blackRoyalEscortState = { usedCount: 0 };
            if (room.blackAdvantage?.id === "lightning_capture" && !currentPlayerLightningCaptureState_LC) currentPlayerLightningCaptureState_LC = room.blackLightningCaptureState = { used: false };
            if (room.blackAdvantage?.id === "queens_domain" && !playerQueensDomainState) playerQueensDomainState = room.blackQueensDomainState = { isActive: false, hasUsed: false };
            if (room.blackAdvantage?.id === "knightmare" && (!currentPlayerKnightmareState || typeof currentPlayerKnightmareState.hasUsed === 'undefined')) {
                console.log(`[sendMove] Initializing/resetting blackKnightmareState to {hasUsed: false} due to missing or malformed state.`);
                currentPlayerKnightmareState = room.blackKnightmareState = { hasUsed: false };
            }
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

        // --- Royal Decree ENFORCEMENT ---
        if (room.royalDecreeRestriction && room.royalDecreeRestriction.targetColor === senderColor && !isRoyalDecreeOverridden) {
          const pieceBeingMoved = serverGame.get(receivedMove.from as any); // 'any' for Square type
          if (!pieceBeingMoved || pieceBeingMoved.type !== room.royalDecreeRestriction.pieceType) {
            console.warn(`[Royal Decree Server] Invalid move by ${senderColor}. Tried to move ${pieceBeingMoved?.type || 'empty square'} from ${receivedMove.from} instead of restricted ${room.royalDecreeRestriction.pieceType}.`);
            socket.emit("invalidMove", { 
              message: `Royal Decree Active: You must move a ${room.royalDecreeRestriction.pieceType.toUpperCase()}.`, 
              move: receivedMove // Use receivedMove here as per existing code
            });
            return; // Stop processing this move
          }
          console.log(`[Royal Decree Server] Move by ${senderColor} with piece ${pieceBeingMoved.type} matches restriction ${room.royalDecreeRestriction.pieceType}.`);
        }
        // --- End Royal Decree ENFORCEMENT ---

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
        } else if (receivedMove.special === "queens_domain_move") {
          console.log(`[SocketHandlers sendMove] Validating QD. Player: ${senderColor}. Current QD state from room: ${JSON.stringify(playerQueensDomainState)}. Special flag: ${clientMoveData.special}`);
          const playerAdvantage = senderColor === 'white' ? room.whiteAdvantage : room.blackAdvantage;
          if (!playerQueensDomainState || playerAdvantage?.id !== "queens_domain") {
            socket.emit("invalidMove", { message: "Queen's Domain state not found or advantage mismatch.", move: clientMoveData });
            return;
          }
          const validationGame = new Chess(originalFenBeforeAttempt!);
          const qdResult = validateQueensDomainServerMove({
            game: validationGame,
            clientMoveData: receivedMove as any,
            currentFen: originalFenBeforeAttempt!,
            playerColor: senderColor![0] as 'w' | 'b',
            queensDomainState: playerQueensDomainState, // Pass the current state
          });

          moveResult = qdResult.moveResult;

          if (moveResult && qdResult.nextFen) {
            serverGame.load(qdResult.nextFen);
            room.fen = qdResult.nextFen;
            // State updates (hasUsed, isActive) will be handled in the post-move logic block
            console.log(`[sendMove] Queen's Domain by ${senderColor} validated. New FEN: ${room.fen}.`);
          } else {
            console.warn(`[sendMove] Queen's Domain by ${senderColor} failed validation: ${qdResult.error}`);
            socket.emit("invalidMove", {
              message: qdResult.error || "Queen's Domain move invalid or illegal.",
              move: clientMoveData
            });
            moveResult = null;
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
        } else if (receivedMove.special === "lightning_capture") {
          const playerAdvantage = senderColor === 'white' ? room.whiteAdvantage : room.blackAdvantage;
          if (!currentPlayerLightningCaptureState_LC || playerAdvantage?.id !== "lightning_capture") {
            socket.emit("invalidMove", { message: "Lightning Capture state not found or advantage mismatch.", move: clientMoveData });
            return;
          }
          const validationGame = new Chess(originalFenBeforeAttempt!); // Use originalFen for validation
          const lcResult = validateLightningCaptureServerMove({
            game: validationGame, // Use temporary validation game instance
            clientMoveData: receivedMove as any, // Cast as any because ClientMovePayload might not perfectly match
            currentFen: originalFenBeforeAttempt!,
            playerColor: senderColor![0] as 'w' | 'b',
            lightningCaptureState: currentPlayerLightningCaptureState_LC,
          });

          moveResult = lcResult.moveResult; // This is the Move object for the *second* move of LC

          if (moveResult && lcResult.nextFen) {
            // Validation successful, update the main serverGame and room FEN
            serverGame.load(lcResult.nextFen); // Load the final state into serverGame
            room.fen = lcResult.nextFen;     // Update authoritative room FEN

            // Mark advantage as used
            currentPlayerLightningCaptureState_LC.used = true;
            if (senderColor === 'white') {
              room.whiteLightningCaptureState = currentPlayerLightningCaptureState_LC;
            } else {
              room.blackLightningCaptureState = currentPlayerLightningCaptureState_LC;
            }
             console.log(`[sendMove] Lightning Capture by ${senderColor} successful. New FEN: ${room.fen}. Advantage marked used.`);
          } else {
            // Validation failed, serverGame remains at originalFenBeforeAttempt
            // No need to serverGame.load(originalFenBeforeAttempt!) as validationGame was used.
             console.warn(`[sendMove] Lightning Capture by ${senderColor} failed validation: ${lcResult.error}`);
            socket.emit("invalidMove", {
              message: lcResult.error || "Lightning Capture move invalid or illegal.",
              move: clientMoveData
            });
            moveResult = null; // Ensure moveResult is null on failure
          }
        } else if (receivedMove.special === 'knightmare') {
          const playerAdvantage = senderColor === 'white' ? room.whiteAdvantage : room.blackAdvantage;
          // Ensure currentPlayerKnightmareState is defined before use, defaulting to { hasUsed: false } if not.
          // This handles cases where the advantage was just assigned or if state was somehow lost.
          const knightmareStateForValidation = currentPlayerKnightmareState || { hasUsed: false };
          console.log(`[sendMove] Knightmare state for validation: ${JSON.stringify(knightmareStateForValidation)}`);

          if (playerAdvantage?.id !== "knightmare") { 
            socket.emit("invalidMove", { message: "Knightmare advantage not active for player.", move: clientMoveData });
            return; 
          }
          const validationGame = new Chess(originalFenBeforeAttempt!); 
          const kmResult = validateKnightmareServerMove({
            game: validationGame,
            clientMoveData: receivedMove,
            currentFen: originalFenBeforeAttempt!,
            playerColor: senderColor![0] as 'w' | 'b',
            advantageState: knightmareStateForValidation, // Pass the potentially defaulted state
          });

          moveResult = kmResult.moveResult;

          if (moveResult && kmResult.nextFen) {
            serverGame.load(kmResult.nextFen); 
            room.fen = kmResult.nextFen;     

            if (senderColor === 'white') {
              room.whiteKnightmareState = kmResult.advantageStateUpdated;
            } else {
              room.blackKnightmareState = kmResult.advantageStateUpdated;
            }
            console.log(`[sendMove] Knightmare by ${senderColor} validated. New FEN: ${room.fen}. State: ${JSON.stringify(kmResult.advantageStateUpdated)}`);
          } else {
            console.warn(`[sendMove] Knightmare by ${senderColor} failed validation: ${kmResult.error}`);
            socket.emit("invalidMove", {
              message: kmResult.error || "Knightmare move invalid or illegal.",
              move: clientMoveData
            });
            moveResult = null; 
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
          let pawnAmbushFinalState: PawnAmbushState | undefined;
          let fenAfterPotentialAmbush = serverGame.fen(); // FEN after standard move, before ambush logic
          let ambushAppliedThisTurn = false;
          const currentPlayerAdvantage = senderColor === 'white' ? room.whiteAdvantage : room.blackAdvantage;

          // Apply Pawn Ambush if applicable. This modifies serverGame.
          if (currentPlayerAdvantage?.id === 'pawn_ambush' && senderColor && moveResult.piece === 'p') {
            const pawnAmbushParams: Parameters<typeof handlePawnAmbushServer>[0] = {
              game: serverGame, // serverGame is already updated by the initial serverGame.move()
              move: moveResult, // The result of the successful pawn move
              playerColor: senderColor[0] as 'w' | 'b',
              currentRoomState: {
                whitePawnAmbushState: room.whitePawnAmbushState,
                blackPawnAmbushState: room.blackPawnAmbushState,
                fen: serverGame.fen() 
              }
            };
            
            console.log(`[sendMove] Checking Pawn Ambush for ${senderColor}. Move: ${moveResult.from}-${moveResult.to}`);
            const ambushResult = handlePawnAmbushServer(pawnAmbushParams);

            if (ambushResult.promotionApplied && ambushResult.newFen) {
              // serverGame was already modified by handlePawnAmbushServer
              fenAfterPotentialAmbush = ambushResult.newFen; 
              pawnAmbushFinalState = ambushResult.updatedPawnAmbushState;
              ambushAppliedThisTurn = true;
              console.log(`[sendMove] Pawn Ambush provisionally applied for ${senderColor}. New FEN: ${fenAfterPotentialAmbush}`);
              // DO NOT set room.fen or room.xxxPawnAmbushState yet. That happens after deflection check.
            }
          }
          // serverGame instance now reflects the state after the original move AND potential ambush promotion.
          // fenAfterPotentialAmbush holds the FEN of this state.

          const isDeflected = handleAutoDeflect({
            game: serverGame, // Pass the game state that includes any ambush modifications
            moveResult: moveResult, // Original move object
            opponentAdvantage: opponentAdvantage,
          });

          if (isDeflected) {
            serverGame.load(originalFenBeforeAttempt); // Revert game instance to state before player's move
            room.fen = originalFenBeforeAttempt;      // Revert authoritative room FEN
            // Ambush is implicitly reverted because its changes to serverGame are wiped by load(),
            // and pawnAmbushFinalState is not committed to the room state.
            console.log(`[sendMove] Move by ${senderColor} was deflected. FEN reverted to ${originalFenBeforeAttempt}.`);
            socket.emit("moveDeflected", { move: clientMoveData }); 
          } else {
            // NOT deflected. Commit everything.
            // serverGame at this point has the FEN of fenAfterPotentialAmbush
            room.fen = fenAfterPotentialAmbush; // Commit FEN (post-move, post-ambush)

            // ---- Restless King Advantage Trigger Logic ----
            if (moveResult.piece === 'k' && senderColor && opponentColor && room.fen && room.restlessKingCheckBlock && room.restlessKingUsesLeft) {
              const playerAdvantage = senderColor === 'white' ? room.whiteAdvantage : room.blackAdvantage;
              if (playerAdvantage?.id === 'restless_king' && 
                  !isCastlingMove(moveResult, { type: 'k', color: senderColor[0] as 'w' | 'b' }) &&
                  room.restlessKingUsesLeft[senderColor] > 0
              ) {
                room.restlessKingCheckBlock[opponentColor] = true;
                room.restlessKingUsesLeft[senderColor]!--; // Non-null assertion as we checked > 0

                console.log(`[Restless King] Activated by ${senderColor} against ${opponentColor} in room ${roomId}. Uses left: ${room.restlessKingUsesLeft[senderColor]}`);
                io.to(roomId).emit("restlessKingActivated", { 
                  forColor: opponentColor, 
                  remaining: room.restlessKingUsesLeft[senderColor] 
                });
              }
            }
            // ---- End Restless King Advantage Trigger Logic ----
            
            // ---- Sacrificial Blessing Trigger Check ----
            // serverGame is already updated with the move that might include ambush.
            // moveResult is the original move object.
            if (moveResult.captured && senderColor && room && room.fen) { // Ensure room and room.fen are defined
              const capturedPieceType = moveResult.captured;
              // moveResult.color is the color of the piece *that moved* (the capturing piece)
              const capturedPieceOriginalColor = moveResult.color === 'w' ? 'b' : 'w'; 
            
              console.log(`[sendMove] Capture occurred: ${capturedPieceType} of color ${capturedPieceOriginalColor}. Checking Sacrificial Blessing.`);
            
              // Use a fresh Chess instance with the latest committed FEN for checks,
              // as serverGame might have been modified further by other logic not relevant to blessing trigger.
              const blessingCheckGame = new Chess(room.fen); 

              if (canTriggerSacrificialBlessing(blessingCheckGame, capturedPieceOriginalColor, capturedPieceType, room)) {
                const availablePieces = getPlaceableKnightsAndBishops(blessingCheckGame, capturedPieceOriginalColor);
                if (availablePieces.length > 0) {
                  const playerColorString = capturedPieceOriginalColor === 'w' ? 'white' : 'black';
                  room.sacrificialBlessingPending = { color: playerColorString, availablePieces };
            
                  let targetPlayerSocketId: string | undefined;
                  if (capturedPieceOriginalColor === 'w' && room.white) {
                    targetPlayerSocketId = room.white;
                  } else if (capturedPieceOriginalColor === 'b' && room.black) {
                    targetPlayerSocketId = room.black;
                  }
            
                  if (targetPlayerSocketId) {
                    console.log(`[SB Debug Server] Emitting sacrificialBlessingTriggered. fenAfterCapture being sent: ${room.fen}`);
                    io.to(targetPlayerSocketId).emit('sacrificialBlessingTriggered', { availablePieces, fenAfterCapture: room.fen });
                    console.log(`[Sacrificial Blessing] Triggered for ${playerColorString} (${targetPlayerSocketId}). Available pieces:`, availablePieces, `FEN: ${room.fen}`);
                  }
                } else {
                   console.log(`[Sacrificial Blessing] Trigger conditions met for ${capturedPieceOriginalColor}, but no placeable knights or bishops found.`);
                }
              } else {
                   console.log(`[Sacrificial Blessing] Conditions not met for ${capturedPieceOriginalColor} with captured ${capturedPieceType}.`);
              }
            }
            // ---- End SacrificialBlessing Trigger Check ----

            if (ambushAppliedThisTurn && pawnAmbushFinalState) {
              if (senderColor === 'white') {
                room.whitePawnAmbushState = pawnAmbushFinalState;
              } else {
                room.blackPawnAmbushState = pawnAmbushFinalState;
              }
              console.log(`[sendMove] Pawn Ambush for ${senderColor} committed. State:`, pawnAmbushFinalState);
            }

            // ---- Clear Royal Decree if it was active and followed ----
            if (room.royalDecreeRestriction && 
                room.royalDecreeRestriction.targetColor === senderColor &&
                !isRoyalDecreeOverridden) {
              
              console.log(`[Royal Decree Server] Clearing Royal Decree restriction for ${senderColor} (was targeting piece: ${room.royalDecreeRestriction.pieceType}) after successful move.`);
              room.royalDecreeRestriction = null;
            }
            // ---- End Clear Royal Decree ----

            // ---- Restless King Block RESET Logic ----
            // If a player successfully made a move and they were under the Restless King check block, lift it.
            if (senderColor && room.restlessKingCheckBlock?.[senderColor] === true) {
              room.restlessKingCheckBlock[senderColor] = false;
              console.log(`[Restless King] Check block lifted for ${senderColor} in room ${roomId} after successful move.`);
            }
            // ---- End Restless King Block RESET Logic ----

            // ---- Start of Silent Shield currentSquare update ---- (Keep as is, but uses the final serverGame state)
            let updatedShieldedPieceForEmit: ShieldedPieceInfo | null = null;
            if (room.silentShieldPieces && senderColor && moveResult) { 
              const playerShieldInfo = room.silentShieldPieces[senderColor];
              if (playerShieldInfo && moveResult.from === playerShieldInfo.currentSquare) {
                // If ambush happened, moveResult.to is where the pawn *landed* then promoted.
                // If the shielded piece was this pawn, its 'to' square is correct.
                playerShieldInfo.currentSquare = moveResult.to; 
                updatedShieldedPieceForEmit = playerShieldInfo;
              }
            }
            // ---- End of Silent Shield currentSquare update ----

            // ---- Queen's Domain State Update Post-Successful-Move (and not deflected) ----
            const playerAdvantageForQD = senderColor === 'white' ? room.whiteAdvantage : room.blackAdvantage;
            // playerQueensDomainState was fetched and initialized if necessary earlier in sendMove
            if (playerAdvantageForQD?.id === 'queens_domain' && playerQueensDomainState) {
              if (clientMoveData.special === 'queens_domain_move' && !playerQueensDomainState.hasUsed && moveResult) { // Check moveResult again to be sure
                console.log(`[SocketHandlers sendMove] Queen's Domain successfully used by ${senderColor}. Updating state.`);
                playerQueensDomainState.hasUsed = true;
                playerQueensDomainState.isActive = false;
                // Update the room state directly (it's a reference)
                if (senderColor === 'white') room.whiteQueensDomainState = playerQueensDomainState;
                else room.blackQueensDomainState = playerQueensDomainState;
                
                // This flag will be added to moveDataForBroadcast later
              } else if (playerQueensDomainState.isActive && !playerQueensDomainState.hasUsed) {
                // QD was active, but this move was not a QD special move (e.g. client validation failed, or different piece moved)
                console.log(`[SocketHandlers sendMove] Queen's Domain was active for ${senderColor} but not used for this move. Resetting isActive.`);
                playerQueensDomainState.isActive = false;
                if (senderColor === 'white') room.whiteQueensDomainState = playerQueensDomainState;
                else room.blackQueensDomainState = playerQueensDomainState;
              }
            }
            // ---- End Queen's Domain State Update ----

            // ---- Queenly Compensation Main Logic ----
            let qcTriggeredThisTurn = false;
            if (moveResult && moveResult.captured === 'q' && room.fen) { // Check if a queen was captured
              const playerWithAdvantageColor = moveResult.color === 'w' ? 'b' : 'w'; // The one whose queen was captured
              let qcAdvantagePlayerSocketId: string | undefined;
              let qcAdvantagePlayerCurrentState: { hasUsed: boolean } | undefined;
              let qcPlayerAdvantageType: 'white' | 'black' | undefined;

              if (playerWithAdvantageColor === 'w' && room.whiteAdvantage?.id === 'queenly_compensation' && room.whiteQueenlyCompensationState) {
                qcAdvantagePlayerSocketId = room.white;
                qcAdvantagePlayerCurrentState = room.whiteQueenlyCompensationState;
                qcPlayerAdvantageType = 'white';
              } else if (playerWithAdvantageColor === 'b' && room.blackAdvantage?.id === 'queenly_compensation' && room.blackQueenlyCompensationState) {
                qcAdvantagePlayerSocketId = room.black;
                qcAdvantagePlayerCurrentState = room.blackQueenlyCompensationState;
                qcPlayerAdvantageType = 'black';
              }

              if (qcAdvantagePlayerSocketId && qcAdvantagePlayerCurrentState && qcPlayerAdvantageType && !qcAdvantagePlayerCurrentState.hasUsed) {
                console.log(`[QueenlyCompensation Trigger] Checking for ${qcPlayerAdvantageType} player (${qcAdvantagePlayerSocketId})`);
                
                const playerSpecificAdvantageStates: PlayerAdvantageStates = {};
                if (qcPlayerAdvantageType === 'white') {
                    playerSpecificAdvantageStates.queenly_compensation = room.whiteQueenlyCompensationState;
                } else {
                    playerSpecificAdvantageStates.queenly_compensation = room.blackQueenlyCompensationState;
                }

                const qcGame = new Chess(room.fen); // Use the latest FEN before QC effect
                const qcResult = handleQueenlyCompensation({
                  game: qcGame,
                  move: moveResult, 
                  playerColor: playerWithAdvantageColor,
                  advantageStates: playerSpecificAdvantageStates,
                });

                if (qcResult.used && qcResult.newFen && qcResult.updatedAdvantageStates?.queenly_compensation) {
                  console.log(`[QueenlyCompensation Trigger] Advantage used by ${qcPlayerAdvantageType}. New FEN: ${qcResult.newFen}`);
                  room.fen = qcResult.newFen; 
                  serverGame.load(qcResult.newFen); 

                  if (qcPlayerAdvantageType === 'white') {
                    room.whiteQueenlyCompensationState = qcResult.updatedAdvantageStates.queenly_compensation;
                  } else {
                    room.blackQueenlyCompensationState = qcResult.updatedAdvantageStates.queenly_compensation;
                  }
                  qcTriggeredThisTurn = true;
                }
              }
            }
            // ---- End Queenly Compensation Main Logic ----
            
            console.log(`[sendMove] Move by ${senderColor} validated (not deflected). Final FEN for room ${roomId}: ${room.fen}`);
            
            let moveDataForBroadcast: ServerMovePayload = { 
                ...clientMoveData, 
                color: senderColor!,
                ...(ambushAppliedThisTurn && { wasPawnAmbush: true }) 
                // afterFen will be set below
            };

            // Set the definitive FEN for the client AFTER all server-side effects (like QC) are applied
            moveDataForBroadcast.afterFen = room.fen;
            console.log(`[SocketHandlers sendMove] Setting final afterFen for broadcast: ${room.fen}`);

            // ---- Add effects to broadcast ----

            // Queenly Compensation broadcast effects
            if (qcTriggeredThisTurn) {
                const playerWhoseQueenWasCapturedColor = moveResult.color === 'w' ? 'b' : 'w'; // moveResult is safe to use here
                let qcStateForBroadcast: { hasUsed: boolean } | undefined;
                if (playerWhoseQueenWasCapturedColor === 'w' && room.whiteAdvantage?.id === 'queenly_compensation') {
                    qcStateForBroadcast = room.whiteQueenlyCompensationState;
                } else if (playerWhoseQueenWasCapturedColor === 'b' && room.blackAdvantage?.id === 'queenly_compensation') {
                    qcStateForBroadcast = room.blackQueenlyCompensationState;
                }

                if (qcStateForBroadcast?.hasUsed) { 
                    console.log(`[QueenlyCompensation Trigger] Adding QC effects to broadcast. FEN: ${room.fen}`);
                    moveDataForBroadcast.specialServerEffect = 'queenly_compensation_triggered';
                    moveDataForBroadcast.updatedAdvantageStates = {
                        ...moveDataForBroadcast.updatedAdvantageStates,
                        queenly_compensation: qcStateForBroadcast,
                    };
                }
            }

            // Knightmare broadcast effects
            if (receivedMove.special === 'knightmare' && senderColor) {
                const playerKnightmareState = senderColor === 'white' ? room.whiteKnightmareState : room.blackKnightmareState;
                if (playerKnightmareState) {
                    const advStatesUpdate: Partial<PlayerAdvantageStates> = {
                        knightmare: playerKnightmareState 
                    };
                    moveDataForBroadcast.updatedAdvantageStates = {
                        ...moveDataForBroadcast.updatedAdvantageStates, // Preserve QC state if set
                        ...advStatesUpdate
                    };
                    console.log(`[sendMove] Knightmare by ${senderColor}: Attaching updatedAdvantageStates to broadcast: ${JSON.stringify(moveDataForBroadcast.updatedAdvantageStates)}`);
                }
            }
            
            // Queen's Domain consumed broadcast effect
            // Note: playerAdvantageForQD was defined much earlier in sendMove.
            // Ensure it's still in scope or redefine if necessary. For this diff, assuming it's available.
            const currentSenderQueensDomainState = senderColor === 'white' ? room.whiteQueensDomainState : room.blackQueensDomainState;
            if (playerAdvantageForQD?.id === 'queens_domain' && 
                clientMoveData.special === 'queens_domain_move' && 
                currentSenderQueensDomainState?.hasUsed === true) {
                moveDataForBroadcast.specialServerEffect = 'queens_domain_consumed';
            }
            
            // Ambush promotion details for broadcast
            if (moveResult.promotion && ambushAppliedThisTurn) {
                console.warn("[sendMove] Conflict: Standard promotion and Pawn Ambush on same move? This shouldn't happen if ranks are different.");
                moveDataForBroadcast.wasPawnAmbush = false; 
                moveDataForBroadcast.promotion = moveResult.promotion;
            } else if (ambushAppliedThisTurn) {
                moveDataForBroadcast.promotion = 'q'; // Explicitly state queen promotion due to ambush
            }
            // --- End Add effects to broadcast ---

            const payload = {
                move: moveDataForBroadcast,
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

            // ---- Queen's Domain State Update Post-Move ----
            const playerAdvantageForQD = senderColor === 'white' ? room.whiteAdvantage : room.blackAdvantage;
            // Use playerQueensDomainState which was fetched earlier and initialized if necessary
            if (playerAdvantageForQD?.id === 'queens_domain' && playerQueensDomainState) {
              if (clientMoveData.special === 'queens_domain_move' && !playerQueensDomainState.hasUsed && moveResult) { // Check moveResult to ensure QD was successful
                console.log(`[SocketHandlers] Queen's Domain used by ${senderColor} for move. Updating state.`);
                playerQueensDomainState.hasUsed = true;
                playerQueensDomainState.isActive = false;
                // Add a flag to the broadcasted move so client knows QD was consumed this move
                // This assumes moveDataForBroadcast is accessible here or modified on the payload object directly
                // This needs to be integrated with where `moveDataForBroadcast` is defined and used in the `receiveMove` emission.
                // For now, let's assume we modify `payload.move` before emitting.
                // The `payload` is defined in the `else { // NOT deflected }` block.
                // This logic should be *inside* that block, before `io.to(roomId).emit("receiveMove", payload);`
              } else if (playerQueensDomainState.isActive && !playerQueensDomainState.hasUsed) {
                // Queen's Domain was active, but this specific move was not a QD special move
                console.log(`[SocketHandlers] Queen's Domain was active for ${senderColor} but not used for this move. Resetting isActive.`);
                playerQueensDomainState.isActive = false;
              }
              // Update the room state (important if playerQueensDomainState was a copy, but it's a direct reference)
              if (senderColor === 'white') room.whiteQueensDomainState = playerQueensDomainState;
              else room.blackQueensDomainState = playerQueensDomainState;
            }
            // ---- End Queen's Domain State Update Post-Move ----
            // This (the QD state update block) was moved to be inside the `if (moveResult && room.fen === serverGame.fen())` block,
            // which is fine as it ensures the state is updated only for truly committed moves.
            // The specialServerEffect addition needs to be before the payload emission,
            // and after the QD state is updated.
            // The current placement of specialServerEffect addition (just above) should be correct
            // relative to the payload emission.
        }

      });
    });

    socket.on("openingSwap", ({ roomId, from, to }: { roomId: string; from: string; to: string }) => {
      const room = rooms[roomId];
      const playerSocketId = socket.id;

      if (!room) {
        socket.emit("openingSwapFailed", { message: "Room not found." });
        return;
      }

      const serverGame = new Chess(room.fen);
      let playerColor: 'white' | 'black' | null = null;
      let playerAdvantage: Advantage | undefined;
      let playerOpeningSwapState: OpeningSwapState | undefined;

      if (room.white === playerSocketId) {
        playerColor = 'white';
        playerAdvantage = room.whiteAdvantage;
        playerOpeningSwapState = room.whiteOpeningSwapState;
      } else if (room.black === playerSocketId) {
        playerColor = 'black';
        playerAdvantage = room.blackAdvantage;
        playerOpeningSwapState = room.blackOpeningSwapState;
      } else {
        socket.emit("openingSwapFailed", { message: "Player not found in this room." });
        return;
      }

      // Validation
      if (playerAdvantage?.id !== "opening_swap") {
        socket.emit("openingSwapFailed", { message: "You do not have the Opening Swap advantage." });
        return;
      }

      if (playerOpeningSwapState?.hasSwapped) {
        socket.emit("openingSwapFailed", { message: "You have already used the Opening Swap." });
        return;
      }

      // Check if it's before the player's first actual move.
      // This can be tricky. A simple check is history length, but need to ensure it's THEIR first move.
      // For simplicity, we'll allow swap if game history is 0, assuming server controls game start properly.
      // More robust: check serverGame.history({verbose:true}) for moves by this player.
      // Or, ensure this event can only be processed if no 'sendMove' has been successfully processed for this player.
      // Current implementation of client sends this before any move, so history length 0 is a good start.
      if (serverGame.history().length > 0) {
          // A more specific check could be added here to see if THIS player has moved.
          // For now, any move on the board prevents the swap.
          socket.emit("openingSwapFailed", { message: "Opening Swap can only be used before the first move of the game." });
          return;
      }
      
      const playerRank = playerColor === 'white' ? '1' : '8';
      if (from[1] !== playerRank || to[1] !== playerRank) {
        socket.emit("openingSwapFailed", { message: "Both pieces must be on your back rank." });
        return;
      }

      if (from === to) {
        socket.emit("openingSwapFailed", { message: "Cannot swap a piece with itself." });
        return;
      }

      const pieceFrom = serverGame.get(from as any);
      const pieceTo = serverGame.get(to as any);

      if (!pieceFrom || !pieceTo) {
        socket.emit("openingSwapFailed", { message: "Invalid squares selected." });
        return;
      }

      if (pieceFrom.color !== playerColor[0] || pieceTo.color !== playerColor[0]) {
          socket.emit("openingSwapFailed", { message: "You can only swap your own pieces." });
          return;
      }

      if (pieceFrom.type === 'k' || pieceTo.type === 'k') {
        socket.emit("openingSwapFailed", { message: "The King cannot be swapped." });
        return;
      }

      // Perform the swap
      serverGame.remove(from as any);
      serverGame.remove(to as any);
      serverGame.put(pieceFrom, to as any);
      serverGame.put(pieceTo, from as any);

      room.fen = serverGame.fen(); // Update room FEN

      if (playerColor === 'white' && room.whiteOpeningSwapState) {
        room.whiteOpeningSwapState.hasSwapped = true;
      } else if (playerColor === 'black' && room.blackOpeningSwapState) {
        room.blackOpeningSwapState.hasSwapped = true;
      }

      console.log(`[Opening Swap SUCCESS] Room ${roomId}, Player ${playerColor} swapped ${from} and ${to}. New FEN: ${room.fen}`);
      io.to(roomId).emit("openingSwapSuccess", { newFen: room.fen, from, to, color: playerColor });
    });

    socket.on("royalDecree", ({ roomId, pieceType }: { roomId: string; pieceType: string }) => {
      const room = rooms[roomId];
      const senderId = socket.id;

      if (!room) {
        console.error(`[Royal Decree Server] Room ${roomId} not found.`);
        socket.emit("royalDecreeFailed", { message: "Room not found." });
        return;
      }

      let senderColor: "white" | "black" | null = null;
      let opponentColor: "white" | "black" | null = null;
      let opponentSocketId: string | undefined;

      if (senderId === room.white) {
        senderColor = "white";
        opponentColor = "black";
        opponentSocketId = room.black;
      } else if (senderId === room.black) {
        senderColor = "black";
        opponentColor = "white";
        opponentSocketId = room.white;
      } else {
        console.error(`[Royal Decree Server] Sender ${senderId} not in room ${roomId}.`);
        socket.emit("royalDecreeFailed", { message: "You are not a player in this room." });
        return;
      }

      if (!room.fen) {
        console.error(`[Royal Decree Server] Room ${roomId} has no FEN state.`);
        socket.emit("royalDecreeFailed", { message: "Game state (FEN) not found." });
        return;
      }
      const serverGame = new Chess(room.fen);

      if (serverGame.turn() !== senderColor[0]) {
        socket.emit("royalDecreeFailed", { message: "Not your turn." });
        return;
      }

      const playerAdvantage = senderColor === "white" ? room.whiteAdvantage : room.blackAdvantage;
      if (playerAdvantage?.id !== "royal_decree") {
        socket.emit("royalDecreeFailed", { message: "You do not have Royal Decree." });
        return;
      }

      const hasUsedDecree = senderColor === "white" ? room.whiteHasUsedRoyalDecree : room.blackHasUsedRoyalDecree;
      if (hasUsedDecree) {
        socket.emit("royalDecreeFailed", { message: "Royal Decree already used." });
        return;
      }

      const validPieceTypes = ["p", "n", "b", "r", "q", "k"];
      if (!validPieceTypes.includes(pieceType)) {
        socket.emit("royalDecreeFailed", { message: "Invalid piece type specified." });
        return;
      }

      // Apply Decree
      if (senderColor === "white") {
        room.whiteHasUsedRoyalDecree = true;
      } else {
        room.blackHasUsedRoyalDecree = true;
      }
      room.royalDecreeRestriction = { targetColor: opponentColor!, pieceType };

      console.log(`[Royal Decree Server] Player ${senderColor} (${senderId}) activated Royal Decree in room ${roomId}. Opponent (${opponentColor}) restricted to ${pieceType}.`);

      if (opponentSocketId) {
        io.to(opponentSocketId).emit("royalDecreeApplied", { pieceType, restrictedPlayerColor: opponentColor });
      }
      socket.emit("royalDecreeConfirmed");
    });

    socket.on("placeSacrificialBlessingPiece", ({ roomId, pieceSquare, toSquare }: { roomId: string; pieceSquare: string; toSquare: string }) => {
      const room = rooms[roomId];
      if (!room || !room.fen || !room.sacrificialBlessingPending) {
        socket.emit("sacrificialBlessingFailed", { message: "Invalid room state or blessing not pending." });
        return;
      }

      const playerSocketId = socket.id;
      const pendingColor = room.sacrificialBlessingPending.color; // 'white' or 'black'
      const playerColorChar = pendingColor === 'white' ? 'w' : 'b';

      if ((pendingColor === 'white' && playerSocketId !== room.white) || (pendingColor === 'black' && playerSocketId !== room.black)) {
        socket.emit("sacrificialBlessingFailed", { message: "Not your turn to use sacrificial blessing or not authorized." });
        return;
      }

      const gameInstance = new Chess(room.fen); // Create a new game instance for this operation

      const placementResult = handleSacrificialBlessingPlacement(
        gameInstance,
        playerColorChar,
        pieceSquare as any, // chess.js Square type
        toSquare as any     // chess.js Square type
      );

      if (placementResult.success && placementResult.newFen) {
        room.fen = placementResult.newFen; // Update the authoritative FEN

        // Mark advantage as used
        if (pendingColor === 'white') {
          room.whiteHasUsedSacrificialBlessing = true;
        } else {
          room.blackHasUsedSacrificialBlessing = true;
        }
        
        room.sacrificialBlessingPending = null; // Clear pending state

        // Broadcast the board update. IMPORTANT: This is not a regular move, so turn does not change.
        // The client needs to know the FEN updated without a turn change.
        io.to(roomId).emit("boardUpdateFromBlessing", { newFen: room.fen, playerWhoUsedBlessing: pendingColor });
        
        console.log(`[Sacrificial Blessing] Player ${pendingColor} used Sacrificial Blessing. Piece from ${pieceSquare} to ${toSquare}. New FEN: ${room.fen}`);
      } else {
        socket.emit("sacrificialBlessingFailed", { message: placementResult.error || "Failed to place piece." });
      }
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

    socket.on("setAdvantageActiveState", ({ roomId, advantageId, isActive }: { roomId: string; advantageId: string; isActive: boolean }) => {
      console.log(`[SocketHandlers setAdvantageActiveState] Received. Room: ${roomId}, AdvID: ${advantageId}, isActive: ${isActive}, SocketID: ${socket.id}`);
      const room = rooms[roomId];
      if (!room) {
        console.error(`[setAdvantageActiveState] Room ${roomId} not found.`);
        socket.emit("serverError", { message: "Room not found." });
        return;
      }

      const playerSocketId = socket.id;
      let playerColor: 'white' | 'black' | null = null;
      let playerQueensDomainState: { isActive: boolean; hasUsed: boolean } | undefined;

      if (room.white === playerSocketId) {
        playerColor = 'white';
        playerQueensDomainState = room.whiteQueensDomainState;
      } else if (room.black === playerSocketId) {
        playerColor = 'black';
        playerQueensDomainState = room.blackQueensDomainState;
      } else {
        console.error(`[setAdvantageActiveState] Player ${playerSocketId} not in room ${roomId}.`);
        // Optionally emit an error back to the client
        return;
      }

      if (advantageId === "queens_domain" && playerColor) {
        if (playerQueensDomainState) {
          if (!playerQueensDomainState.hasUsed) {
            console.log(`[SocketHandlers setAdvantageActiveState] Player ${playerColor}. Current QD state: ${JSON.stringify(playerQueensDomainState)}. Setting isActive to: ${isActive}`);
            playerQueensDomainState.isActive = isActive;
            console.log(`[SocketHandlers setAdvantageActiveState] Player ${playerColor}. New QD state: ${JSON.stringify(playerQueensDomainState)}. Emitting advantageStateUpdated.`);
            
            // Confirm state change back to the activating client
            // This payload should match what the client expects for its advantage states
            const updatedPlayerAdvantageStates: Partial<PlayerAdvantageStates> = {
              queens_domain: { ...playerQueensDomainState } // Send a copy
            };
            io.to(socket.id).emit("advantageStateUpdated", updatedPlayerAdvantageStates);

          } else {
            console.log(`[setAdvantageActiveState] Queen's Domain for ${playerColor} in room ${roomId} has already been used. Cannot change isActive state.`);
            // Optionally inform client it's already used if they try to activate
             const updatedPlayerAdvantageStates: Partial<PlayerAdvantageStates> = {
              queens_domain: { ...playerQueensDomainState } 
            };
            io.to(socket.id).emit("advantageStateUpdated", updatedPlayerAdvantageStates);
          }
        } else {
          console.warn(`[setAdvantageActiveState] Queen's Domain state not found for ${playerColor} in room ${roomId}. This might indicate an initialization issue.`);
        }
      }
      // Can add else if for other advantages that might have client-toggleable active states
    });

  });
}