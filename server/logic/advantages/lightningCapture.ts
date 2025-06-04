import { Chess, Move, Square } from 'chess.js';
import { LightningCaptureState } from '../../../shared/types';

interface ValidateLightningCaptureServerMoveParams {
  game: Chess;
  clientMoveData: {
    from: string;
    to: string;
    secondTo: string;
    color: "white" | "black"; // Color of the player making the move
  };
  currentFen: string;
  playerColor: "w" | "b"; // Color of the player ('w' or 'b')
  lightningCaptureState: LightningCaptureState;
}

interface ValidationResult {
  moveResult: Move | null;
  nextFen: string;
  error?: string | null;
}

export const validateLightningCaptureServerMove = ({
  game,
  clientMoveData,
  currentFen,
  playerColor,
  lightningCaptureState,
}: ValidateLightningCaptureServerMoveParams): ValidationResult => {
  if (lightningCaptureState.used) {
    return { moveResult: null, nextFen: currentFen, error: "Lightning Capture already used." };
  }

  game.load(currentFen);

  if (game.turn() !== playerColor) {
    return { moveResult: null, nextFen: currentFen, error: "Not player's turn." };
  }

  // First Move Validation
  const pieceOnTarget = game.get(clientMoveData.to as Square);
  if (!pieceOnTarget) {
    return { moveResult: null, nextFen: currentFen, error: "First move must be a capture." };
  }
  // Ensure the captured piece is of the opposite color
  if (pieceOnTarget.color === playerColor) {
    return { moveResult: null, nextFen: currentFen, error: "Cannot capture your own piece on the first move." };
  }


  const firstMove = game.move({ from: clientMoveData.from as Square, to: clientMoveData.to as Square, promotion: 'q' }); // Assume promotion
  if (!firstMove) {
    return { moveResult: null, nextFen: currentFen, error: "Invalid first move." };
  }

  // FIX: Set turn back to the current player for the second move
  const fenAfterFirstMove = game.fen();
  const fenParts = fenAfterFirstMove.split(' ');
  fenParts[1] = playerColor; // playerColor is 'w' or 'b'
  const fenForSecondMove = fenParts.join(' ');
  
  // Load the FEN with the corrected turn. 
  // It's important to do this on the same 'game' instance if possible,
  // or if 'game.load()' is robust enough to handle this re-entry.
  // Based on chess.js, game.load() will reset and correctly set the turn.
  try {
    game.load(fenForSecondMove);
  } catch (e) {
    console.error('[LC Server Validation] CRITICAL: Failed to load FEN with corrected turn before second move:', e);
    // If this fails, we should probably revert the first move and return an error.
    // However, game.undo() might not work if game.load() left the instance in a bad state.
    // For now, log and let it proceed to fail at secondMoveResult, or return a generic error.
    // A more robust solution might involve using a fresh chess.js instance for the second move validation if game.load() is problematic here.
    // Given the context, game.load() should be fine.
    return { moveResult: null, nextFen: currentFen, error: "Internal server error during move validation." };
  }
  // END FIX

  // ADD LOGGING HERE:
  console.log('[LC Server Validation] --- Before Second Move Attempt ---');
  console.log('[LC Server Validation] Current FEN after first move:', game.fen());
  console.log('[LC Server Validation] Player color attempting move:', playerColor);
  console.log('[LC Server Validation] Game turn after first move:', game.turn());
  console.log('[LC Server Validation] ClientMoveData:', JSON.stringify(clientMoveData));
  console.log('[LC Server Validation] Piece on clientMoveData.to (e.g., e5):', JSON.stringify(game.get(clientMoveData.to as Square)));
  
  const possibleMovesFromLandingSquare = game.moves({ square: clientMoveData.to as Square, verbose: true });
  console.log(`[LC Server Validation] Possible moves from ${clientMoveData.to} (after first move, current turn ${game.turn()}):`, JSON.stringify(possibleMovesFromLandingSquare));
  // END LOGGING

  // Second Move Validation
  const pieceOnSecondTarget = game.get(clientMoveData.secondTo as Square);
  if (pieceOnSecondTarget && pieceOnSecondTarget.type === 'k' && pieceOnSecondTarget.color !== playerColor) {
    game.undo(); // Revert the first move
    return { moveResult: null, nextFen: currentFen, error: "Cannot capture opponent's king on second move." };
  }
  // Ensure the second move does not capture one's own piece (unless it's a special case like castling, not relevant here)
  if (pieceOnSecondTarget && pieceOnSecondTarget.color === playerColor) {
    game.undo(); // Revert the first move
    return { moveResult: null, nextFen: currentFen, error: "Cannot capture your own piece on the second move." };
  }


  const secondMoveResult = game.move({ from: clientMoveData.to as Square, to: clientMoveData.secondTo as Square, promotion: 'q' }); // Assume promotion
  if (!secondMoveResult) {
    game.undo(); // Revert the first move
    return { moveResult: null, nextFen: currentFen, error: "Invalid second move." };
  }

  // Successfully validated
  return {
    moveResult: secondMoveResult, // This is the Move object for the *second* move.
                                  // The full sequence is from.clientMoveData.from -> clientMoveData.to -> clientMoveData.secondTo
    nextFen: game.fen(),
    error: null,
  };
};
