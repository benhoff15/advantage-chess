import { Chess, Square, Piece } from 'chess.js';
import { PlayerAdvantageStates } from '../../../shared/types'; // Adjust path as needed

interface QuantumLeapParams {
  game: Chess;
  playerColor: 'w' | 'b';
  from: Square;
  to: Square;
  playerAdvantageStates: PlayerAdvantageStates;
}

interface QuantumLeapResult {
  success: boolean;
  newFen?: string;
  error?: string;
}

export function handleQuantumLeap({
  game,
  playerColor,
  from,
  to,
  playerAdvantageStates,
}: QuantumLeapParams): QuantumLeapResult {
  console.log(`[handleQuantumLeap] Attempting quantum leap for ${playerColor} from ${from} to ${to}`);

  // 1. Check if it's the player's turn (already handled by socketHandlers, but good for robustness)
  if (game.turn() !== playerColor) {
    console.error('[handleQuantumLeap] Error: Not players turn.');
    return { success: false, error: "Not your turn." };
  }

  // 2. Check if Quantum Leap has already been used
  if (playerAdvantageStates.quantumLeapUsed) {
    console.error('[handleQuantumLeap] Error: Quantum Leap already used.');
    return { success: false, error: "Quantum Leap has already been used." };
  }

  const pieceFrom = game.get(from);
  const pieceTo = game.get(to);

  // 3. Check if both selected squares contain pieces
  if (!pieceFrom || !pieceTo) {
    console.error('[handleQuantumLeap] Error: One or both selected squares are empty.');
    return { success: false, error: "One or both selected squares are empty." };
  }

  // 4. Check if both pieces belong to the player
  if (pieceFrom.color !== playerColor || pieceTo.color !== playerColor) {
    console.error('[handleQuantumLeap] Error: One or both pieces do not belong to the player.');
    return { success: false, error: "You can only swap your own pieces." };
  }

  // Perform the swap
  // Remember the original pieces to place them correctly
  const originalPieceFrom = { type: pieceFrom.type, color: pieceFrom.color };
  const originalPieceTo = { type: pieceTo.type, color: pieceTo.color };

  game.remove(from);
  game.remove(to);
  game.put(originalPieceTo, from); // Put pieceTo on fromSquare
  game.put(originalPieceFrom, to);   // Put pieceFrom on toSquare
  
  const newFen = game.fen();
  console.log(`[handleQuantumLeap] Swap successful. New FEN: ${newFen}`);

  return { success: true, newFen };
}
