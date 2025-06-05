import { Chess, Square } from 'chess.js';

/**
 * Applies the Arcane Reinforcement advantage, spawning a bishop for the player
 * on a random empty square in their half of the board.
 *
 * @param game The current Chess game instance.
 * @param color The color of the player using the advantage ('w' | 'b').
 * @returns An object containing the square where the bishop was spawned, or null if no square was available.
 */
export function applyArcaneReinforcement(
  game: Chess,
  color: 'w' | 'b'
): { spawnedSquare: Square | null } {
  console.log(`[AR apply] Attempting for color: ${color}. Current FEN: ${game.fen()}`);
  const validRanks: string[] = color === 'w' ? ['1', '2', '3', '4'] : ['5', '6', '7', '8'];
  const emptySquares: Square[] = [];
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  console.log(`[AR apply] Valid ranks for ${color}: ${JSON.stringify(validRanks)}`);

  for (const rank of validRanks) {
    for (const file of files) {
      const square = (file + rank) as Square;
      const pieceOnSquare = game.get(square);
      // Custom stringify for pieceOnSquare to avoid overly verbose JSON for a simple object or null
      const pieceString = pieceOnSquare 
        ? `{ type: '${pieceOnSquare.type}', color: '${pieceOnSquare.color}' }` 
        : 'null';
      console.log(`[AR apply] Checking square: ${square}, piece: ${pieceString}`);
      
      if (!pieceOnSquare) { // Treat null or undefined as empty
        console.log(`[AR apply] --> Square ${square} is EMPTY (condition: !pieceOnSquare).`);
        emptySquares.push(square);
      } else {
        console.log(`[AR apply] --> Square ${square} is OCCUPIED (condition: !pieceOnSquare).`);
      }
    }
  }

  console.log(`[AR apply] Found empty squares for ${color}: ${JSON.stringify(emptySquares)} (based on !pieceOnSquare)`);

  if (emptySquares.length > 0) {
    const randomIndex = Math.floor(Math.random() * emptySquares.length);
    const selectedSquare = emptySquares[randomIndex];
    console.log(`[AR apply] Selected square for ${color}: ${selectedSquare}`);

    // Perform the placement
    const success = game.put({ type: 'b', color }, selectedSquare);

    if (success) {
      console.log(`[AR apply] Placed bishop for ${color} at ${selectedSquare}. New FEN after put: ${game.fen()}`);
      return { spawnedSquare: selectedSquare };
    } else {
      // This case should ideally not happen if the square was genuinely empty and chess.js is working.
      console.error(`[AR apply] FAILED to place bishop for ${color} at ${selectedSquare} despite it being in emptySquares. Current FEN: ${game.fen()}`);
      return { spawnedSquare: null };
    }
  } else {
    console.log(`[AR apply] No empty squares for ${color}, skipping.`);
    return { spawnedSquare: null };
  }
}
