import { Chess, Move, PieceSymbol, Color } from 'chess.js';

interface ShieldWallParams {
  game: Chess; // Game state *after* the provisional move has been made
  move: Move; // The move object from chess.js
  shieldPlayerColor: Color; // The color of the player WITH the Shield Wall advantage
  shieldPlayerAdvantageActive: boolean; // Is Shield Wall the active advantage for this player?
}

interface ShieldWallResult {
  rejected: boolean;
  reason?: string;
}

export function handleShieldWallServer({
  game,
  move,
  shieldPlayerColor,
  shieldPlayerAdvantageActive,
}: ShieldWallParams): ShieldWallResult {
  if (!shieldPlayerAdvantageActive) {
    return { rejected: false };
  }

  // Check if a pawn was captured
  if (!move.captured || move.captured !== 'p') {
    return { rejected: false };
  }

  // Determine the color of the captured pawn.
  // move.color is the color of the piece that MADE the move.
  // If a piece was captured, it's of the opposite color.
  const capturedPawnColor = move.color === 'w' ? 'b' : 'w';

  // Is the captured pawn of the color that has Shield Wall?
  if (capturedPawnColor !== shieldPlayerColor) {
    return { rejected: false };
  }

  // Check fullmove number (5 moves means 10 plies, but fullmove counter increments after black's move)
  // Example FEN: r_nbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R_NBQKBNR w KQkq - 0 1
  // The last part is the fullmove number. It starts at 1.
  // "first 5 moves" means when fullmove number is 1, 2, 3, 4, 5.
  const fullMoveNumber = parseInt(game.fen().split(" ")[5], 10);
  if (fullMoveNumber > 5) {
    return { rejected: false };
  }

  // All conditions met, the capture is rejected
  return { rejected: true, reason: "Shield Wall active: Pawns cannot be captured in the first 5 moves." };
}