import { Chess, Move } from 'chess.js';
import { Advantage } from '../../../shared/types';

interface AutoDeflectParams {
  game: Chess; // The game state after the sender's move has been applied
  moveResult: Move; // The move that was just made by the sender
  opponentAdvantage?: Advantage; // The advantage of the player who might deflect
}

/**
 * Checks if the opponent's Auto Deflect advantage deflects the current move.
 * The "Auto Deflect" advantage allows a player to automatically "deflect" (nullify)
 * an opponent's knight move if that move results in a check.
 * @param params Parameters including the game state (after sender's move), 
 *               the move made by sender, and the opponent's advantage.
 * @returns True if the move is deflected, false otherwise.
 */
export function handleAutoDeflect({
  game, // game instance is already updated with the sender's move
  moveResult,
  opponentAdvantage,
}: AutoDeflectParams): boolean {
  if (opponentAdvantage?.id === "auto_deflect") {
    // The moveResult is from the perspective of the sender.
    // game.inCheck() now refers to whether the *opponent* (receiver of the move, owner of the advantage)
    // is in check *after* the sender's move.
    // The logic for Auto Deflect is: if the sender's move was a knight move AND
    // that move put the advantage owner (opponent) in check, then deflect.
    if (moveResult.piece === 'n' && game.inCheck()) {
      // Note: game.inCheck() checks if the *current turn player* is in check.
      // After sender's move, turn flips to opponent. So game.inCheck() checks if opponent is in check.
      return true; // Move is deflected
    }
  }
  return false; // Move is not deflected
}