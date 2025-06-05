import { Chess, Move, PieceSymbol, Color, Square } from 'chess.js';
import { PlayerAdvantageStates } from '../../../shared/types'; // Adjust path as needed

interface QueenlyCompensationParams {
  game: Chess;
  move: Move;
  playerColor: Color; // The color of the player WITH this advantage
  advantageStates: PlayerAdvantageStates; // The advantage states of the player with this advantage
}

interface QueenlyCompensationResult {
  used: boolean;
  newFen?: string;
  updatedAdvantageStates?: PlayerAdvantageStates;
  error?: string;
}

export function handleQueenlyCompensation({
  game,
  move,
  playerColor,
  advantageStates,
}: QueenlyCompensationParams): QueenlyCompensationResult {
  console.log(`[QueenlyCompensation] Checking for player ${playerColor}. Move: ${move.san}`);
  console.log(`[QueenlyCompensation] Current advantage state: ${JSON.stringify(advantageStates.queenly_compensation)}`);

  if (!advantageStates.queenly_compensation) {
    console.log('[QueenlyCompensation] Advantage state not initialized for player.');
    return { used: false, error: "Advantage state not initialized" };
  }

  if (advantageStates.queenly_compensation.hasUsed) {
    console.log('[QueenlyCompensation] Advantage already used.');
    return { used: false, error: "Advantage already used" };
  }

  // Check if the queen of the player with the advantage was captured
  // `move.captured` is the type of piece captured.
  // `move.color` is the color of the player *making* the move.
  // So, if white makes a move and captures a black piece, move.color is 'w' and captured piece is black.
  const capturedPieceType = move.captured;
  const capturedPieceColor = move.color === 'w' ? 'b' : 'w'; // The color of the piece that was actually captured

  if (capturedPieceType === 'q' && capturedPieceColor === playerColor) {
    console.log(`[QueenlyCompensation] Player ${playerColor}'s queen was captured.`);

    const homeSquare: Square = playerColor === 'w' ? 'd1' : 'd8';
    console.log(`[QueenlyCompensation] Home square for ${playerColor} is ${homeSquare}.`);

    // Check if the King of the playerColor is on the homeSquare
    const pieceOnHomeSquareInitially = game.get(homeSquare); 
    if (pieceOnHomeSquareInitially && pieceOnHomeSquareInitially.type === 'k' && pieceOnHomeSquareInitially.color === playerColor) {
      console.log(`[QueenlyCompensation] Voided: Player ${playerColor}'s King is on the home square ${homeSquare}.`);
      return { used: false, error: "King on home square, ability voided for this instance" };
    }

    // Create a new game instance to modify, to avoid side effects if not used
    const tempGame = new Chess(game.fen());

    // Remove any piece on the home square
    const pieceOnHomeSquare = tempGame.get(homeSquare);
    if (pieceOnHomeSquare) {
      console.log(`[QueenlyCompensation] Removing ${pieceOnHomeSquare.type} from ${homeSquare}.`);
      tempGame.remove(homeSquare);
    }

    // Place a new knight of playerColor on the home square
    const knightPlaced = tempGame.put({ type: 'n', color: playerColor }, homeSquare);
    if (!knightPlaced) {
        console.error(`[QueenlyCompensation] Failed to place knight on ${homeSquare}.`);
        return { used: false, error: "Failed to place knight" };
    }
    console.log(`[QueenlyCompensation] Knight placed on ${homeSquare}.`);

    const newAdvantageStates = {
      ...advantageStates,
      queenly_compensation: {
        ...advantageStates.queenly_compensation,
        hasUsed: true,
      },
    };
    console.log(`[QueenlyCompensation] Advantage used. New state: ${JSON.stringify(newAdvantageStates.queenly_compensation)}`);

    return {
      used: true,
      newFen: tempGame.fen(),
      updatedAdvantageStates: newAdvantageStates,
    };
  }

  console.log('[QueenlyCompensation] Conditions not met (queen not captured or not player\'s queen).');
  return { used: false };
}
