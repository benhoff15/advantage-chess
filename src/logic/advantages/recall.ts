import { Chess, Square, PieceSymbol, Color } from 'chess.js';

interface HandleRecallClientParams {
  game: Chess; // Current game instance, loaded with currentFen
  fenHistory: string[]; // History of FENs, last element is the most recent previous turn's FEN
  pieceSquare: Square; // The square of the piece the player clicked on in the current board
  playerColor: Color; // 'w' or 'b'
}

interface RecallResult {
  outcome: "success" | "failure";
  targetSquare?: Square; // The square the piece was on 3 turns ago
  reason?: string;
}

export const handleRecallClient = ({
  game,
  fenHistory,
  pieceSquare,
  playerColor,
}: HandleRecallClientParams): RecallResult => {
  // 1. Check if fenHistory is long enough (3 full turns = 6 half-moves)
  if (fenHistory.length < 6) {
    return { outcome: "failure", reason: "Not enough game history (less than 3 full turns)." };
  }

  // 2. Identify the piece on pieceSquare in the currentFen
  const currentPiece = game.get(pieceSquare);
  if (!currentPiece) {
    return { outcome: "failure", reason: "No piece found on the selected square." };
  }
  if (currentPiece.color !== playerColor) {
    return { outcome: "failure", reason: "Cannot recall an opponent's piece." };
  }

  // 3. Let the server handle the rest!
  // The client cannot reliably determine the correct recall target if there are multiple identical pieces.
  // So, just return success for UI purposes (the server will do the real validation).
  return { outcome: "success" };
};