import { Chess, Square, PieceSymbol, Move } from 'chess.js';
import { PlayerAdvantageStates } from '../../../shared/types'; // Adjust path as needed

/**
 * Checks if a move is valid for a queen.
 * This function does not consider the current player's turn or if the piece is actually a queen.
 * It only validates the geometry of the move as if a queen were on the 'from' square.
 *
 * @param game The current game instance (used for board state context, like obstructions).
 * @param from The starting square of the move.
 * @param to The ending square of the move.
 * @param promotion Optional promotion piece type (relevant if the move reaches promotion rank).
 * @returns True if a queen could make this move, false otherwise.
 */
export function isSecretWeaponMoveValid(
  game: Chess,
  from: Square,
  to: Square,
  promotion?: PieceSymbol
): boolean {
  // Create a temporary game instance to check queen moves without affecting the main game state.
  // Put a temporary queen of the current player's color on the 'from' square.
  const tempGame = new Chess(game.fen());
  const pieceOnFrom = tempGame.get(from);

  if (!pieceOnFrom) {
    // Should not happen if called correctly, but handle defensively.
    console.error(`[isSecretWeaponMoveValid] No piece on 'from' square: ${from}`);
    return false;
  }

  // Temporarily remove the piece at 'from' and place a queen of the same color.
  tempGame.remove(from);
  tempGame.put({ type: 'q', color: pieceOnFrom.color }, from);

  // Get all legal moves for the temporary queen from the 'from' square.
  const queenMoves = tempGame.moves({ square: from, verbose: true }) as Move[];

  // Check if the desired 'to' square is among the legal queen moves.
  // Also, if a promotion is specified, ensure the move is a promotion.
  for (const move of queenMoves) {
    if (move.to === to) {
      // If promotion is relevant (e.g., pawn reaching last rank, though this is a queen move)
      if (promotion) {
        // A queen move itself doesn't "promote" in the typical pawn sense.
        // However, if the original piece was a pawn and it's moving to the promotion rank,
        // the 'promotion' parameter will be set. We need to ensure this specific
        // geometric move (from-to) is valid for a queen. The actual promotion
        // handling (changing piece type) will occur in the main sendMove handler.
        return true; // The geometric move is valid for a queen.
      }
      return true; // Move is valid for a queen.
    }
  }

  console.log(`[isSecretWeaponMoveValid] Move from ${from} to ${to} (promotion: ${promotion}) is NOT a valid queen move.`);
  return false;
}

/**
 * Server-side validation handler for a piece potentially being a Secret Weapon.
 * This is intended to be called from socketHandlers.ts.
 *
 * @param game The main Chess game instance from the room.
 * @param clientMoveData The move data received from the client.
 * @param playerAdvantageStates The advantage states for the player making the move.
 * @param pieceId The unique ID of the piece being moved.
 * @returns A chess.js Move object if the move is valid and processed, or null otherwise.
 */
export function handleSecretWeaponMoveServer(
  game: Chess,
  currentFen: string,
  clientMoveData: { from: string; to: string; promotion?: string },
  playerAdvantageStates: PlayerAdvantageStates,
  pieceId: string
): Move | null {
  if (playerAdvantageStates.secretWeaponPieceId !== pieceId) {
    console.error('[handleSecretWeaponMoveServer] Called for a piece that is not the Secret Weapon.');
    return null;
  }

  const { from, to, promotion } = clientMoveData;
  console.log(`[handleSecretWeaponMoveServer] Validating Secret Weapon move for piece ${pieceId} from ${from} to ${to}`);

  if (isSecretWeaponMoveValid(new Chess(currentFen), from as Square, to as Square, promotion as PieceSymbol | undefined)) {
    // The move is geometrically valid for a queen.
    try {
      // --- PATCH: Temporarily replace pawn with queen for this move ---
      const pieceOnFrom = game.get(from as Square);
      if (!pieceOnFrom) {
        console.error(`[handleSecretWeaponMoveServer] No piece on 'from' square: ${from}`);
        return null;
      }
      // Remove the pawn and put a queen of the same color
      game.remove(from as Square);
      game.put({ type: 'q', color: pieceOnFrom.color }, from as Square);

      // Now attempt the move as a queen
      const moveResult = game.move({
        from: from as Square,
        to: to as Square,
        promotion: promotion as PieceSymbol | undefined,
      });

      if (moveResult) {
        console.log(`[handleSecretWeaponMoveServer] Secret Weapon move successful for ${pieceId}: ${from}->${to}. New FEN: ${game.fen()}`);
        // If the move was not a promotion, and the piece is still a pawn, revert the queen back to a pawn
        if (!moveResult.promotion) {
          // Remove the queen from the destination and put a pawn of the same color
          game.remove(to as Square);
          game.put({ type: 'p', color: pieceOnFrom.color }, to as Square);
        }
        (moveResult as any).afterFen = game.fen();
        return moveResult;
      } else {
        // Move failed, revert to original FEN
        console.warn(`[handleSecretWeaponMoveServer] Secret Weapon move for ${pieceId} from ${from} to ${to} was geometrically valid but rejected by game.move().`);
        game.load(currentFen);
        return null;
      }
    } catch (e) {
      console.error(`[handleSecretWeaponMoveServer] Error during game.move() for Secret Weapon ${pieceId}:`, e);
      game.load(currentFen);
      return null;
    }
  } else {
    console.log(`[handleSecretWeaponMoveServer] Invalid Secret Weapon move for ${pieceId}: ${from}->${to}`);
    return null;
  }
}
