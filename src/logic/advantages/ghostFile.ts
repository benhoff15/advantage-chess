import { Chess, Square, Move, Piece } from 'chess.js';

// Define a local CSSProperties type for styling objects
type CSSProperties = Record<string, string | number>;

/**
 * Calculates legal moves for a piece on a board where opponent's pieces on a specific file are considered "ghosted" (removed).
 * @param {string} currentFen - The current FEN string of the game.
 * @param {string} ghostFile - The file (e.g., 'e') where opponent's pieces are considered removed.
 * @param {Square} pieceSquare - The square of the piece for which to calculate legal moves.
 * @param {'w' | 'b'} playerColor - The color of the player making the move.
 * @returns {Move[]} An array of legal moves for the piece on the modified board. Returns empty if an error occurs.
 */
export function getGhostHighlightLegalMoves(
  currentFen: string,
  ghostFile: string,
  pieceSquare: Square,
  playerColor: 'w' | 'b'
): Move[] {
  console.log(`[CL ghostFile.ts getGhostHighlightLegalMoves] Input - FEN: ${currentFen}, GhostFile: ${ghostFile}, Piece: ${pieceSquare}, Player: ${playerColor}`);
  try {
    // The new Chess(currentFen) constructor will throw an error if the FEN is invalid.
    const tempGame = new Chess(currentFen);
    const opponentColor = playerColor === 'w' ? 'b' : 'w';
    
    if (!/^[a-h]$/.test(ghostFile)) {
      console.error("Invalid ghostFile provided to getGhostHighlightLegalMoves:", ghostFile);
      return [];
    }
    const fileChar = ghostFile.charAt(0);

    for (let rank = 1; rank <= 8; rank++) {
      const square = (fileChar + rank) as Square;
      const piece = tempGame.get(square);
      if (piece && piece.color === opponentColor) {
        console.log(`[CL ghostFile.ts getGhostHighlightLegalMoves] Removing opponent piece ${piece.type} from ${square} on ghost file ${ghostFile}`);
        tempGame.remove(square);
      }
    }
    const moves = tempGame.moves({ square: pieceSquare, verbose: true });
    console.log(`[CL ghostFile.ts getGhostHighlightLegalMoves] Returning ${moves.length} moves.`);
    return moves;
  } catch (e) {
    console.error(`[CL ghostFile.ts getGhostHighlightLegalMoves] Error processing FEN or applying ghost logic. FEN: "${currentFen}", PieceSquare: "${pieceSquare}". Error: ${e}`);
    return [];
  }
}

/**
 * Generates CSS styles for highlighting ghost files on the chessboard.
 * @param {string | null} myGhostFile - The ghost file of the current player (e.g., 'e').
 * @param {string | null} opponentGhostFile - The ghost file of the opponent.
 * @param {'w' | 'b'} myColor - The color of the current player.
 * @param {string} currentFen - The current FEN string of the game (used to identify piece colors).
 * @returns {Record<string, CSSProperties>} A record mapping square names to CSS style objects.
 */
export function getGhostFileSquareStyles(
  myGhostFile: string | null,
  opponentGhostFile: string | null,
  myColor: 'w' | 'b',
  currentFen: string
): Record<string, CSSProperties> {
  console.log(`[CL ghostFile.ts getGhostFileSquareStyles] Applying styles for MyGhost: ${myGhostFile}, OpponentGhost: ${opponentGhostFile}, Player: ${myColor}, FEN: ${currentFen}`);
  const styles: Record<string, CSSProperties> = {};
  // Added !currentFen to the condition as per prompt
  if (!myGhostFile && !opponentGhostFile && !currentFen) {
    return styles;
  }

  try {
    // The new Chess(currentFen) constructor will throw an error if the FEN is invalid.
    const game = new Chess(currentFen);

    // Style for my ghost file
    if (myGhostFile) {
       if (!/^[a-h]$/.test(myGhostFile)) {
        console.error("Invalid myGhostFile provided to getGhostFileSquareStyles:", myGhostFile);
      } else {
        const fileChar = myGhostFile.charAt(0);
        for (let rank = 1; rank <= 8; rank++) {
          const square = (fileChar + rank) as Square;
          styles[square] = { ...styles[square], background: 'rgba(100, 200, 255, 0.3)' }; // My ghost file highlight

          const pieceOnSquare = game.get(square);
          if (pieceOnSquare && pieceOnSquare.color !== myColor) {
            // It's an opponent's piece on my ghost file
            styles[square] = { ...styles[square], opacity: 0.5 }; // Fade opponent's pieces
          }
        }
      }
    }

    // Style for opponent's ghost file (if different from mine)
    if (opponentGhostFile && opponentGhostFile !== myGhostFile) {
      if (!/^[a-h]$/.test(opponentGhostFile)) {
        console.error("Invalid opponentGhostFile provided to getGhostFileSquareStyles:", opponentGhostFile);
      } else {
        const fileChar = opponentGhostFile.charAt(0);
        for (let rank = 1; rank <= 8; rank++) {
          const square = (fileChar + rank) as Square;
          // Apply a distinct background for the opponent's ghost file.
          // If styles[square] already exists (e.g. from myGhostFile if they were the same, though condition prevents this for primary highlight),
          // this will merge. Since `opponentGhostFile !== myGhostFile`, this primarily adds a new highlight.
          // If there was an opacity set by myGhostFile styling (e.g. if opponent's file happened to be where my piece is),
          // that opacity would remain unless explicitly overwritten here.
          styles[square] = { 
            ...(styles[square] || {}), // Preserve existing styles (like opacity if any)
            background: (styles[square]?.background && styles[square]?.background !== 'rgba(100, 200, 255, 0.3)') 
                        ? `${styles[square]?.background}, rgba(255, 100, 100, 0.15)` // Append if a different background already exists
                        : 'rgba(255, 100, 100, 0.2)' // Set if no background or if it's myGhostFile's background (though !== condition prevents this)
          };
          // Simplified approach for opponent file: just set a distinct background, ensuring not to overwrite critical 'myGhostFile' styles like opacity.
          // The example logic with '...styles[square]' and then new background mostly achieves this.
          // A very simple distinct highlight:
          // styles[square] = { ...(styles[square] || {}), background: 'rgba(255, 150, 150, 0.2)' };
          // The provided example tries to be a bit smarter with merging, which is fine.
          // Let's stick to the example's spirit for merging:
          styles[square] = { 
            ...styles[square], // Keep existing styles (like opacity from myGhostFile processing if applicable)
            background: 'rgba(255, 150, 150, 0.2)' // Opponent's ghost file distinct highlight
          };
        }
      }
    }
  } catch (e) {
    console.error("Error in getGhostFileSquareStyles:", e);
    // Return whatever styles were accumulated if error occurs mid-way, or empty if error was at FEN validation.
    console.error(`[getGhostFileSquareStyles] Error processing FEN or applying styles. FEN: "${currentFen}". Error: ${e}`);
    // Return whatever styles were accumulated if error occurs mid-way, or empty if error was at FEN validation.
  }
  return styles;
}
