import { Chess, Square } from 'chess.js';

/**
 * Randomly assigns a file from 'a' to 'h'.
 * @returns {string} The selected file (e.g., 'a', 'b', ..., 'h').
 */
export function assignGhostFile(): string {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const randomIndex = Math.floor(Math.random() * files.length);
  return files[randomIndex];
}

/**
 * Creates a new board state where all opponent pieces on the specified ghostFile are removed.
 *
 * @param {string} currentFen - The current FEN string of the game.
 * @param {'w' | 'b'} playerColor - The color of the player whose turn it is or who is activating the advantage.
 *                                 Pieces of the *opponent* on the ghostFile will be removed.
 * @param {string} ghostFile - The file (e.g., 'e') from which opponent pieces should be removed.
 * @returns {string | null} The FEN string of the modified board, or null if an error occurs.
 */
export function getValidatedGhostMoveBoard(currentFen: string, playerColor: 'w' | 'b', ghostFile: string): string | null {
  console.log(`[SV ghostFile.ts getValidatedGhostMoveBoard] Input - FEN: ${currentFen}, Player: ${playerColor}, GhostFile: ${ghostFile}`);
  try {
    // The new Chess(currentFen) constructor will throw an error if the FEN is invalid.
    // This error will be caught by the catch block.
    const tempGame = new Chess(currentFen);
    const opponentColor = playerColor === 'w' ? 'b' : 'w';
    
    // Ensure ghostFile is a single character from 'a' to 'h'
    if (!/^[a-h]$/.test(ghostFile)) {
      console.error('Invalid ghostFile provided to getValidatedGhostMoveBoard:', ghostFile);
      return null;
    }

    for (let rank = 1; rank <= 8; rank++) {
      const square = (ghostFile + rank) as Square; // Type assertion
      const piece = tempGame.get(square);
      if (piece && piece.color === opponentColor) {
        console.log(`[SV ghostFile.ts getValidatedGhostMoveBoard] Removing opponent piece ${piece.type} from ${square} on ghost file ${ghostFile}`);
        const removed = tempGame.remove(square);
        if (!removed) {
          // This case should ideally not be reached if tempGame.get(square) returned a piece.
          // Logging it can help debug unexpected behavior with chess.js or the FEN.
          console.warn(`[SV ghostFile.ts getValidatedGhostMoveBoard] Failed to remove piece at ${square} that was expected to be present.`);
        }
      }
    }
    const finalFen = tempGame.fen();
    console.log(`[SV ghostFile.ts getValidatedGhostMoveBoard] Returning modified FEN: ${finalFen}`);
    return finalFen;
  } catch (error) {
    // Catch errors from new Chess(currentFen) if FEN is invalid, or other unexpected errors.
    console.error(`[getValidatedGhostMoveBoard] Error processing FEN or applying ghost logic. Input FEN: "${currentFen}", Ghost File: "${ghostFile}". Error: ${error}`);
    return null;
  }
}
