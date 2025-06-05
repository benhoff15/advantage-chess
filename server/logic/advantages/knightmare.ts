import { Chess, Move, Square, Color, PieceSymbol } from 'chess.js';
import { ServerMovePayload } from '../../../shared/types'; // Adjust path as needed

// Define the 12 valid Knightmare move vectors
const KNIGHTMARE_MOVES: { dx: number; dy: number }[] = [
  { dx: 2, dy: 4 }, { dx: 2, dy: -4 }, { dx: -2, dy: 4 }, { dx: -2, dy: -4 },
  { dx: 4, dy: 2 }, { dx: 4, dy: -2 }, { dx: -4, dy: 2 }, { dx: -4, dy: -2 },
  { dx: 3, dy: 3 }, { dx: 3, dy: -3 }, { dx: -3, dy: 3 }, { dx: -3, dy: -3 },
];

export interface KnightmareAdvantageState {
  hasUsed: boolean;
}

interface ValidateKnightmareServerMoveParams {
  game: Chess; // Server's main game instance, loaded with currentFen. Treat as read-only for currentFen state.
  clientMoveData: ServerMovePayload; // Contains from, to, special: 'knightmare'
  currentFen: string; // FEN before this Knightmare move attempt
  playerColor: 'w' | 'b'; // Player's color ('w' or 'b')
  advantageState: KnightmareAdvantageState; // Player's current state for Knightmare
}

interface ValidateKnightmareServerMoveResult {
  moveResult: Move | null; // chess.js Move object if successful
  nextFen: string; // The FEN after the move, or currentFen if failed
  advantageStateUpdated: KnightmareAdvantageState; // Potentially updated state
  error?: string; // Optional error message
}

// Helper to convert square to 0-indexed coordinates
const squareToCoords = (square: Square): { x: number; y: number } => {
  return {
    x: square.charCodeAt(0) - 'a'.charCodeAt(0),
    y: parseInt(square[1], 10) - 1,
  };
};

// Helper to convert 0-indexed coordinates to square (not used in this file, but good for completeness if needed elsewhere)
/*
const coordsToSquare = (coords: { x: number; y: number }): Square | null => {
  if (coords.x < 0 || coords.x > 7 || coords.y < 0 || coords.y > 7) {
    return null;
  }
  return (String.fromCharCode('a'.charCodeAt(0) + coords.x) + (coords.y + 1)) as Square;
};
*/

export function validateKnightmareServerMove({
  game, // This game instance's state for currentFen should be preserved if validation fails.
  clientMoveData,
  currentFen,
  playerColor,
  advantageState,
}: ValidateKnightmareServerMoveParams): ValidateKnightmareServerMoveResult {
  console.log(`[KnightmareServer] Validating Knightmare. Player: ${playerColor}, FEN: ${currentFen}, Advantage State: ${JSON.stringify(advantageState)}`);

  if (clientMoveData.special !== 'knightmare') {
    console.warn('[KnightmareServer] Incorrect special move type passed:', clientMoveData.special);
    return {
      moveResult: null,
      nextFen: currentFen,
      advantageStateUpdated: advantageState,
      error: "Internal error: Validate function called for non-Knightmare move.",
    };
  }

  // Check if Knightmare has already been used
  if (advantageState.hasUsed) {
    console.warn(`[KnightmareServer] Knightmare advantage for player ${playerColor} has already been used.`);
    return {
      moveResult: null,
      nextFen: currentFen,
      advantageStateUpdated: advantageState, // or { hasUsed: true }
      error: "Knightmare advantage has already been used.",
    };
  }

  const pieceOnFromSquare = game.get(clientMoveData.from as Square);

  if (!pieceOnFromSquare || pieceOnFromSquare.type !== 'n' || pieceOnFromSquare.color !== playerColor) {
    console.warn(`[KnightmareServer] Piece at ${clientMoveData.from} is not player's knight. Piece: ${JSON.stringify(pieceOnFromSquare)}`);
    return {
      moveResult: null,
      nextFen: currentFen,
      advantageStateUpdated: advantageState,
      error: "Piece is not a knight or not player's color.",
    };
  }

  const fromCoords = squareToCoords(clientMoveData.from as Square);
  const toCoords = squareToCoords(clientMoveData.to as Square);
  const dx = toCoords.x - fromCoords.x;
  const dy = toCoords.y - fromCoords.y;

  const isValidKnightmareVector = KNIGHTMARE_MOVES.some(m => m.dx === dx && m.dy === dy);

  if (!isValidKnightmareVector) {
    console.warn(`[KnightmareServer] Move from ${clientMoveData.from} to ${clientMoveData.to} is not a valid Knightmare vector. dx=${dx}, dy=${dy}`);
    return {
      moveResult: null,
      nextFen: currentFen,
      advantageStateUpdated: advantageState,
      error: "Invalid Knightmare move pattern.",
    };
  }
  
  const targetPiece = game.get(clientMoveData.to as Square);
  if (targetPiece && targetPiece.color === playerColor) {
    console.warn(`[KnightmareServer] Cannot capture own piece at ${clientMoveData.to}.`);
    return {
      moveResult: null,
      nextFen: currentFen,
      advantageStateUpdated: advantageState,
      error: "Cannot capture own piece.",
    };
  }

  const fromSq = clientMoveData.from as Square;
  const toSq = clientMoveData.to as Square;

  // Get details of the piece being moved (for the Move object) and any captured piece
  // from the original board state before any Knightmare modifications.
  const originalGameForCheck = new Chess(currentFen);
  const pieceBeingMoved = originalGameForCheck.get(fromSq); 
  if (!pieceBeingMoved) {
      console.error(`[KnightmareServer] Critical error: piece expected at ${fromSq} was not found in originalGameForCheck loaded with currentFen.`);
      return { moveResult: null, nextFen: currentFen, advantageStateUpdated: advantageState, error: "Internal error: piece not found on temp board based on currentFen." };
  }
  const capturedPieceDetails = originalGameForCheck.get(toSq); // Piece on destination square in original FEN

  // Now, create a temporary game to simulate the move for FEN generation
  const tempGame = new Chess(currentFen);
  tempGame.remove(fromSq); // Remove the knight from its original square
  if (capturedPieceDetails) { // If there was a piece on the target square
    tempGame.remove(toSq); // Remove it (it's captured)
  }
  tempGame.put({ type: 'n', color: playerColor }, toSq); // Place the knight on the target square

  let fenParts = tempGame.fen().split(' ');
  const originalFenParts = currentFen.split(' ');
  
  fenParts[1] = (playerColor === 'w') ? 'b' : 'w';
  fenParts[2] = originalFenParts[2]; // Castling rights
  fenParts[3] = '-'; // En passant

  const originalHalfmoves = parseInt(originalFenParts[4], 10) || 0;
  fenParts[4] = capturedPieceDetails ? '0' : (originalHalfmoves + 1).toString();

  const originalFullmoves = parseInt(originalFenParts[5], 10) || 1;
  if (playerColor === 'b') {
    fenParts[5] = (originalFullmoves + 1).toString();
  } else {
    fenParts[5] = originalFullmoves.toString();
  }

  const constructedFen = fenParts.join(' ');

  try {
    const validationLoad = new Chess();
    validationLoad.load(constructedFen); 
    if (validationLoad.fen() !== constructedFen && validationLoad.fen().split(' ')[0] !== constructedFen.split(' ')[0]) {
        // Log if piece placement part of FEN changes upon load, as that's more critical.
        // Other parts (like fullmove count if it was "0") might be normalized by chess.js.
        console.warn(`[KnightmareServer] Constructed FEN '${constructedFen}' was significantly altered by chess.js load to '${validationLoad.fen()}'. Using loaded FEN.`);
        // Using validationLoad.fen() might be safer if chess.js normalization is preferred.
        // For this implementation, we'll stick to constructedFen unless load fails.
    }
  } catch (e: any) {
    console.error(`[KnightmareServer] Error validating constructed FEN '${constructedFen}':`, e.message);
    return {
      moveResult: null,
      nextFen: currentFen,
      advantageStateUpdated: advantageState,
      error: "Failed to construct a valid FEN after Knightmare move.",
    };
  }
  
  const moveResultObject: Move = {
    color: playerColor,
    from: fromSq,
    to: toSq,
    flags: capturedPieceDetails ? 'c' : 'n', // 'c' for capture, 'n' for non-capture
    piece: 'n', // Piece type that moved
    san: `N${capturedPieceDetails ? 'x' : ''}${toSq}`, // Standard Algebraic Notation
    lan: `${fromSq}${toSq}`, // Long Algebraic Notation
    before: currentFen, // FEN before move
    after: constructedFen, // FEN after move
    captured: capturedPieceDetails ? capturedPieceDetails.type : undefined,
    // Adding chess.js specific methods
    isCapture: () => !!capturedPieceDetails,
    isPromotion: () => false,
    isEnPassant: () => false,
    isKingsideCastle: () => false,
    isQueensideCastle: () => false,
    isBigPawn: () => false, // Knightmare move is not a big pawn move
  };
  // No need for: if (capturedPieceDetails) { moveResultObject.captured = capturedPieceDetails.type; }
  // as it's handled by the ternary operator above.

  console.log(`[KnightmareServer] Move validated. From: ${fromSq}, To: ${toSq}. New FEN: ${constructedFen}. Captured: ${capturedPieceDetails ? capturedPieceDetails.type : 'none'}. SAN: ${moveResultObject.san}`);
  
  console.log(`[KnightmareServer] Marking Knightmare as used for player ${playerColor}.`);
  return {
    moveResult: moveResultObject,
    nextFen: constructedFen,
    advantageStateUpdated: {
      hasUsed: true,
    },
  };
}
