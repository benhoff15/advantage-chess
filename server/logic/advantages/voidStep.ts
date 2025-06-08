import { Chess, Move, Square } from 'chess.js';
import { ServerMovePayload } from '../../../shared/types';

interface VoidStepState {
  isActive: boolean;
  hasUsed: boolean;
}

interface ValidateVoidStepServerMoveParams {
  game: Chess;
  clientMoveData: ServerMovePayload;
  currentFen: string;
  playerColor: 'w' | 'b';
  voidStepState: VoidStepState | undefined;
}

interface ValidationResult {
  moveResult: Move | null;
  nextFen: string;
  error?: string | null;
  updatedVoidStepState?: VoidStepState;
}

export function validateVoidStepServerMove({
  game,
  clientMoveData,
  currentFen,
  playerColor,
  voidStepState,
}: ValidateVoidStepServerMoveParams): ValidationResult {
  console.log("[Void Step Server Debug] Validating move:", {
    clientMoveData,
    playerColor,
    voidStepState
  });

  // If void step is not active, return null to let normal move validation handle it
  if (!voidStepState?.isActive) {
    console.log("[Void Step Server Debug] Void step not active");
    return {
      moveResult: null,
      nextFen: currentFen,
    };
  }

  const { from, to } = clientMoveData;
  const piece = game.get(from as Square);
  console.log("[Void Step Server Debug] Piece details:", piece);

  // Basic validation
  if (!piece || piece.color !== playerColor) {
    console.log("[Void Step Server Debug] Invalid piece or color");
    return {
      moveResult: null,
      nextFen: currentFen,
      error: 'Invalid piece or color',
    };
  }

  // Don't allow king to use void step
  if (piece.type === 'k') {
    console.log("[Void Step Server Debug] King cannot use void step");
    return {
      moveResult: null,
      nextFen: currentFen,
      error: 'King cannot use void step',
    };
  }

  // Create a temporary game to test the move
  const tempGame = new Chess(currentFen);
  
  try {
    console.log("[Void Step Server Debug] Attempting move");
    // For Void Step, temporarily remove only friendly pieces in the path
    const path = getVoidStepPath(from as Square, to as Square, piece.type);
    console.log("[Void Step Server Debug] Path to clear:", path);
    
    // Store friendly pieces in the path
    const friendlyPathPieces = path
      .map(square => ({ square, piece: tempGame.get(square) }))
      .filter(({ piece }) => piece && piece.color === playerColor);

    // Remove only friendly pieces in the path
    friendlyPathPieces.forEach(({ square }) => {
      tempGame.remove(square);
    });

    // Attempt the move
    const moveResult = tempGame.move({
      from: from as Square,
      to: to as Square,
      promotion: clientMoveData.promotion,
    });

    // Restore friendly pieces after the move (if the move was successful)
    if (moveResult) {
      friendlyPathPieces.forEach(({ square, piece }) => {
        // Don't restore if the move landed on this square
        if (square !== to) {
          tempGame.put(piece!, square);
        }
      });
    }

    if (!moveResult) {
      console.log("[Void Step Server Debug] Invalid move");
      return {
        moveResult: null,
        nextFen: currentFen,
        error: 'Invalid move',
      };
    }

    // Update void step state
    const updatedVoidStepState: VoidStepState = {
      isActive: false,
      hasUsed: true,
    };

    console.log("[Void Step Server Debug] Move successful, updating state:", updatedVoidStepState);
    return {
      moveResult,
      nextFen: tempGame.fen(),
      updatedVoidStepState,
    };
  } catch (error) {
    console.log("[Void Step Server Debug] Move validation failed:", error);
    return {
      moveResult: null,
      nextFen: currentFen,
      error: 'Move validation failed',
    };
  }
}

// Returns all squares between 'from' and 'to' (exclusive) for sliding pieces
export function getVoidStepPath(
  from: Square,
  to: Square,
  pieceType: string
): Square[] {
  if (!['r', 'b', 'q'].includes(pieceType)) return [];
  const path: Square[] = [];
  const fromRank = parseInt(from[1]);
  const fromFile = from[0].charCodeAt(0);
  const toRank = parseInt(to[1]);
  const toFile = to[0].charCodeAt(0);

  const rankDir = fromRank === toRank ? 0 : fromRank < toRank ? 1 : -1;
  const fileDir = fromFile === toFile ? 0 : fromFile < toFile ? 1 : -1;

  let currentRank = fromRank + rankDir;
  let currentFile = fromFile + fileDir;

  while (currentRank !== toRank || currentFile !== toFile) {
    const square = `${String.fromCharCode(currentFile)}${currentRank}` as Square;
    path.push(square);
    currentRank += rankDir;
    currentFile += fileDir;
    if (currentRank === toRank && currentFile === toFile) break;
  }
  if (path.length && path[path.length - 1] === to) path.pop();
  return path;
}
