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
