import { Chess, Move, Square, PieceSymbol, Color } from 'chess.js';
import { PawnAmbushState, ServerMovePayload } from '../../../shared/types'; // Adjusted path

// Define a type for the RoomState properties relevant to Pawn Ambush
// This avoids needing the full RoomState type if it's very large or complex,
// focusing only on what this specific advantage logic needs.
export interface PawnAmbushRoomState {
  whitePawnAmbushState?: PawnAmbushState;
  blackPawnAmbushState?: PawnAmbushState;
  fen?: string; // Include FEN if the game state is to be modified directly based on it
}

export interface HandlePawnAmbushServerParams {
  game: Chess; // The chess.js game instance
  move: Move; // The move object from chess.js
  playerColor: Color; // 'w' or 'b'
  currentRoomState: PawnAmbushRoomState; // The relevant parts of the room's state
}

export interface HandlePawnAmbushServerResult {
  promotionApplied: boolean;
  newFen?: string;
  updatedPawnAmbushState?: PawnAmbushState;
}

export const handlePawnAmbushServer = ({
  game,
  move,
  playerColor,
  currentRoomState,
}: HandlePawnAmbushServerParams): HandlePawnAmbushServerResult => {
  console.log(`[Pawn Ambush Server] handlePawnAmbushServer called. Player: ${playerColor}, Move: ${move.from}-${move.to}, Piece: ${move.piece}, Flags: ${move.flags}`);

  // Ensure the moved piece is a pawn
  if (move.piece !== 'p') {
    console.log(`[Pawn Ambush Server] Not a pawn. Piece: ${move.piece}. No action.`);
    return { promotionApplied: false };
  }

  const rank = move.to[1]; // Get the rank, e.g., '6' from 'e6'
  const targetRank = playerColor === 'w' ? '6' : '3';

  if (rank !== targetRank) {
    console.log(`[Pawn Ambush Server] Pawn on ${move.to}, but not target rank ${targetRank}. No action.`);
    return { promotionApplied: false };
  }

  // Get the current PawnAmbushState for the player
  let playerPawnAmbushState = playerColor === 'w'
    ? currentRoomState.whitePawnAmbushState
    : currentRoomState.blackPawnAmbushState;

  if (!playerPawnAmbushState) {
    console.log(`[Pawn Ambush Server] Initializing PawnAmbushState for ${playerColor}.`);
    playerPawnAmbushState = { ambushedPawns: [] };
  }

  if (playerPawnAmbushState.ambushedPawns.includes(move.from)) {
    console.log(`[Pawn Ambush Server] Pawn from ${move.from} already ambushed. List: ${playerPawnAmbushState.ambushedPawns.join(', ')}. No action.`);
    return { promotionApplied: false };
  }

  console.log(`[Pawn Ambush Server] Conditions met for ${playerColor} pawn from ${move.from} to ${move.to}. Attempting promotion.`);
  const fenBeforePromotion = game.fen();
  console.log(`[Pawn Ambush Server] FEN before promotion: ${fenBeforePromotion}`);

  const removedPiece = game.remove(move.to as Square);
  if (!removedPiece || removedPiece.type !== 'p') {
    console.error(`[Pawn Ambush Server] Error: Expected pawn on ${move.to} but found ${removedPiece?.type}. Current FEN: ${game.fen()}. Original FEN passed to func: ${currentRoomState.fen}`);
    // Safeguard logic (keep as is, it includes logging)
    if (currentRoomState.fen) {
        game.load(currentRoomState.fen); // Try to resync with FEN from room state if game instance is off
        const recheckPiece = game.get(move.to as Square);
        if (recheckPiece && recheckPiece.type === 'p' && recheckPiece.color === playerColor) {
            console.log(`[Pawn Ambush Server] Resynced with currentRoomState.fen. Re-removing pawn from ${move.to}.`);
            game.remove(move.to as Square);
        } else {
            console.error(`[Pawn Ambush Server] Error: Still no pawn on ${move.to} after FEN reload from currentRoomState.fen. Cannot promote. Piece: ${recheckPiece?.type}`);
            return { promotionApplied: false };
        }
    } else {
        console.error(`[Pawn Ambush Server] Error: No currentRoomState.fen to fallback to. Cannot promote.`);
        return { promotionApplied: false }; 
    }
  }
  
  game.put({ type: 'q', color: playerColor }, move.to as Square);
  const fenAfterPromotion = game.fen();
  console.log(`[Pawn Ambush Server] FEN after promotion: ${fenAfterPromotion}`);

  const updatedAmbushedPawns = [...playerPawnAmbushState.ambushedPawns, move.from];
  const updatedState: PawnAmbushState = { ambushedPawns: updatedAmbushedPawns };

  console.log(`[Pawn Ambush Server] Pawn from ${move.from} promoted. New ambushed list: ${updatedAmbushedPawns.join(', ')}`);

  return {
    promotionApplied: true,
    newFen: fenAfterPromotion,
    updatedPawnAmbushState: updatedState,
  };
};
