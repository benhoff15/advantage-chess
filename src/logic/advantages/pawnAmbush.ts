import { Chess, Move, Square, PieceSymbol, Color } from 'chess.js';
import { Advantage, ServerMovePayload } from "../../../shared/types";

export interface HandlePawnAmbushClientParams {
  game: Chess; // The local chess.js game instance
  move: Move; // The move object from the local game.move()
  playerColor: 'white' | 'black'; // The current player's color
  advantage: Advantage | null; // The current player's advantage
}

export interface HandlePawnAmbushClientResult {
  promotionApplied: boolean;
  fen?: string; // New FEN if promotion was applied locally
  originalMove?: Move; // Could return the original move for context
}

/**
 * Handles the Pawn Ambush logic for the client making the move.
 * This is for immediate local feedback before server confirmation.
 */
export const handlePawnAmbushClient = ({
  game,
  move,
  playerColor,
  advantage,
}: HandlePawnAmbushClientParams): HandlePawnAmbushClientResult => {
  if (advantage?.id !== 'pawn_ambush' || move.piece !== 'p') {
    return { promotionApplied: false, originalMove: move };
  }

  const rank = move.to[1]; // Get the rank, e.g., '6' from 'e6'
  const targetRank = playerColor === 'white' ? '6' : '3';

  if (rank !== targetRank) {
    return { promotionApplied: false, originalMove: move };
  }

  // Check if the pawn has already been promoted by normal means (e.g. client somehow sent 8th rank move here)
  // This function is about 6th rank ambush, not standard promotion.
  if (move.promotion) {
      // This indicates a standard 8th/1st rank promotion occurred with game.move(), not an ambush.
      return { promotionApplied: false, originalMove: move };
  }

  console.log(`[Pawn Ambush Client] Local trigger for ${playerColor} pawn from ${move.from} to ${move.to}. Applying queen promotion.`);

  // Perform local promotion for immediate feedback
  // The 'game' instance is already after the pawn has moved to the target square.
  game.remove(move.to as Square);
  game.put({ type: 'q', color: playerColor[0] as Color }, move.to as Square);

  return {
    promotionApplied: true,
    fen: game.fen(),
    originalMove: move, // Return the original move for context if needed by caller
  };
};

export interface ApplyPawnAmbushOpponentMoveParams {
  game: Chess; // The local chess.js game instance (usually already updated by server's FEN)
  receivedMove: ServerMovePayload; // The move payload received from the server
}

export interface ApplyPawnAmbushOpponentMoveResult {
  ambushRecognized: boolean; // Indicates if the opponent's move was identified as a Pawn Ambush
}

/**
 * Handles received opponent moves that were flagged as Pawn Ambush.
 * The main board update comes from the FEN sent by the server.
 * This function is mainly for confirming the flag and potentially triggering UI cues.
 */
export const applyPawnAmbushOpponentMove = ({
  game,
  receivedMove,
}: ApplyPawnAmbushOpponentMoveParams): ApplyPawnAmbushOpponentMoveResult => {
  if (receivedMove.wasPawnAmbush) {
    console.log(`[Pawn Ambush Client] Opponent's move (${receivedMove.from} to ${receivedMove.to}) was a Pawn Ambush. Board should reflect promotion via FEN.`);
    // The client's `game` instance should have already been updated with the new FEN from the server
    // in ChessGame.tsx's handleReceiveMove before this function would typically be called.
    // We can verify the piece on the square.
    const promotedPiece = game.get(receivedMove.to as Square);
    if (promotedPiece && promotedPiece.type === 'q' && promotedPiece.color === receivedMove.color?.[0]) {
      // Correctly shows a queen of the opponent's color.
    } else {
      console.warn(`[Pawn Ambush Client] Discrepancy: Opponent's Pawn Ambush move (${receivedMove.from}-${receivedMove.to}) flagged, but board does not show expected queen. Current piece: ${promotedPiece?.type} ${promotedPiece?.color}. FEN: ${game.fen()}`);
    }
    return { ambushRecognized: true };
  }

  return { ambushRecognized: false };
};
