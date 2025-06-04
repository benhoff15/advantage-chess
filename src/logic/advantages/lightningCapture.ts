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
  console.log('[LC Client] Args:', { originalFen, from, to, color, used: lightningCaptureState.used });

  const currentLoadedFen = game.fen();
  if (currentLoadedFen !== originalFen) {
    console.error(`[LC Client] CRITICAL FEN MISMATCH: expected ${originalFen} but game has ${currentLoadedFen}`);
    game.load(originalFen);
    console.log('[LC Client] Game reloaded with originalFen. New game FEN:', game.fen());
  } else {
    console.log('[LC Client] Game instance FEN matches originalFen param:', currentLoadedFen);
  }

  if (lightningCaptureState.used) {
    console.log('[LC Client] Already used.');
    return { moveData: null, attempted: false };
  }

  const pieceOnTargetSquare = game.get(to as Square);
  const currentTurn = game.turn();
  console.log('[LC Client] First Move Validation Details:');
  console.log('[LC Client] Target square:', to);
  console.log('[LC Client] Piece on target square:', pieceOnTargetSquare);
  console.log('[LC Client] Current game turn:', currentTurn);

  if (!pieceOnTargetSquare || pieceOnTargetSquare.color === currentTurn) {
    console.log('[LC Client] First move validation FAILED: not a valid capture.');
    return { moveData: null, attempted: true };
  }

  const firstMove = game.move({ from: from as Square, to: to as Square, promotion: 'q' });
  if (!firstMove) {
    console.log('[LC Client] game.move for first move FAILED.');
    return { moveData: null, attempted: true };
  }

  console.log('[LC Client] First move applied. FEN:', game.fen());
  setFen(game.fen());

  const movedPiece = game.get(to as Square);
  const movedPieceType = movedPiece?.type;
  console.log(`[LC Client] Piece type after first move (on ${to}): ${movedPieceType}`);
  

  // Force turn back to original player
  const parts = firstMove.after.split(" ");
  parts[1] = color === "white" ? "w" : "b";
  const fenWithSameTurn = parts.join(" ");
  game.load(fenWithSameTurn);
  console.log('[LC Client] Reloaded FEN with same player turn:', game.fen());

  // Generate legal second moves now
  const allPossibleSecondMoves = game.moves({ square: to as Square, verbose: true }) as Move[];
  console.log(`[LC Client] Found ${allPossibleSecondMoves.length} raw second moves from square ${to}.`);

  const playerColorShort = color === 'white' ? 'w' : 'b';
  const possibleSecondMoves = allPossibleSecondMoves.filter(m => {
    const pieceOnTarget = game.get(m.to as Square);
    if (pieceOnTarget && pieceOnTarget.type === 'k' && pieceOnTarget.color !== playerColorShort) {
      console.log(`[LC Client] Filtering out move ${m.san} (targets enemy king)`);
      return false;
    }
    return true;
  });

  console.log(`[LC Client] Filtered to ${possibleSecondMoves.length} legal second moves:`, possibleSecondMoves.map(m => m.san));

  if (possibleSecondMoves.length === 0) {
    game.load(originalFen);
    setFen(originalFen);
    console.log('[LC Client] No valid second moves. Reverting to original FEN.');
    return { moveData: null, attempted: true };
  }

  const secondTo = await promptSecondMove(game, from, to, possibleSecondMoves);
  console.log('[LC Client] promptSecondMove returned:', secondTo);

  if (!secondTo) {
    game.load(originalFen);
    setFen(originalFen);
    console.log('[LC Client] User cancelled second move. Reverting.');
    return { moveData: null, attempted: true };
  }

  const pieceOnSecondTarget = game.get(secondTo as Square);
  if (pieceOnSecondTarget && pieceOnSecondTarget.type === 'k' && pieceOnSecondTarget.color !== playerColorShort) {
    console.log('[LC Client] Second move validation FAILED: cannot capture opponent king.');
    game.load(originalFen);
    setFen(originalFen);
    return { moveData: null, attempted: true };
  }

  const pieceBeforeSecondMove = game.get(to as Square);
  const typeBeforeSecondMove = pieceBeforeSecondMove?.type;
  console.log(`[LC Client] Piece type before second move (on ${to}): ${typeBeforeSecondMove}`);

  // Check if piece type changed unexpectedly
  if (typeBeforeSecondMove !== movedPieceType) {
    console.warn(`[LC Client] ABORTING: Piece type mismatch before second move. Expected '${movedPieceType}', but got '${typeBeforeSecondMove}'`);
    game.load(originalFen);
    setFen(originalFen);
    return { moveData: null, attempted: true };
  }

  const secondMove = game.move({ from: to as Square, to: secondTo as Square, promotion: 'q' });
  if (!secondMove) {
    console.log('[LC Client] Second move execution failed. Reverting.');
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
  const first = game.move({ from: receivedMove.from as Square, to: receivedMove.to as Square, promotion: 'q' });
  if (!first) {
    console.error('Failed to apply first part of Lightning Capture:', receivedMove);
    return false;
  }

  const second = game.move({ from: receivedMove.to as Square, to: receivedMove.secondTo as Square, promotion: 'q' });
  if (!second) {
    console.error('Failed to apply second part of Lightning Capture:', receivedMove);
    return false;
  }

  return true;
};
