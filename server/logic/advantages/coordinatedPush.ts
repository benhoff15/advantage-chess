import { Chess, Move, PieceSymbol, Square } from 'chess.js';
import { ServerMovePayload } from '../../../shared/types';

export function validateCoordinatedPushServerMove(
  game: Chess, // This is the main game instance, used for context but not for temp moves
  playerColor: 'white' | 'black',
  firstMovePayload: ServerMovePayload,
  secondMovePayload: ServerMovePayload,
  currentFen: string
): { isValid: boolean; nextFen?: string; error?: string } {
  const playerPieceColor = playerColor === 'white' ? 'w' : 'b';

  // --- Helper to check for one square forward move ---
  const isOneSquareForward = (pColor: 'w' | 'b', fromSq: Square, toSq: Square, moveNumber: string): boolean => {
    if (fromSq[0] !== toSq[0]) {
        return false; 
    }
    const fromRank = parseInt(fromSq[1]);
    const toRank = parseInt(toSq[1]);
    let expectedToRank: number;
    if (pColor === 'w') {
        expectedToRank = fromRank + 1;
    } else {
        expectedToRank = fromRank - 1;
    }
    if (toRank !== expectedToRank) {
        return false;
    }
    return true;
  };

  // 4. Cross-Move Validation (using a fresh game instance loaded with currentFen)
  // This is done BEFORE sequential validation to catch structural issues first.
  const initialGame = new Chess();
  try {
      initialGame.load(currentFen);
  } catch (e: any) {
      return { isValid: false, error: "Internal server error: FEN load failure for initial check." };
  }

  const pawn1Initial = initialGame.get(firstMovePayload.from as Square);
  const pawn2Initial = initialGame.get(secondMovePayload.from as Square);

  if (!pawn1Initial || pawn1Initial.type !== 'p' || pawn1Initial.color !== playerPieceColor) {
    return { isValid: false, error: 'Cross-move: First piece was not a valid pawn initially.' };
  }
  if (!pawn2Initial || pawn2Initial.type !== 'p' || pawn2Initial.color !== playerPieceColor) {
    return { isValid: false, error: 'Cross-move: Second piece was not a valid pawn initially.' };
  }

  if (firstMovePayload.from[1] !== secondMovePayload.from[1]) {
    return { isValid: false, error: 'Cross-move: Pawns are not on the same rank.' };
  }

  if (Math.abs(firstMovePayload.from.charCodeAt(0) - secondMovePayload.from.charCodeAt(0)) !== 1) {
    return { isValid: false, error: 'Cross-move: Pawns are not on adjacent files.' };
  }
  
  if (!isOneSquareForward(playerPieceColor, firstMovePayload.from as Square, firstMovePayload.to as Square, "Initial First")) {
      return { isValid: false, error: "Cross-move: First move is not one square forward."};
  }
  if (!isOneSquareForward(playerPieceColor, secondMovePayload.from as Square, secondMovePayload.to as Square, "Initial Second")) {
      return { isValid: false, error: "Cross-move: Second move is not one square forward."};
  }

  const firstMoveToPieceInitial = initialGame.get(firstMovePayload.to as Square);
  if (firstMoveToPieceInitial !== null && typeof firstMoveToPieceInitial !== 'undefined') {
    return { isValid: false, error: "Cross-move: Target square for first pawn was not initially empty." };
  }

  const secondMoveToPieceInitial = initialGame.get(secondMovePayload.to as Square);
  if (secondMoveToPieceInitial !== null && typeof secondMoveToPieceInitial !== 'undefined') {
    return { isValid: false, error: "Cross-move: Target square for second pawn was not initially empty." };
  }


  // 1. Create a new Chess instance for sequential validation and load current FEN
  const validationGame = new Chess();
  try {
    validationGame.load(currentFen);
  } catch (e: any) {
    return { isValid: false, error: "Internal server error: FEN load failure for sequential validation." };
  }

  // 2. Validate firstMovePayload sequentially
  const firstPawnSequential = validationGame.get(firstMovePayload.from as Square);
  if (!firstPawnSequential || firstPawnSequential.type !== 'p' || firstPawnSequential.color !== playerPieceColor) {
    return { isValid: false, error: 'First piece is not a valid pawn for coordinated push.' };
  }
  if (!isOneSquareForward(playerPieceColor, firstMovePayload.from as Square, firstMovePayload.to as Square, "Sequential First")) {
    return { isValid: false, error: 'First move is not a one-square forward push.' };
  }
  const firstMoveTargetSequential = validationGame.get(firstMovePayload.to as Square);
  if (firstMoveTargetSequential !== null) {
    return { isValid: false, error: 'Target square for first move is not empty.' };
  }

  const firstMoveResult = validationGame.move({
    from: firstMovePayload.from as Square,
    to: firstMovePayload.to as Square,
  });
  if (!firstMoveResult) {
    return { isValid: false, error: 'First move is invalid according to chess rules.' };
  }


  // 3. Validate secondMovePayload (after the first move is notionally made on validationGame)
  const secondPawnSequential = validationGame.get(secondMovePayload.from as Square);
  if (!secondPawnSequential || secondPawnSequential.type !== 'p' || secondPawnSequential.color !== playerPieceColor) {
    return { isValid: false, error: 'Second piece is not a valid pawn for coordinated push after first move.' };
  }
  if (!isOneSquareForward(playerPieceColor, secondMovePayload.from as Square, secondMovePayload.to as Square, "Sequential Second")) {
    return { isValid: false, error: 'Second move is not a one-square forward push.' };
  }
  const secondMoveTargetSequential = validationGame.get(secondMovePayload.to as Square);
  if (secondMoveTargetSequential !== null) {
    return { isValid: false, error: 'Target square for second move is not empty.' };
  }

  const secondMoveResult = validationGame.move({
    from: secondMovePayload.from as Square,
    to: secondMovePayload.to as Square,
  });
  if (!secondMoveResult) {
    return { isValid: false, error: 'Second move is invalid according to chess rules after first move.' };
  }
  
  // Ensure moves are not captures (chess.js move object would have a 'captured' flag)
  // The .get(target) === null checks above already ensure this for push moves.

  // 5. If all validations pass
  const finalResult = { isValid: true, nextFen: validationGame.fen() };
  return finalResult;
}
