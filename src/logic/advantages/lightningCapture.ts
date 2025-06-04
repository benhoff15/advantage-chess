import { Chess, Move, Square } from 'chess.js';
// LightningCaptureState is removed as it's no longer a direct param

// Define the new return type
type HandleLCResult =
  | { outcome: "success_first_move"; fenAfterFirstCapture: string; pieceSquare: string; possibleSecondMoves: Move[]; }
  | { outcome: "failure"; reason: "not_capture" | "no_second_moves"; fenToRevertTo?: string; };

export function handleLightningCaptureClient({
  game,
  originalFen,
  from,
  to,
  color,
}: {
  game: Chess; // This game instance is a copy for local simulation
  originalFen: string;
  from: string;
  to: string;
  color: 'white' | 'black';
}): HandleLCResult { // Updated return type
  console.log('[LC Client Refactored] Args:', { originalFen, from, to, color });

  const currentLoadedFen = game.fen();
  if (currentLoadedFen !== originalFen) {
    console.error(`[LC Client Refactored] CRITICAL FEN MISMATCH: expected ${originalFen} but game has ${currentLoadedFen}. Attempting to load originalFen.`);
    try {
      game.load(originalFen);
      console.log('[LC Client Refactored] Game reloaded with originalFen. New game FEN:', game.fen());
    } catch (e) {
      console.error('[LC Client Refactored] Error loading originalFen after mismatch:', e);
      // This is a critical state. Depending on desired robustness, could throw or return a specific error.
      // For now, proceed with caution, or consider returning a more specific failure.
      // Since originalFen is the source of truth for this operation, if it can't be loaded,
      // it's hard to proceed reliably.
      return { outcome: "failure", reason: "not_capture" }; // Or a new reason like "fen_load_error"
    }
  } else {
    console.log('[LC Client Refactored] Game instance FEN matches originalFen param:', currentLoadedFen);
  }

  // Attempt the first move
  const firstMove = game.move({ from: from as Square, to: to as Square, promotion: 'q' });

  if (!firstMove || !firstMove.captured) {
    console.log('[LC Client Refactored] First move validation FAILED: not a valid capture or move failed.');
    game.load(originalFen); // Revert the game instance
    return { outcome: "failure", reason: "not_capture", fenToRevertTo: originalFen };
  }

  const fenAfterFirstCapture = game.fen();
  console.log('[LC Client Refactored] First move was a capture. FEN after first capture:', fenAfterFirstCapture);

  // Second Move Calculation
  const gameForSecondMoveCalcs = new Chess(fenAfterFirstCapture);

  // Force turn back to the current player
  const parts = gameForSecondMoveCalcs.fen().split(" ");
  parts[1] = color === "white" ? "w" : "b"; // parts[1] is the turn indicator
  try {
    gameForSecondMoveCalcs.load(parts.join(" "));
    console.log('[LC Client Refactored] FEN for second move calcs (turn forced):', gameForSecondMoveCalcs.fen());
  } catch (e) {
    console.error('[LC Client Refactored] Error loading FEN with forced turn:', e);
    game.load(originalFen); // Revert the original game instance passed in
    return { outcome: "failure", reason: "no_second_moves", fenToRevertTo: originalFen }; // Or a more specific error
  }
  

  // Calculate possibleSecondMoves using gameForSecondMoveCalcs
  // 'to' is the destination of the first move, which is the square the piece is now on.
  const allPossibleSecondMoves = gameForSecondMoveCalcs.moves({ square: to as Square, verbose: true }) as Move[];
  console.log(`[LC Client Refactored] Found ${allPossibleSecondMoves.length} raw second moves from square ${to}.`);

  const playerColorShort = color === 'white' ? 'w' : 'b';
  const possibleSecondMoves = allPossibleSecondMoves.filter(m => {
    // Need to check the piece on the target square *within gameForSecondMoveCalcs*
    const pieceOnTargetSquareInSecondCalc = gameForSecondMoveCalcs.get(m.to as Square);
    if (pieceOnTargetSquareInSecondCalc && pieceOnTargetSquareInSecondCalc.type === 'k' && pieceOnTargetSquareInSecondCalc.color !== playerColorShort) {
      console.log(`[LC Client Refactored] Filtering out move ${m.san} (targets enemy king)`);
      return false;
    }
    return true;
  });

  console.log(`[LC Client Refactored] Filtered to ${possibleSecondMoves.length} legal second moves:`, possibleSecondMoves.map(m => m.san));

  if (possibleSecondMoves.length === 0) {
    console.log('[LC Client Refactored] No valid second moves found.');
    game.load(originalFen); // Revert the game instance
    return { outcome: "failure", reason: "no_second_moves", fenToRevertTo: originalFen };
  }

  // Return success with the FEN after the first move and possible second moves
  return {
    outcome: "success_first_move",
    fenAfterFirstCapture,
    pieceSquare: to, // This is the square where the piece landed after the first move
    possibleSecondMoves,
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
