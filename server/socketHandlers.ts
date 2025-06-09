import { Server, Socket } from "socket.io";
import { Chess, Move, Square, PieceSymbol } from "chess.js"; // Import Chess and Move
import { assignRandomAdvantage } from "./assignAdvantage";
import { Advantage, ShieldedPieceInfo, PlayerAdvantageStates, RoyalEscortState, ServerMovePayload, OpeningSwapState, SacrificialBlessingPendingState, CloakState, SummonNoShowBishopPayload, RecallState } from "../shared/types";
import { assignCloakedPiece, handleCloakTurn, removeCloakOnCapture } from "./logic/advantages/cloak";
import { applyArcaneReinforcement } from "./logic/advantages/arcaneReinforcement";
import { validateRecallServerWithUID } from './logic/advantages/recall';
import { handleNoShowBishopServer } from './logic/advantages/noShowBishop';
import { handleQueenlyCompensation } from './logic/advantages/queenlyCompensation';
import { handlePawnRush } from "./logic/advantages/pawnRush";
import { handleCastleMaster } from "./logic/advantages/castleMaster";
import { handleAutoDeflect } from "./logic/advantages/autoDeflect";
import { handleShieldWallServer } from "./logic/advantages/shieldWall";
import { getVoidStepPath } from './logic/advantages/voidStep';
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
import { LightningCaptureState, PawnAmbushState, CoordinatedPushState } from "../shared/types"; // Added PawnAmbushState and CoordinatedPushState
import { validateCoordinatedPushServerMove } from './logic/advantages/coordinatedPush'; // Added
import { handlePawnAmbushServer } from './logic/advantages/pawnAmbush'; // Added
import { canTriggerSacrificialBlessing, getPlaceableKnightsAndBishops, handleSacrificialBlessingPlacement } from './logic/advantages/sacrificialBlessing';
import { validateVoidStepServerMove } from './logic/advantages/voidStep';

console.log("setupSocketHandlers loaded");

// Define the AdvantageDetailsPayload interface
interface AdvantageDetailsPayload {
  spawnedSquare?: Square; // For Arcane Reinforcement
  cloak?: CloakState; // For Cloak
  noShowBishopUsed?: boolean; // For No-Show Bishop
  removedBishopDetails?: { square: Square; type: PieceSymbol }; // For No-Show Bishop
  shieldedPiece?: ShieldedPieceInfo; // For Silent Shield
  // Add other optional properties for other advantages if they use advantageDetails
}

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

export type PieceTrackingInfo = {
  type: PieceSymbol;
  color: 'w' | 'b';
  square: Square | null; // null if captured
  alive: boolean;
  history: Square[]; // squares occupied, in order
  promotedTo?: PieceSymbol; // for promotions, optional
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
  whiteCoordinatedPushState?: CoordinatedPushState;
  blackCoordinatedPushState?: CoordinatedPushState;
  whiteCloakState?: CloakState;
  blackCloakState?: CloakState;
  whiteNoShowBishopUsed?: boolean;
  blackNoShowBishopUsed?: boolean;
  whiteNoShowBishopRemovedPiece?: { square: Square, type: PieceSymbol };
  blackNoShowBishopRemovedPiece?: { square: Square, type: PieceSymbol };
  whiteVoidStepState?: { isActive: boolean; hasUsed: boolean };
  blackVoidStepState?: { isActive: boolean; hasUsed: boolean };
  fenHistory?: string[];
  whiteRecallState?: RecallState;
  blackRecallState?: RecallState;
  pieceTracking?: Record<string, PieceTrackingInfo>;
  pieceTrackingHistory?: Record<string, PieceTrackingInfo>[];

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
          whiteCoordinatedPushState: { active: false, usedThisTurn: false },
          blackCoordinatedPushState: { active: false, usedThisTurn: false },
          whiteCloakState: undefined, 
          blackCloakState: undefined,
          whiteNoShowBishopUsed: false,
          blackNoShowBishopUsed: false,
          whiteNoShowBishopRemovedPiece: undefined,
          blackNoShowBishopRemovedPiece: undefined,
          whiteVoidStepState: { isActive: false, hasUsed: false },
          blackVoidStepState: { isActive: false, hasUsed: false },
          fenHistory: [],
          whiteRecallState: { used: false },
          blackRecallState: { used: false },
        };
        room = rooms[roomId]; // Assign the newly created room to the local variable
        console.log(`[joinRoom] Room ${roomId} created with starting FEN: ${room.fen} and default advantage states including Knightmare, Queenly Compensation ({hasUsed: false}), Arcane Reinforcement (null), Coordinated Push ({ active: false, usedThisTurn: false }), Cloak (undefined), No-Show Bishop (false, undefined), fenHistory ([]), and Recall ({used: false}).`);
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
        if (!room.whiteCoordinatedPushState) room.whiteCoordinatedPushState = { active: false, usedThisTurn: false };
        if (!room.blackCoordinatedPushState) room.blackCoordinatedPushState = { active: false, usedThisTurn: false };
        if (room.whiteCloakState === undefined) room.whiteCloakState = undefined;
        if (room.blackCloakState === undefined) room.blackCloakState = undefined;
        // No-Show Bishop states
        if (room.whiteNoShowBishopUsed === undefined) room.whiteNoShowBishopUsed = false;
        if (room.blackNoShowBishopUsed === undefined) room.blackNoShowBishopUsed = false;
        if (room.whiteNoShowBishopRemovedPiece === undefined) room.whiteNoShowBishopRemovedPiece = undefined;
        if (room.blackNoShowBishopRemovedPiece === undefined) room.blackNoShowBishopRemovedPiece = undefined;
        if (room.whiteVoidStepState === undefined) room.whiteVoidStepState = { isActive: false, hasUsed: false };
        if (room.blackVoidStepState === undefined) room.blackVoidStepState = { isActive: false, hasUsed: false };
        if (room.fenHistory === undefined) room.fenHistory = [];
        if (room.whiteRecallState === undefined) room.whiteRecallState = { used: false };
        if (room.blackRecallState === undefined) room.blackRecallState = { used: false };
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

        // ---- No-Show Bishop Removal Logic ----
        // This must happen AFTER advantages are assigned and BEFORE the final initial FEN is set.
        // It modifies the initialGame instance.

        // White No-Show Bishop
        if (room.whiteAdvantage?.id === 'no_show_bishop' && room.white) {
            const whiteBishops: { square: Square; type: PieceSymbol }[] = [];
            const squares: Square[] = ['c1', 'f1']; // Standard starting squares for white bishops
            for (const sq of squares) {
                const piece = initialGame.get(sq);
                if (piece && piece.type === 'b' && piece.color === 'w') {
                    whiteBishops.push({ square: sq, type: piece.type as PieceSymbol });
                }
            }

            if (whiteBishops.length > 0) {
                const selectedBishop = whiteBishops[Math.floor(Math.random() * whiteBishops.length)];
                room.whiteNoShowBishopRemovedPiece = { square: selectedBishop.square, type: selectedBishop.type };
                initialGame.remove(selectedBishop.square as Square);
                console.log(`[No-Show Bishop] White (${room.white}) has No-Show Bishop. Removed ${selectedBishop.type} from ${selectedBishop.square}. FEN preview: ${initialGame.fen()}`);
            } else {
                console.warn(`[No-Show Bishop] White (${room.white}) has No-Show Bishop, but no starting bishops found to remove. This might be due to other advantages modifying the board (e.g. Arcane Reinforcement placing a bishop).`);
                // Ensure the state reflects that no piece was removed, though advantage is active.
                room.whiteNoShowBishopRemovedPiece = undefined;
            }
        }

        // Black No-Show Bishop
        if (room.blackAdvantage?.id === 'no_show_bishop' && room.black) {
            const blackBishops: { square: Square; type: PieceSymbol }[] = [];
            const squares: Square[] = ['c8', 'f8']; // Standard starting squares for black bishops
            for (const sq of squares) {
                const piece = initialGame.get(sq);
                if (piece && piece.type === 'b' && piece.color === 'b') {
                    blackBishops.push({ square: sq, type: piece.type as PieceSymbol });
                }
            }

            if (blackBishops.length > 0) {
                const selectedBishop = blackBishops[Math.floor(Math.random() * blackBishops.length)];
                room.blackNoShowBishopRemovedPiece = { square: selectedBishop.square, type: selectedBishop.type };
                initialGame.remove(selectedBishop.square as Square);
                console.log(`[No-Show Bishop] Black (${room.black}) has No-Show Bishop. Removed ${selectedBishop.type} from ${selectedBishop.square}. FEN preview: ${initialGame.fen()}`);
            } else {
                console.warn(`[No-Show Bishop] Black (${room.black}) has No-Show Bishop, but no starting bishops found to remove. This might be due to other advantages modifying the board.`);
                room.blackNoShowBishopRemovedPiece = undefined;
            }
        }
        // ---- End No-Show Bishop Removal Logic ----
        
        // Now that Arcane Reinforcement, No-Show Bishop, and any other pre-game board modifiers are applied,
        // set the definitive starting FEN for the room.
        room.fen = initialGame.fen();
        console.log(`[joinRoom] Definitive starting FEN for room ${roomId} after all pre-game advantages: ${room.fen}`);

        // --- Assign unique IDs to all pieces for tracking ---
        room.pieceTracking = {};
        let uidCounter = 1;
        const chessForTracking = new Chess(room.fen);
        for (let r = 1; r <= 8; r++) {
          for (let c = 0; c < 8; c++) {
            const square = (String.fromCharCode(97 + c) + r) as Square;
            const piece = chessForTracking.get(square);
            if (piece) {
              const uid = `${piece.color}_${piece.type}_${uidCounter++}`;
              room.pieceTracking[uid] = {
                type: piece.type,
                color: piece.color,
                square,
                alive: true,
                history: [square],
              };
            }
          }
        }

    // Initialize Cloak State for White Player
    if (room.whiteAdvantage?.id === 'cloak' && room.white) {
        const gameInstanceForCloakAssignment = new Chess(room.fen!); // Use the final starting FEN
        const pieceId = assignCloakedPiece(gameInstanceForCloakAssignment, 'white');
        if (pieceId) {
            room.whiteCloakState = { pieceId, turnsRemaining: 10 };
            console.log(`[Cloak Init] White player (${room.white}) assigned Cloak. Piece: ${pieceId}, Turns: 20`);
        } else {
            console.error(`[Cloak Init] Failed to assign cloaked piece for white player ${room.white}.`);
        }
    }

    // Initialize Cloak State for Black Player
    if (room.blackAdvantage?.id === 'cloak' && room.black) {
        const gameInstanceForCloakAssignment = new Chess(room.fen!); // Use the final starting FEN
        const pieceId = assignCloakedPiece(gameInstanceForCloakAssignment, 'black');
        if (pieceId) {
            room.blackCloakState = { pieceId, turnsRemaining: 10 };
            console.log(`[Cloak Init] Black player (${room.black}) assigned Cloak. Piece: ${pieceId}, Turns: 20`);
        } else {
            console.error(`[Cloak Init] Failed to assign cloaked piece for black player ${room.black}.`);
        }
    }
    if (room.whiteCloakState) console.log(`[Cloak Server socketHandlers - GameStart] White cloak state initialized:`, JSON.stringify(room.whiteCloakState));
    if (room.blackCloakState) console.log(`[Cloak Server socketHandlers - GameStart] Black cloak state initialized:`, JSON.stringify(room.blackCloakState));

        // White player's advantage processing & emitting advantageAssigned
        if (room.whiteAdvantage && room.white) {
            const whitePlayerSocket = io.sockets.sockets.get(room.white);
            if (whitePlayerSocket) {
                let whiteAdvantageDetails: AdvantageDetailsPayload = {};

                if (room.whiteAdvantage.id === "silent_shield" && room.silentShieldPieces) {
                    const whiteShieldedPiece = selectProtectedPiece(initialGame, 'w');
                    if (whiteShieldedPiece) {
                        room.silentShieldPieces.white = whiteShieldedPiece;
                        whiteAdvantageDetails.shieldedPiece = whiteShieldedPiece;
                        console.log(`White player (${room.white}) protected piece: ${whiteShieldedPiece.type} at ${whiteShieldedPiece.initialSquare}`);
                    }
                }
                if (room.whiteAdvantage.id === "royal_escort") {
                    room.whiteRoyalEscortState = { usedCount: 0 };
                    console.log(`White player (${room.white}) assigned Royal Escort, state initialized.`);
                }
                if (room.whiteAdvantage.id === "lightning_capture") {
                    room.whiteLightningCaptureState = { used: false };
                    console.log(`White player (${room.white}) assigned Lightning Capture, state initialized.`);
                }
                if (room.whiteAdvantage.id === "opening_swap") {
                    room.whiteOpeningSwapState = { hasSwapped: false };
                    console.log(`White player (${room.white}) assigned Opening Swap, state initialized.`);
                }
                if (room.whiteAdvantage.id === "pawn_ambush") {
                    room.whitePawnAmbushState = { ambushedPawns: [] };
                    console.log(`White player (${room.white}) assigned Pawn Ambush, state initialized.`);
                }
                if (room.whiteAdvantage.id === "royal_decree") {
                    room.whiteHasUsedRoyalDecree = false;
                    console.log(`White player (${room.white}) assigned Royal Decree, state initialized.`);
                }
                if (room.whiteAdvantage.id === "queens_domain") {
                    room.whiteQueensDomainState = { isActive: false, hasUsed: false };
                    console.log(`White player (${room.white}) assigned Queen's Domain, state initialized.`);
                }
                if (room.whiteAdvantage.id === "knightmare") {
                    room.whiteKnightmareState = { hasUsed: false };
                    console.log(`White player (${room.white}) assigned Knightmare, state initialized: ${JSON.stringify(room.whiteKnightmareState)}`);
                }
                if (room.whiteAdvantage.id === "queenly_compensation") {
                    room.whiteQueenlyCompensationState = { hasUsed: false };
                    console.log(`White player (${room.white}) assigned Queenly Compensation, state initialized.`);
                }
                if (room.whiteAdvantage.id === "arcane_reinforcement") {
                    whiteAdvantageDetails.spawnedSquare = room.whiteArcaneReinforcementSpawnedSquare ?? undefined;
                    console.log(`White player (${room.white}) assigned Arcane Reinforcement. Spawned at: ${room.whiteArcaneReinforcementSpawnedSquare}`);
                }
                if (room.whiteAdvantage.id === "cloak" && room.whiteCloakState) {
                    whiteAdvantageDetails.cloak = room.whiteCloakState;
                    console.log(`[Cloak Server socketHandlers - advantageAssigned] Emitting cloak details for white:`, JSON.stringify(room.whiteCloakState));
                }
                if (room.whiteAdvantage.id === "no_show_bishop") {
                    whiteAdvantageDetails.noShowBishopUsed = room.whiteNoShowBishopUsed || false;
                    if (room.whiteNoShowBishopRemovedPiece) {
                        whiteAdvantageDetails.removedBishopDetails = {
                            square: room.whiteNoShowBishopRemovedPiece.square,
                            type: room.whiteNoShowBishopRemovedPiece.type
                        };
                    } else {
                        console.warn(`[SocketHandlers] whiteNoShowBishopRemovedPiece is undefined for white player (No-Show Bishop) in room ${roomId}.`);
                    }
                    console.log(`White player (${room.white}) assigned No-Show Bishop. Used: ${whiteAdvantageDetails.noShowBishopUsed}, Removed: ${JSON.stringify(whiteAdvantageDetails.removedBishopDetails)}`);
                }

                whitePlayerSocket.emit("advantageAssigned", {
                    advantage: room.whiteAdvantage,
                    advantageDetails: whiteAdvantageDetails
                });
            }
        }

        // Black player's advantage processing (socket is black's socket here)
        if (room.blackAdvantage) {
            let blackAdvantageDetails: AdvantageDetailsPayload = {};

            if (room.blackAdvantage.id === "silent_shield" && room.silentShieldPieces) {
                const blackShieldedPiece = selectProtectedPiece(initialGame, 'b');
                if (blackShieldedPiece) {
                    room.silentShieldPieces.black = blackShieldedPiece;
                    blackAdvantageDetails.shieldedPiece = blackShieldedPiece;
                    console.log(`Black player (${socket.id}) protected piece: ${blackShieldedPiece.type} at ${blackShieldedPiece.initialSquare}`);
                }
            }
            if (room.blackAdvantage.id === "royal_escort") {
                room.blackRoyalEscortState = { usedCount: 0 };
                console.log(`Black player (${socket.id}) assigned Royal Escort, state initialized.`);
            }
            if (room.blackAdvantage.id === "lightning_capture") {
                room.blackLightningCaptureState = { used: false };
                console.log(`Black player (${socket.id}) assigned Lightning Capture, state initialized.`);
            }
            if (room.blackAdvantage.id === "opening_swap") {
                room.blackOpeningSwapState = { hasSwapped: false };
                console.log(`Black player (${socket.id}) assigned Opening Swap, state initialized.`);
            }
            if (room.blackAdvantage.id === "pawn_ambush") {
                room.blackPawnAmbushState = { ambushedPawns: [] };
                console.log(`Black player (${socket.id}) assigned Pawn Ambush, state initialized.`);
            }
            if (room.blackAdvantage.id === "royal_decree") {
                room.blackHasUsedRoyalDecree = false;
                console.log(`Black player (${socket.id}) assigned Royal Decree, state initialized.`);
            }
            if (room.blackAdvantage.id === "queens_domain") {
                room.blackQueensDomainState = { isActive: false, hasUsed: false };
                console.log(`Black player (${socket.id}) assigned Queen's Domain, state initialized.`);
            }
            if (room.blackAdvantage.id === "knightmare") {
                room.blackKnightmareState = { hasUsed: false };
                console.log(`Black player (${socket.id}) assigned Knightmare, state initialized: ${JSON.stringify(room.blackKnightmareState)}`);
            }
            if (room.blackAdvantage.id === "queenly_compensation") {
                room.blackQueenlyCompensationState = { hasUsed: false };
                console.log(`Black player (${socket.id}) assigned Queenly Compensation, state initialized.`);
            }
            if (room.blackAdvantage.id === "arcane_reinforcement") {
                blackAdvantageDetails.spawnedSquare = room.blackArcaneReinforcementSpawnedSquare ?? undefined;
                console.log(`Black player (${socket.id}) assigned Arcane Reinforcement. Spawned at: ${room.blackArcaneReinforcementSpawnedSquare}`);
            }
            if (room.blackAdvantage.id === "cloak" && room.blackCloakState) {
                blackAdvantageDetails.cloak = room.blackCloakState;
                console.log(`[Cloak Server socketHandlers - advantageAssigned] Emitting cloak details for black:`, JSON.stringify(room.blackCloakState));
            }
            if (room.blackAdvantage.id === "no_show_bishop") {
                blackAdvantageDetails.noShowBishopUsed = room.blackNoShowBishopUsed || false;
                if (room.blackNoShowBishopRemovedPiece) {
                    blackAdvantageDetails.removedBishopDetails = {
                        square: room.blackNoShowBishopRemovedPiece.square,
                        type: room.blackNoShowBishopRemovedPiece.type
                    };
                } else {
                    console.warn(`[SocketHandlers] blackNoShowBishopRemovedPiece is undefined for black player (No-Show Bishop) in room ${roomId}.`);
                }
                console.log(`Black player (${socket.id}) assigned No-Show Bishop. Used: ${blackAdvantageDetails.noShowBishopUsed}, Removed: ${JSON.stringify(blackAdvantageDetails.removedBishopDetails)}`);
            }
            
            socket.emit("advantageAssigned", {
                advantage: room.blackAdvantage,
                advantageDetails: blackAdvantageDetails
            });
        }
        // ---- END Advantage Assignment and State Init ----
        
        // After all advantages are processed and initial FEN is set (including Arcane Reinforcement pieces):
        // Add initial FEN to history
        if (room.fen && room.fenHistory && room.fenHistory.length === 0) {
          room.fenHistory.push(room.fen);
        }
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
        let playerCoordinatedPushState: CoordinatedPushState | undefined;
        const currentPlayerAdvantage = senderColor === 'white' ? room.whiteAdvantage : room.blackAdvantage;


        if (senderColor === 'white') {
            currentPlayerAdvantageState_FB = room.whiteFocusedBishopState;
            currentPlayerRooksMoved_CB = room.whiteRooksMoved;
            currentPlayerRoyalEscortState_RE = room.whiteRoyalEscortState;
            currentPlayerLightningCaptureState_LC = room.whiteLightningCaptureState;
            playerQueensDomainState = room.whiteQueensDomainState;
            currentPlayerKnightmareState = room.whiteKnightmareState; // Added this line
            playerCoordinatedPushState = room.whiteCoordinatedPushState;
        } else if (senderColor === 'black') {
            currentPlayerAdvantageState_FB = room.blackFocusedBishopState;
            currentPlayerRooksMoved_CB = room.blackRooksMoved;
            currentPlayerRoyalEscortState_RE = room.blackRoyalEscortState;
            currentPlayerLightningCaptureState_LC = room.blackLightningCaptureState;
            playerQueensDomainState = room.blackQueensDomainState;
            currentPlayerKnightmareState = room.blackKnightmareState;
            playerCoordinatedPushState = room.blackCoordinatedPushState;
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
            if (room.whiteAdvantage?.id === "coordinated_push" && !playerCoordinatedPushState) {
                playerCoordinatedPushState = room.whiteCoordinatedPushState = { active: false, usedThisTurn: false };
                console.log(`[sendMove] Initializing whiteCoordinatedPushState due to missing state.`);
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
            if (room.blackAdvantage?.id === "coordinated_push" && !playerCoordinatedPushState) {
                playerCoordinatedPushState = room.blackCoordinatedPushState = { active: false, usedThisTurn: false };
                console.log(`[sendMove] Initializing blackCoordinatedPushState due to missing state.`);
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
        } else if (receivedMove.special === "void_step") {
          // --- Void Step Server Validation ---
          const voidStepState = senderColor === 'white' ? room.whiteVoidStepState : room.blackVoidStepState;
          const playerAdvantage = senderColor === 'white' ? room.whiteAdvantage : room.blackAdvantage;
           if (!voidStepState || playerAdvantage?.id !== "void_step" || !voidStepState.isActive || voidStepState.hasUsed) {
            socket.emit("invalidMove", { message: "Void Step not available or already used.", move: clientMoveData });
            return;
           }
           const validationGame = new Chess(originalFenBeforeAttempt!);
           const vsResult = validateVoidStepServerMove({
            game: validationGame,
            clientMoveData: receivedMove,
            currentFen: originalFenBeforeAttempt!,
            playerColor: senderColor![0] as 'w' | 'b',
            voidStepState,
           });

           moveResult = vsResult.moveResult;

           if (moveResult && vsResult.nextFen) {
            serverGame.load(vsResult.nextFen);
            room.fen = vsResult.nextFen;
            // Mark Void Step as used and inactive
            if (senderColor === 'white') room.whiteVoidStepState = vsResult.updatedVoidStepState!;
            else room.blackVoidStepState = vsResult.updatedVoidStepState!;
            console.log(`[sendMove] Void Step by ${senderColor} validated. New FEN: ${room.fen}.`);
           } else {
            console.warn(`[sendMove] Void Step by ${senderColor} failed validation: ${vsResult.error}`);
            socket.emit("invalidMove", {
              message: vsResult.error || "Void Step move invalid or illegal.",
              move: clientMoveData
            });
            moveResult = null;
            return;
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
            serverGame.load(lcResult.nextFen);
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
        } else if (receivedMove.special === 'coordinated_push' && receivedMove.from && receivedMove.to && receivedMove.secondFrom && receivedMove.secondTo) {
          console.log("[CP DEBUG] Received coordinated_push move from client:", receivedMove);

          if (currentPlayerAdvantage?.id !== 'coordinated_push' || !playerCoordinatedPushState) {
            console.warn("[CP DEBUG] Coordinated Push not available or state missing for player.");
            socket.emit("invalidMove", { message: "Coordinated Push not available or state missing.", move: clientMoveData });
            return;
          }
          if (playerCoordinatedPushState.usedThisTurn) {
            console.warn("[CP DEBUG] Coordinated Push already used this turn.");
            socket.emit("invalidMove", { message: "Coordinated Push already used this turn.", move: clientMoveData });
            return;
          }

          const cpValidationResult = validateCoordinatedPushServerMove(
            serverGame,
            senderColor,
            { from: receivedMove.from, to: receivedMove.to },
            { from: receivedMove.secondFrom, to: receivedMove.secondTo },
            originalFenBeforeAttempt!
          );

          if (cpValidationResult.isValid && cpValidationResult.nextFen) {
            serverGame.load(cpValidationResult.nextFen);
            room.fen = cpValidationResult.nextFen;

            // Mark advantage as used
            playerCoordinatedPushState.usedThisTurn = true;
            if (senderColor === 'white') {
              room.whiteCoordinatedPushState = playerCoordinatedPushState;
            } else {
              room.blackCoordinatedPushState = playerCoordinatedPushState;
            }

            io.to(roomId).emit("receiveMove", {
              move: {
                ...receivedMove,
                afterFen: room.fen,
              },
              whitePlayerAdvantageStatesFull: {
                cloak: room.whiteCloakState || null,
              },
              blackPlayerAdvantageStatesFull: {
                cloak: room.blackCloakState || null,
              }
            });

            console.log("[CP DEBUG] Coordinated Push move processed and emitted. Returning to prevent fallback logic.");
            return;
          } else {
            socket.emit("invalidMove", {
              message: cpValidationResult.error || "Coordinated Push move invalid or illegal.",
              move: receivedMove
            });
            return;
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
            room.fen = serverGame.fen();
          }
        }
        // End of special/standard move blocks. moveResult is either a valid Move object or null.

        
        // Universal post-move processing (if moveResult is not null)
        if (moveResult) {
          // --- Piece Tracking Update ---
          if (room.pieceTracking) {
            // Find the UID of the piece that moved
            let movedPieceUid: string | undefined;
            for (const [uid, info] of Object.entries(room.pieceTracking)) {
              if (
                info.square === moveResult.from &&
                info.type === moveResult.piece &&
                info.color === senderColor[0] &&
                info.alive
              ) {
                movedPieceUid = uid;
                break;
              }
            }
            if (movedPieceUid) {
              // Update the piece's square to the new position
              const movedInfo = room.pieceTracking[movedPieceUid];
              movedInfo.square = moveResult.to;
              movedInfo.history.push(moveResult.to);

              // Handle promotion
              if (moveResult.promotion) {
                movedInfo.promotedTo = moveResult.promotion as PieceSymbol;
                movedInfo.type = moveResult.promotion as PieceSymbol;
              }
            }

            // Handle captures: mark captured piece as not alive and square = null
            if (moveResult.captured) {
              for (const [uid, info] of Object.entries(room.pieceTracking)) {
                if (
                  info.square === moveResult.to &&
                  info.type === moveResult.captured &&
                  info.color !== senderColor[0] &&
                  info.alive
                ) {
                  info.alive = false;
                  info.square = null;
                  info.history.push(moveResult.to);
                  break;
                }
              }
            }
          }
          // --- End Piece Tracking Update ---

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
            // We DO NOT add originalFenBeforeAttempt to fenHistory again if it's already the last entry
            // or if fenHistory is empty (which implies originalFen is the starting FEN already added).
            // However, if a move was made, then deflected, the fenHistory might have the deflected FEN.
            // It should be removed.
            if (room.fenHistory && room.fenHistory.length > 0 && room.fenHistory[room.fenHistory.length -1] !== originalFenBeforeAttempt) {
              // This implies a FEN was added then the move leading to it was deflected.
              // Let's assume the FEN added corresponded to fenAfterPotentialAmbush.
              // If fenHistory's last element is fenAfterPotentialAmbush, pop it.
              // This needs careful handling: only pop if the *deflected* FEN was indeed added.
              // The current logic adds `fenAfterPotentialAmbush` to history *before* deflection check.
              // So, if deflected, we need to remove that last added FEN.
              const lastFenInHistory = room.fenHistory.pop();
              if (lastFenInHistory !== fenAfterPotentialAmbush) {
                  // This case should ideally not happen if logic is correct.
                  // If it does, push back the popped FEN as it wasn't the one to remove.
                  if (lastFenInHistory) room.fenHistory.push(lastFenInHistory);
                  console.warn("[sendMove Deflection] Popped FEN from history was not the deflected FEN. History might be inconsistent.");
              } else {
                  console.log(`[sendMove Deflection] Removed deflected FEN ${lastFenInHistory} from history.`);
              }
            }

            // Ambush is implicitly reverted because its changes to serverGame are wiped by load(),
            // and pawnAmbushFinalState is not committed to the room state.
            console.log(`[sendMove] Move by ${senderColor} was deflected. FEN reverted to ${originalFenBeforeAttempt}.`);
            socket.emit("moveDeflected", { move: clientMoveData }); 
          } else {
            // NOT deflected. Commit everything.
            // room.fen was already set to fenAfterPotentialAmbush.
            // fenHistory push is moved later to capture final FEN after all effects

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
            // playerQueensDomainState was fetched and initialized if necessary earlier in sendMove.
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
            
            // ---- Forced No-Show Bishop Summon Check ----
            // This happens *after* the current move (which is moveResult) has updated serverGame and room.fen,
            // but *before* game over checks for the current move or emitting receiveMove.
            const historyLength = serverGame.history().length;
            console.log(`[Forced Summon Check] History length after current move: ${historyLength}`);

            if (historyLength === 19 && senderColor) { // Current move was the 19th half-move
              // The player whose turn just ended is senderColor.
              // The player whose turn is *next* (and for whom we might force summon if *they* didn't use NSB)
              // is serverGame.turn()
              const nextPlayerColorChar = serverGame.turn(); // 'w' or 'b'
              const nextPlayerFullColor = nextPlayerColorChar === 'w' ? 'white' : 'black';
              let playerToCheckForForcedSummon: 'white' | 'black' | null = null;
              let advantageToCheck: Advantage | undefined;
              let noShowBishopUsed: boolean | undefined;
              let removedPieceDetails: { square: Square, type: PieceSymbol } | undefined;

              if (nextPlayerFullColor === 'white') {
                playerToCheckForForcedSummon = 'white';
                advantageToCheck = room.whiteAdvantage;
                noShowBishopUsed = room.whiteNoShowBishopUsed;
                removedPieceDetails = room.whiteNoShowBishopRemovedPiece;
              } else if (nextPlayerFullColor === 'black') {
                playerToCheckForForcedSummon = 'black';
                advantageToCheck = room.blackAdvantage;
                noShowBishopUsed = room.blackNoShowBishopUsed;
                removedPieceDetails = room.blackNoShowBishopRemovedPiece;
              }

              if (playerToCheckForForcedSummon && advantageToCheck?.id === 'no_show_bishop' && !noShowBishopUsed && removedPieceDetails) {
                console.log(`[Forced Summon Check] Player ${playerToCheckForForcedSummon} (${nextPlayerFullColor}) has No-Show Bishop, not used, and it's turn 19 end. Forcing summon.`);

                let randomEmptySquare: Square | null = null;
                const squares: Square[] = [];
                for (let r = 0; r < 8; r++) {
                  for (let c = 0; c < 8; c++) {
                    squares.push(String.fromCharCode(97 + c) + (r + 1) as Square);
                  }
                }
                // Shuffle squares to find a random empty one
                for (let i = squares.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [squares[i], squares[j]] = [squares[j], squares[i]];
                }
                for (const sq of squares) {
                  if (serverGame.get(sq) === null) {
                    randomEmptySquare = sq;
                    break;
                  }
                }

                if (randomEmptySquare) {
                  const summonPayload: SummonNoShowBishopPayload = {
                    square: randomEmptySquare,
                    color: nextPlayerFullColor,
                    piece: { type: removedPieceDetails.type, color: nextPlayerColorChar },
                  };
                  const playerAdvantageStatesForForceSummon: PlayerAdvantageStates = {
                    noShowBishopUsed: noShowBishopUsed,
                    noShowBishopRemovedPiece: removedPieceDetails,
                  };

                  console.log(`[Forced Summon Check] Attempting forced summon for ${nextPlayerFullColor} to ${randomEmptySquare}`);
                  const forceSummonResult = handleNoShowBishopServer(serverGame, summonPayload, nextPlayerColorChar, playerAdvantageStatesForForceSummon);

                  if (forceSummonResult.success && forceSummonResult.newFen) {
                    room.fen = forceSummonResult.newFen; // IMPORTANT: Update room.fen and serverGame
                    if (room.fen && room.fenHistory && room.fenHistory[room.fenHistory.length -1] !== room.fen) {
                       room.fenHistory.push(room.fen);
                       console.log(`[Forced Summon Check] Added forced summon FEN to history: ${room.fen}`);
                    }
                    if (nextPlayerFullColor === 'white') {
                      room.whiteNoShowBishopUsed = true;
                    } else {
                      room.blackNoShowBishopUsed = true;
                    }
                    console.log(`[Forced Summon Check] Successful for ${nextPlayerFullColor}. New FEN: ${room.fen}. Emitting 'bishopSummoned'.`);
                    
                    const whiteStatesForEmit: PlayerAdvantageStates = { ...(room.whiteAdvantage?.id === 'no_show_bishop' && { noShowBishopUsed: room.whiteNoShowBishopUsed, noShowBishopRemovedPiece: room.whiteNoShowBishopRemovedPiece }) };
                    const blackStatesForEmit: PlayerAdvantageStates = { ...(room.blackAdvantage?.id === 'no_show_bishop' && { noShowBishopUsed: room.blackNoShowBishopUsed, noShowBishopRemovedPiece: room.blackNoShowBishopRemovedPiece }) };

                    io.to(roomId).emit("bishopSummoned", {
                      newFen: room.fen,
                      playerColor: nextPlayerFullColor,
                      summonedSquare: randomEmptySquare,
                      pieceType: removedPieceDetails.type,
                      noShowBishopUsed: true,
                      wasForced: true, // Indicate it was a forced summon
                      whitePlayerAdvantageStatesFull: whiteStatesForEmit,
                      blackPlayerAdvantageStatesFull: blackStatesForEmit,
                    });
                  } else {
                    console.error(`[Forced Summon Check] Failed for ${nextPlayerFullColor}: ${forceSummonResult.error}`);
                  }
                } else {
                  console.error("[Forced Summon Check] No empty squares found for forced summon. This is highly unlikely.");
                }
              }
            }
            // ---- End Forced No-Show Bishop Summon Check ----

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
                    // If QC changed the FEN, ensure history has the latest FEN from QC
                    if (room.fen && room.fenHistory && room.fenHistory[room.fenHistory.length -1] !== room.fen) {
                        room.fenHistory.push(room.fen);
                        console.log(`[QueenlyCompensation Trigger] Added QC FEN to history: ${room.fen}`);
                    }
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

            // Coordinated Push broadcast effect (if successful and was a CP move)
            if (receivedMove.special === 'coordinated_push' && moveResult && playerCoordinatedPushState?.usedThisTurn) {
                const currentCPS = senderColor === 'white' ? room.whiteCoordinatedPushState : room.blackCoordinatedPushState;
                if (currentCPS) { 
                    moveDataForBroadcast.updatedAdvantageStates = {
                        ...moveDataForBroadcast.updatedAdvantageStates,
                        coordinatedPush: { ...currentCPS } 
                    };
                    console.log(`[sendMove] Coordinated Push by ${senderColor}: Attaching updatedAdvantageStates to broadcast: ${JSON.stringify(moveDataForBroadcast.updatedAdvantageStates)}`);
                }
            }
            // --- End Add effects to broadcast ---

            // ----- CLOAK ADVANTAGE LOGIC -----
            // Ensure this runs only if the move was successful and the board state is final for the turn.
            if (moveResult && room.fen === serverGame.fen()) { 
                const gameCtxForCloak = new Chess(room.fen!); // Use a fresh Chess instance with the latest FEN

                // Handle Cloak for the player who moved (senderColor)
                if (senderColor === 'white' && room.whiteCloakState) {
                    console.log(`[Cloak Server socketHandlers - sendMove] White player ${senderColor} moved. Current cloak: ${JSON.stringify(room.whiteCloakState)}. Move from: ${moveResult.from}, to: ${moveResult.to}, piece: ${moveResult.piece}`);
                    // Check if the moved piece IS the cloaked piece and update its ID
                    if (room.whiteCloakState.pieceId && moveResult.piece) { // Ensure pieceId and moveResult.piece exist
                        const expectedOldPieceId = `${moveResult.from}${moveResult.piece.toLowerCase()}`;
                        if (room.whiteCloakState.pieceId === expectedOldPieceId) {
                            const newPieceId = `${moveResult.to}${moveResult.piece.toLowerCase()}`;
                            console.log(`[Cloak Move] White's cloaked piece ${room.whiteCloakState.pieceId} moved from ${moveResult.from} to ${moveResult.to}. New ID: ${newPieceId}`);
                            room.whiteCloakState.pieceId = newPieceId;
                        }
                    }
                    // Now, handle turns (it will use the potentially updated pieceId for logging if any)
                    const previousTurnsWhite = room.whiteCloakState.turnsRemaining; // room.whiteCloakState might be deleted by handleCloakTurn if turns run out
                    const tempWhiteStates: PlayerAdvantageStates = { cloak: { ...room.whiteCloakState } }; 
                    handleCloakTurn(tempWhiteStates); 
                    room.whiteCloakState = tempWhiteStates.cloak; 
                    if (room.whiteCloakState) { // Check if cloak still exists
                        if (previousTurnsWhite !== room.whiteCloakState.turnsRemaining) {
                            console.log('[Cloak Turns] White player cloak updated. Turns remaining: ' + room.whiteCloakState.turnsRemaining + '. ID: ' + room.whiteCloakState.pieceId);
                        }
                    } else if (previousTurnsWhite > 0) { // Cloak existed before but now it's gone
                        console.log('[Cloak Turns] White player cloak expired. Turns remaining: 0. ID: ' + tempWhiteStates.cloak?.pieceId);
                    }
                } else if (senderColor === 'black' && room.blackCloakState) {
                    console.log(`[Cloak Server socketHandlers - sendMove] Black player ${senderColor} moved. Current cloak: ${JSON.stringify(room.blackCloakState)}. Move from: ${moveResult.from}, to: ${moveResult.to}, piece: ${moveResult.piece}`);
                    // Check if the moved piece IS the cloaked piece and update its ID
                    if (room.blackCloakState.pieceId && moveResult.piece) { // Ensure pieceId and moveResult.piece exist
                        const expectedOldPieceId = `${moveResult.from}${moveResult.piece.toLowerCase()}`;
                        if (room.blackCloakState.pieceId === expectedOldPieceId) {
                            const newPieceId = `${moveResult.to}${moveResult.piece.toLowerCase()}`;
                            console.log(`[Cloak Move] Black's cloaked piece ${room.blackCloakState.pieceId} moved from ${moveResult.from} to ${moveResult.to}. New ID: ${newPieceId}`);
                            room.blackCloakState.pieceId = newPieceId;
                        }
                    }
                    // Now, handle turns
                    const previousTurnsBlack = room.blackCloakState.turnsRemaining;
                    const tempBlackStates: PlayerAdvantageStates = { cloak: { ...room.blackCloakState } };
                    handleCloakTurn(tempBlackStates);
                    room.blackCloakState = tempBlackStates.cloak;
                    if (room.blackCloakState) { // Check if cloak still exists
                        if (previousTurnsBlack !== room.blackCloakState.turnsRemaining) {
                             console.log('[Cloak Turns] Black player cloak updated. Turns remaining: ' + room.blackCloakState.turnsRemaining + '. ID: ' + room.blackCloakState.pieceId);
                        }
                    } else if (previousTurnsBlack > 0) { // Cloak existed before but now it's gone
                        console.log('[Cloak Turns] Black player cloak expired. Turns remaining: 0. ID: ' + tempBlackStates.cloak?.pieceId);
                    }
                }

                // Handle Cloak removal on capture for the opponent
                if (moveResult.captured && opponentColor) {
                    // gameCtxForCloak is already based on the FEN after the capture.
                    if (opponentColor === 'white' && room.whiteCloakState) {
                        const tempOpponentStates: PlayerAdvantageStates = { cloak: { ...room.whiteCloakState } };
                        // Pass gameCtxForCloak which is already the state *after* the capture.
                        removeCloakOnCapture(tempOpponentStates, moveResult.to as Square, gameCtxForCloak); 
                        if (!tempOpponentStates.cloak && room.whiteCloakState) { // Check if cloak was removed
                            console.log('[Cloak Capture] Opponent White cloaked piece ' + room.whiteCloakState.pieceId + ' captured on ' + moveResult.to + '. Cloak removed.');
                            room.whiteCloakState = undefined; 
                        } else {
                            // This branch might not be strictly necessary if removeCloakOnCapture directly modifies tempOpponentStates.cloak
                            // and playerStates.cloak is then set to tempOpponentStates.cloak.
                            // However, explicit re-assignment is safer if removeCloakOnCapture might return a new object or modified state.
                            room.whiteCloakState = tempOpponentStates.cloak; 
                        }
                    } else if (opponentColor === 'black' && room.blackCloakState) {
                        const tempOpponentStates: PlayerAdvantageStates = { cloak: { ...room.blackCloakState } };
                        removeCloakOnCapture(tempOpponentStates, moveResult.to as Square, gameCtxForCloak);
                        if (!tempOpponentStates.cloak && room.blackCloakState) { // Check if cloak was removed
                            console.log('[Cloak Capture] Opponent Black cloaked piece ' + room.blackCloakState.pieceId + ' captured on ' + moveResult.to + '. Cloak removed.');
                            room.blackCloakState = undefined; 
                        } else {
                            room.blackCloakState = tempOpponentStates.cloak;
                        }
                    }
                }
            }
            // ----- END CLOAK ADVANTAGE LOGIC -----

            // Push the final FEN to history before broadcasting the move
            if (room.fen && room.fenHistory) {
              if (room.fenHistory.length === 0 || room.fenHistory[room.fenHistory.length - 1] !== room.fen) {
                room.fenHistory.push(room.fen);

                // --- Piece Tracking History ---
                if (!room.pieceTrackingHistory) room.pieceTrackingHistory = [];
                // Deep copy to avoid mutation issues
                const deepCopy = JSON.parse(JSON.stringify(room.pieceTracking));
                room.pieceTrackingHistory.push(deepCopy);
                // --- End Piece Tracking History ---

                console.log(`[SocketHandlers sendMove] fenHistory updated (final pre-emit). New length: ${room.fenHistory.length}. Last FEN: ${room.fen}`);
              }
            }

            // Construct full advantage states for emission. This must be done before emitting "receiveMove".
            const whiteCurrentAdvantageStates: PlayerAdvantageStates = {
                ...(room.whiteAdvantage?.id === 'royal_escort' && room.whiteRoyalEscortState && { royalEscort: room.whiteRoyalEscortState }),
                ...(room.whiteAdvantage?.id === 'lightning_capture' && room.whiteLightningCaptureState && { lightningCapture: room.whiteLightningCaptureState }),
                ...(room.whiteAdvantage?.id === 'opening_swap' && room.whiteOpeningSwapState && { openingSwap: room.whiteOpeningSwapState }),
                ...(room.whiteAdvantage?.id === 'pawn_ambush' && room.whitePawnAmbushState && { pawnAmbush: room.whitePawnAmbushState }),
                ...(room.whiteAdvantage?.id === 'queens_domain' && room.whiteQueensDomainState && { queens_domain: room.whiteQueensDomainState }),
                ...(room.whiteAdvantage?.id === 'knightmare' && room.whiteKnightmareState && { knightmare: room.whiteKnightmareState }),
                ...(room.whiteAdvantage?.id === 'queenly_compensation' && room.whiteQueenlyCompensationState && { queenly_compensation: room.whiteQueenlyCompensationState }),
                ...(room.whiteAdvantage?.id === 'coordinated_push' && room.whiteCoordinatedPushState && { coordinatedPush: room.whiteCoordinatedPushState }),
                ...(room.whiteCloakState && { cloak: room.whiteCloakState }), 
                ...(room.whiteAdvantage?.id === 'no_show_bishop' && { // Add No-Show Bishop for white
                    noShowBishopUsed: room.whiteNoShowBishopUsed,
                    noShowBishopRemovedPiece: room.whiteNoShowBishopRemovedPiece 
                }),
            };
            const blackCurrentAdvantageStates: PlayerAdvantageStates = {
                ...(room.blackAdvantage?.id === 'royal_escort' && room.blackRoyalEscortState && { royalEscort: room.blackRoyalEscortState }),
                ...(room.blackAdvantage?.id === 'lightning_capture' && room.blackLightningCaptureState && { lightningCapture: room.blackLightningCaptureState }),
                ...(room.blackAdvantage?.id === 'opening_swap' && room.blackOpeningSwapState && { openingSwap: room.blackOpeningSwapState }),
                ...(room.blackAdvantage?.id === 'pawn_ambush' && room.blackPawnAmbushState && { pawnAmbush: room.blackPawnAmbushState }),
                ...(room.blackAdvantage?.id === 'queens_domain' && room.blackQueensDomainState && { queens_domain: room.blackQueensDomainState }),
                ...(room.blackAdvantage?.id === 'knightmare' && room.blackKnightmareState && { knightmare: room.blackKnightmareState }),
                ...(room.blackAdvantage?.id === 'queenly_compensation' && room.blackQueenlyCompensationState && { queenly_compensation: room.blackQueenlyCompensationState }),
                ...(room.blackAdvantage?.id === 'coordinated_push' && room.blackCoordinatedPushState && { coordinatedPush: room.blackCoordinatedPushState }),
                ...(room.blackCloakState && { cloak: room.blackCloakState }), 
                ...(room.blackAdvantage?.id === 'no_show_bishop' && { // Add No-Show Bishop for black
                    noShowBishopUsed: room.blackNoShowBishopUsed,
                    noShowBishopRemovedPiece: room.blackNoShowBishopRemovedPiece
                }),
            };

            const finalPayloadForReceiveMove = {
                move: moveDataForBroadcast,
                ...(updatedShieldedPieceForEmit && { updatedShieldedPiece: updatedShieldedPieceForEmit }),
                whitePlayerAdvantageStatesFull: {
                    ...whiteCurrentAdvantageStates,
                    cloak: room.whiteCloakState || null, // Always include cloak, even if null
                },
                blackPlayerAdvantageStatesFull: {
                    ...blackCurrentAdvantageStates,
                    cloak: room.blackCloakState || null, // Always include cloak, even if null
                },
            };
            console.log(`[Cloak Server socketHandlers - sendMove] Emitting finalPayloadForReceiveMove. WhiteFullStates: ${JSON.stringify(finalPayloadForReceiveMove.whitePlayerAdvantageStatesFull)}, BlackFullStates: ${JSON.stringify(finalPayloadForReceiveMove.blackPlayerAdvantageStatesFull)}`);
            io.to(roomId).emit("receiveMove", finalPayloadForReceiveMove);
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
            // use playerQueensDomainState which was fetched and initialized if necessary
            if (playerAdvantageForQD?.id === 'queens_domain' && playerQueensDomainState) {
              if (clientMoveData.special === 'queens_domain_move' && !playerQueensDomainState.hasUsed && moveResult) { // Check moveResult to ensure QD was successful
                console.log(`[SocketHandlers] Queen's Domain used by ${senderColor} for move. Updating state.`);
                playerQueensDomainState.hasUsed = true;
                playerQueensDomainState.isActive = false;
                // Add a flag to the broadcasted move so client knows QD was consumed this move
                // This assumes moveDataForBroadcast is accessible here or modified on the payload object directly
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
            // ---- End Queen's Domain State Update ----
            // This (the QD state update block) was moved to be inside the `if (moveResult && room.fen === serverGame.fen())` block,
            // which is fine as it ensures the state is updated only for truly committed moves.
            // The specialServerEffect addition needs to be before the payload emission,
            // and after the QD state is updated.
            // The current placement of specialServerEffect addition (just above) should be correct
            // relative to the payload emission.

            // ---- Reset usedThisTurn for Coordinated Push for the NEXT player ----
            // This happens after a successful move by the current player. serverGame.turn() now reflects the next player.
            const nextPlayerColorChar = serverGame.turn(); // 'w' or 'b'
            const nextPlayerColor = nextPlayerColorChar === 'w' ? 'white' : 'black';
            let cpStateResetForNextPlayer: Partial<PlayerAdvantageStates> = {};
            let nextPlayerSocketId: string | undefined = undefined;

            if (nextPlayerColor === 'white' && room.whiteAdvantage?.id === 'coordinated_push' && room.whiteCoordinatedPushState?.usedThisTurn) {
                room.whiteCoordinatedPushState.usedThisTurn = false;
                console.log(`[SocketHandlers sendMove] Resetting Coordinated Push usedThisTurn for white player (next turn).`);
                cpStateResetForNextPlayer.coordinatedPush = { ...room.whiteCoordinatedPushState };
                nextPlayerSocketId = room.white;
            } else if (nextPlayerColor === 'black' && room.blackAdvantage?.id === 'coordinated_push' && room.blackCoordinatedPushState?.usedThisTurn) {
                room.blackCoordinatedPushState.usedThisTurn = false;
                console.log(`[SocketHandlers sendMove] Resetting Coordinated Push usedThisTurn for black player (next turn).`);
                cpStateResetForNextPlayer.coordinatedPush = { ...room.blackCoordinatedPushState };
                nextPlayerSocketId = room.black;
            }

            // Send targeted update if a reset occurred and the next player is connected
            if (nextPlayerSocketId && Object.keys(cpStateResetForNextPlayer).length > 0) {
                io.to(nextPlayerSocketId).emit("advantageStateUpdated", cpStateResetForNextPlayer);
                console.log(`[SocketHandlers sendMove] Sent targeted advantageStateUpdated for Coordinated Push reset to ${nextPlayerColor} (${nextPlayerSocketId}).`);
            }
            // ---- End Coordinated Push Reset for Next Player ----
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
      // Check fenHistory length instead of serverGame.history().length
      if (room.fenHistory && room.fenHistory.length > 1) { // > 1 because initial FEN is added
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
      // Update fenHistory with the new FEN after swap
      if (room.fen && room.fenHistory) {
        if (room.fenHistory.length > 0) {
            room.fenHistory[room.fenHistory.length - 1] = room.fen; // Replace the last FEN (initial)
        } else {
            room.fenHistory.push(room.fen); // Or push if it was somehow empty
        }
      }

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

    socket.on("summon_no_show_bishop", ({ roomId, payload }: { roomId: string, payload: SummonNoShowBishopPayload }) => {
      const room = rooms[roomId];
      const senderId = socket.id;
      console.log(`[No-Show Bishop Summon] Received request from ${senderId} for room ${roomId}. Payload:`, payload);

      if (!room || !room.fen || !room.white || !room.black) {
        console.error(`[No-Show Bishop Summon] Room ${roomId} not found or incomplete.`);
        socket.emit("summonBishopFailed", { message: "Room not found or game not fully started." });
        return;
      }

      const serverGame = new Chess(room.fen); // Load current game state
      let senderColor: "white" | "black" | null = null;
      let playerAdvantageStatesFromRoom: PlayerAdvantageStates = {};

      if (senderId === room.white) {
        senderColor = "white";
        if (room.whiteAdvantage?.id !== 'no_show_bishop') {
          socket.emit("summonBishopFailed", { message: "You do not have the No-Show Bishop advantage." });
          return;
        }
        playerAdvantageStatesFromRoom = {
          noShowBishopUsed: room.whiteNoShowBishopUsed,
          noShowBishopRemovedPiece: room.whiteNoShowBishopRemovedPiece,
        };
      } else if (senderId === room.black) {
        senderColor = "black";
        if (room.blackAdvantage?.id !== 'no_show_bishop') {
          socket.emit("summonBishopFailed", { message: "You do not have the No-Show Bishop advantage." });
          return;
        }
        playerAdvantageStatesFromRoom = {
          noShowBishopUsed: room.blackNoShowBishopUsed,
          noShowBishopRemovedPiece: room.blackNoShowBishopRemovedPiece,
        };
      } else {
        console.error(`[No-Show Bishop Summon] Sender ${senderId} is not a player in room ${roomId}.`);
        socket.emit("summonBishopFailed", { message: "You are not a player in this room." });
        return;
      }

      if (serverGame.turn() !== senderColor[0]) {
        socket.emit("summonBishopFailed", { message: "Not your turn to summon." });
        return;
      }
      
      console.log(`[No-Show Bishop Summon] Calling handleNoShowBishopServer for ${senderColor}. Current advantage states from room:`, playerAdvantageStatesFromRoom);

      const result = handleNoShowBishopServer(
        serverGame, // This is a new Chess(room.fen) instance
        payload,
        senderColor[0] as 'w' | 'b',
        playerAdvantageStatesFromRoom
      );

      if (result.success && result.newFen) {
        room.fen = result.newFen; // IMPORTANT: Update room.fen and serverGame
        if (senderColor === 'white') {
          room.whiteNoShowBishopUsed = true;
        } else {
          room.blackNoShowBishopUsed = true;
        }
        if (room.fen && room.fenHistory && room.fenHistory[room.fenHistory.length -1] !== room.fen) {
            room.fenHistory.push(room.fen);
            console.log(`[No-Show Bishop Summon] Added summoned bishop FEN to history: ${room.fen}`);
        }
        console.log(`[No-Show Bishop Summon] Success for ${senderColor}. New FEN: ${room.fen}. Emitting 'bishopSummoned'.`);
        
        // Construct the full advantage states to send with the event
        const whitePlayerAdvantageStatesFull: PlayerAdvantageStates = {
            ...(room.whiteAdvantage?.id === 'no_show_bishop' && { 
                noShowBishopUsed: room.whiteNoShowBishopUsed,
                noShowBishopRemovedPiece: room.whiteNoShowBishopRemovedPiece 
            }),
            // ... include other white advantage states from room if necessary for this event
        };
        const blackPlayerAdvantageStatesFull: PlayerAdvantageStates = {
            ...(room.blackAdvantage?.id === 'no_show_bishop' && {
                noShowBishopUsed: room.blackNoShowBishopUsed,
                noShowBishopRemovedPiece: room.blackNoShowBishopRemovedPiece
            }),
            // ... include other black advantage states from room
        };

        io.to(roomId).emit("bishopSummoned", {
          newFen: room.fen,
          playerColor: senderColor,
          summonedSquare: payload.square,
          pieceType: payload.piece.type, // This comes from client payload, should match removed piece type
          noShowBishopUsed: true, // Explicitly send updated used state
          whitePlayerAdvantageStatesFull, // Send full state for white
          blackPlayerAdvantageStatesFull, // Send full state for black
        });
      } else {
        console.error(`[No-Show Bishop Summon] Failed for ${senderColor}: ${result.error}`);
        socket.emit("summonBishopFailed", { message: result.error });
      }
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
        if (room.fen && room.fenHistory && room.fenHistory[room.fenHistory.length -1] !== room.fen) {
            room.fenHistory.push(room.fen);
            console.log(`[Sacrificial Blessing] Added SB FEN to history: ${room.fen}`);
        }

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

    // Add handler for activating Void Step
    socket.on('activate_void_step', () => {
      const roomId = Array.from(socket.rooms)[1];
      if (!roomId) return;

      const room = rooms[roomId];
      if (!room) return;

      const playerColor = socket.id === room.white ? 'w' : socket.id === room.black ? 'b' : null;
      if (!playerColor) return;

      const voidStepState = playerColor === 'w' ? room.whiteVoidStepState : room.blackVoidStepState;
      if (voidStepState?.hasUsed) return;

      if (playerColor === 'w') {
        room.whiteVoidStepState = { isActive: true, hasUsed: false };
      } else {
        room.blackVoidStepState = { isActive: true, hasUsed: false };
      }

      // Notify clients of the activation
      io.to(roomId).emit('advantageStateUpdated', {
        voidStep: playerColor === 'w' ? room.whiteVoidStepState : room.blackVoidStepState
      });
    });

    socket.on("recall_piece", async ({ roomId, pieceSquare, targetSquare }: { roomId: string; pieceSquare: Square; targetSquare: Square }) => {
      try {
        const room = rooms[roomId];
        if (!room || !room.fen || !room.white || !room.black || !room.fenHistory) {
          socket.emit("recallFailed", { message: "Room or game state not found." });
          console.error(`[recall_piece] Room ${roomId} or critical room state not found.`);
          return;
        }

        const playerSocketId = socket.id;
        let playerColor: 'white' | 'black' | null = null;
        let playerRecallState: RecallState | undefined;
        let opponentColor: 'white' | 'black' | null = null; // Not strictly needed here but good for context

        if (playerSocketId === room.white) {
          playerColor = 'white';
          playerRecallState = room.whiteRecallState;
          opponentColor = 'black';
        } else if (playerSocketId === room.black) {
          playerColor = 'black';
          playerRecallState = room.blackRecallState;
          opponentColor = 'white';
        } else {
          socket.emit("recallFailed", { message: "Player not part of this game." });
          console.error(`[recall_piece] Socket ${playerSocketId} not a player in room ${roomId}.`);
          return;
        }

        if (!playerRecallState) {
          socket.emit("recallFailed", { message: "Recall state not found for player." });
          console.error(`[recall_piece] RecallState not found for ${playerColor} in room ${roomId}.`);
          return;
        }
        
        const serverGameForTurnCheck = new Chess(room.fen);
        if (serverGameForTurnCheck.turn() !== playerColor[0]) {
            socket.emit("recallFailed", { message: "Not your turn to use Recall." });
            console.warn(`[recall_piece] ${playerColor} tried to Recall out of turn in room ${roomId}.`);
            return;
        }

        const validationResult = validateRecallServerWithUID({
          game: new Chess(room.fen),
          pieceTracking: room.pieceTracking!,
          pieceTrackingHistory: room.pieceTrackingHistory!,
          pieceSquare,
          playerColor: playerColor[0] as 'w' | 'b',
          recallState: playerRecallState,
        });

        if (validationResult.isValid && validationResult.nextFen) {
          room.fen = validationResult.nextFen;
          playerRecallState.used = true; 

          if (playerColor === 'white') {
            room.whiteRecallState = playerRecallState;
          } else {
            room.blackRecallState = playerRecallState;
          }
          
          if (room.fenHistory[room.fenHistory.length - 1] !== room.fen) {
            room.fenHistory.push(room.fen);
             console.log(`[SocketHandlers recall_piece] fenHistory updated after recall. New length: ${room.fenHistory.length}. Last FEN: ${room.fen}`);
          }

          const recallMoveData: ServerMovePayload = {
            from: pieceSquare, 
            to: targetSquare,   
            special: 'recall_teleport', 
            color: playerColor, 
            afterFen: room.fen,
            updatedAdvantageStates: { 
              ...(playerColor === 'white' && { recall: room.whiteRecallState }),
              ...(playerColor === 'black' && { recall: room.blackRecallState }),
            }
          };
          
          // Populate full advantage states for broadcast
          const whitePlayerAdvantageStatesFull: PlayerAdvantageStates = {
            ...(room.whiteAdvantage?.id === 'royal_escort' && { royalEscort: room.whiteRoyalEscortState }),
            ...(room.whiteAdvantage?.id === 'lightning_capture' && { lightningCapture: room.whiteLightningCaptureState }),
            ...(room.whiteAdvantage?.id === 'opening_swap' && { openingSwap: room.whiteOpeningSwapState }),
            ...(room.whiteAdvantage?.id === 'pawn_ambush' && { pawnAmbush: room.whitePawnAmbushState }),
            ...(room.whiteAdvantage?.id === 'queens_domain' && { queens_domain: room.whiteQueensDomainState }),
            ...(room.whiteAdvantage?.id === 'knightmare' && { knightmare: room.whiteKnightmareState }),
            ...(room.whiteAdvantage?.id === 'queenly_compensation' && { queenly_compensation: room.whiteQueenlyCompensationState }),
            ...(room.whiteAdvantage?.id === 'coordinated_push' && { coordinatedPush: room.whiteCoordinatedPushState }),
            ...(room.whiteCloakState && { cloak: room.whiteCloakState }),
            ...(room.whiteAdvantage?.id === 'no_show_bishop' && { noShowBishopUsed: room.whiteNoShowBishopUsed, noShowBishopRemovedPiece: room.whiteNoShowBishopRemovedPiece }),
            ...(room.whiteRecallState && { recall: room.whiteRecallState }), // Include recall state
          };
          const blackPlayerAdvantageStatesFull: PlayerAdvantageStates = {
            ...(room.blackAdvantage?.id === 'royal_escort' && { royalEscort: room.blackRoyalEscortState }),
            ...(room.blackAdvantage?.id === 'lightning_capture' && { lightningCapture: room.blackLightningCaptureState }),
            ...(room.blackAdvantage?.id === 'opening_swap' && { openingSwap: room.blackOpeningSwapState }),
            ...(room.blackAdvantage?.id === 'pawn_ambush' && { pawnAmbush: room.blackPawnAmbushState }),
            ...(room.blackAdvantage?.id === 'queens_domain' && { queens_domain: room.blackQueensDomainState }),
            ...(room.blackAdvantage?.id === 'knightmare' && { knightmare: room.blackKnightmareState }),
            ...(room.blackAdvantage?.id === 'queenly_compensation' && { queenly_compensation: room.blackQueenlyCompensationState }),
            ...(room.blackAdvantage?.id === 'coordinated_push' && { coordinatedPush: room.blackCoordinatedPushState }),
            ...(room.blackCloakState && { cloak: room.blackCloakState }),
            ...(room.blackAdvantage?.id === 'no_show_bishop' && { noShowBishopUsed: room.blackNoShowBishopUsed, noShowBishopRemovedPiece: room.blackNoShowBishopRemovedPiece }),
            ...(room.blackRecallState && { recall: room.blackRecallState }), // Include recall state
          };

          io.to(roomId).emit("receiveMove", { 
            move: recallMoveData,
            whitePlayerAdvantageStatesFull,
            blackPlayerAdvantageStatesFull,
          });

          console.log(`[recall_piece] ${playerColor} successfully recalled piece from ${pieceSquare} to ${targetSquare} in room ${roomId}. New FEN: ${room.fen}`);

        } else {
          socket.emit("recallFailed", { message: validationResult.error || "Recall validation failed on server." });
          console.warn(`[recall_piece] Recall failed for ${playerColor} in room ${roomId}: ${validationResult.error}`);
        }
      } catch (error) {
        console.error(`[recall_piece] Error during recall for room ${roomId}:`, error);
        socket.emit("recallFailed", { message: "An unexpected error occurred during recall." });
      }
    });

  });
}