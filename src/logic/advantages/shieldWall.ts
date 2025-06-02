import { Chess, Move, PieceSymbol, Color, Square } from 'chess.js';
import { Advantage } from '../../../shared/types'; // Adjust path as necessary

/**
 * Client-side check to see if a proposed move would be an illegal capture
 * against an opponent's Shield Wall.
 * NOTE: This function relies on knowing the opponent's advantage and the current
 * fullmove number.
 */
export interface CanCaptureOpponentPawnParams {
  game: Chess; // Current game state
  from: Square;
  to: Square;
  opponentAdvantage: Advantage | null | undefined;
  currentFullMoveNumber: number; 
}

export function canCaptureOpponentPawn({
  game,
  from,
  to,
  opponentAdvantage,
  currentFullMoveNumber,
}: CanCaptureOpponentPawnParams): { allowed: boolean; reason?: string } {
  if (opponentAdvantage?.id !== 'shield_wall') {
    return { allowed: true }; // Opponent doesn't have shield wall
  }

  if (currentFullMoveNumber > 5) {
    return { allowed: true }; // Shield wall expired
  }

  const pieceOnToSquare = game.get(to);
  if (!pieceOnToSquare) {
    return { allowed: true }; // Not a capture
  }

  // Check if the piece being captured is a pawn of the opponent's color
  // game.turn() is the current player. If it's 'w', opponent is 'b'.
  const opponentColor = game.turn() === 'w' ? 'b' : 'w';

  if (pieceOnToSquare.type === 'p' && pieceOnToSquare.color === opponentColor) {
    // This is an attempt to capture an opponent's pawn while Shield Wall could be active
    return { allowed: false, reason: "Opponent's Shield Wall is active (first 5 moves)." };
  }

  return { allowed: true };
}

/**
 * Placeholder for any logic needed when the opponent successfully makes a move
 * and this client has Shield Wall. Generally, Shield Wall is defensive, so
 * this might not be needed unless there's a visual cue to update.
 */
export function applyShieldWallOpponentMove({ game, move }: { game: Chess; move: Move }): boolean {
  // Typically, no game state change is needed on the client *for its own* Shield Wall
  // when the opponent moves, as the server validates captures.
  // This function is a placeholder if UI updates or other local logic were needed.
  console.log('[ShieldWallClient] Opponent move received, Shield Wall active for this client.', move);
  return true; // No change to game state typically
}

/**
 * Placeholder for client-side logic when this player, who has Shield Wall, makes a move.
 * Shield Wall doesn't typically alter how the player *makes* their own moves,
 * only how their pieces (pawns) can be captured.
 */
export interface HandleShieldWallClientParams {
  game: Chess;
  from: Square;
  to: Square;
}
export function handleShieldWallClient({ game, from, to }: HandleShieldWallClientParams) {
  // No special move data needs to be constructed for Shield Wall.
  // It's a passive defensive advantage.
  console.log('[ShieldWallClient] Handling own move with Shield Wall active.');
  return null; // No special move object to return
}
