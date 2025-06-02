import { Chess, Move, PieceSymbol, Color } from 'chess.js';

interface ShieldWallParams {
  game: Chess; // Game state *after* the provisional move has been made
  move: Move; // The move object from chess.js (contains color of player who made the move)
  shieldPlayerColor: Color; // The color ('w' or 'b') of the player WITH the Shield Wall advantage
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
    // This check might be redundant if socketHandlers already confirms opponent has Shield Wall.
    // However, it's a good safeguard.
    return { rejected: false };
  }

  // Shield Wall only protects pawns.
  if (!move.captured || move.captured !== 'p') {
    return { rejected: false }; // Not a pawn capture.
  }

  // Determine the color of the captured pawn.
  // move.color is the color of the piece that MADE the move.
  // If a piece was captured, it's of the opposite color.
  const capturedPawnColor = move.color === 'w' ? 'b' : 'w';

  // Check if the captured pawn belongs to the player who has Shield Wall.
  if (capturedPawnColor !== shieldPlayerColor) {
    return { rejected: false }; // Captured pawn is not owned by the Shield Wall player.
  }

  // Determine the effective fullmove number for the check.
  // The FEN's fullmove number increments *after* Black's move.
  // game.fen() is the state *after* the current move has been applied.
  const fenFullMoveNumber = parseInt(game.fen().split(" ")[5], 10);
  let effectiveMoveNumberForCheck = fenFullMoveNumber;

  // If Black (move.color === 'b') made the current move, the fenFullMoveNumber has just
  // incremented. To check Shield Wall for Black's Nth move, we should evaluate
  // the move number as it was *before* Black's move completed, which is fenFullMoveNumber - 1.
  // If White (move.color === 'w') made the current move, the fenFullMoveNumber reflects
  // the move number White is currently completing.
  if (move.color === 'b') {
    effectiveMoveNumberForCheck = fenFullMoveNumber - 1;
  }
  
  // Shield Wall is active for the "first 5 moves".
  // This means it's active if effectiveMoveNumberForCheck is 1, 2, 3, 4, or 5.
  // It expires when effectiveMoveNumberForCheck becomes 6 or more.
  if (effectiveMoveNumberForCheck > 5) {
    return { rejected: false }; // Shield Wall protection has expired.
  }

  // All conditions met: a pawn of the Shield Wall player was captured
  // during the first 5 effective fullmoves. The capture is rejected.
  return { rejected: true, reason: "Shield Wall active: Pawns cannot be captured in the first 5 moves." };
}