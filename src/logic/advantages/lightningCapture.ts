import { Chess, Move, Square } from 'chess.js';
import { LightningCaptureState } from '../../../shared/types';

export async function handleLightningCaptureClient({
  game,
  originalFen,
  from,
  to,
  color,
  lightningCaptureState,
  promptSecondMove,
  setFen,
}: {
  game: Chess;
  originalFen: string;
  from: string;
  to: string;
  color: 'white' | 'black';
  lightningCaptureState: LightningCaptureState;
  promptSecondMove: (
    gameAfterFirstMove: Chess,
    firstMoveFrom: string,
    firstMoveTo: string,
    possibleSecondMoves: Array<Move>
  ) => Promise<string | null>;
  setFen: (fen: string) => void;
}): Promise<{
  moveData: {
    from: string;
    to: string;
    secondTo: string;
    special: string;
    color: string;
  } | null;
  attempted: boolean;
}> {
  if (lightningCaptureState.used) {
    return { moveData: null, attempted: false };
  }

  game.load(originalFen);

  // First Move Validation & Execution
  const pieceOnTargetSquare = game.get(to as Square); // Cast to Square
  if (!pieceOnTargetSquare || pieceOnTargetSquare.color === game.turn()) {
    // Not a capture or capturing own piece
    return { moveData: null, attempted: true };
  }

  const firstMove = game.move({ from: from as Square, to: to as Square, promotion: 'q' }); // Cast from and to
  if (!firstMove) {
    return { moveData: null, attempted: true };
  }
  setFen(game.fen());

  // Second Move Validation & Execution
  const turnColor = game.turn(); // Should be the same as the player's color
  const possibleSecondMoves = (game.moves({ square: to as Square, verbose: true }) as Move[]).filter(m => { // Cast to
    const pieceOnTargetSq = game.get(m.to as Square); // Cast m.to
    return !(pieceOnTargetSq && pieceOnTargetSq.type === 'k' && pieceOnTargetSq.color !== turnColor);
  });

  if (possibleSecondMoves.length === 0) {
    game.load(originalFen);
    setFen(originalFen);
    return { moveData: null, attempted: true };
  }

  const secondTo = await promptSecondMove(new Chess(game.fen()), from, to, possibleSecondMoves);

  if (!secondTo) {
    game.load(originalFen);
    setFen(originalFen);
    return { moveData: null, attempted: true };
  }
  
  // Need to re-load the FEN after prompt, as game state might be explored by UI
  game.load(firstMove.after); // Load the state *after* the first move

  const pieceOnSecondTarget = game.get(secondTo as Square); // Cast secondTo
  if (pieceOnSecondTarget && pieceOnSecondTarget.type === 'k' && pieceOnSecondTarget.color !== turnColor) {
    game.load(originalFen);
    setFen(originalFen);
    return { moveData: null, attempted: true };
  }

  const secondMove = game.move({ from: to as Square, to: secondTo as Square, promotion: 'q' }); // Cast to and secondTo
  if (!secondMove) {
    game.load(originalFen);
    setFen(originalFen);
    return { moveData: null, attempted: true };
  }

  setFen(game.fen());
  return {
    moveData: { from, to, secondTo, special: 'lightning_capture', color },
    attempted: true,
  };
}

export interface ApplyLightningCaptureOpponentMoveParams {
  game: Chess;
  receivedMove: {
    from: string;
    to: string;
    secondTo: string;
    color: 'white' | 'black';
  };
}

export const applyLightningCaptureOpponentMove = ({
  game,
  receivedMove,
}: ApplyLightningCaptureOpponentMoveParams): boolean => {
  // Perform the first capture
  const firstMoveGame = game.move({ from: receivedMove.from as Square, to: receivedMove.to as Square, promotion: 'q' }); // Cast
  if (!firstMoveGame) {
    console.error('Failed to apply first move of lightning capture for opponent:', receivedMove);
    // Potentially revert, but server is source of truth.
    // For now, just log and return false.
    return false;
  }

  // Perform the second move
  const secondMoveGame = game.move({ from: receivedMove.to as Square, to: receivedMove.secondTo as Square, promotion: 'q' }); // Cast
  if (!secondMoveGame) {
    console.error('Failed to apply second move of lightning capture for opponent:', receivedMove);
    // Potentially revert the first move if desired, e.g., by loading a FEN from before the first move.
    // However, the server is the source of truth, so complex rollback logic here might be redundant
    // if the server ensures valid sequences. For now, log and return false.
    // Consider a more robust error handling or state synchronization mechanism if needed.
    return false;
  }

  return true;
};
