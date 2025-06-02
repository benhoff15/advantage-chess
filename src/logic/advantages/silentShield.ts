import { ShieldedPieceInfo } from "../../../shared/types";
import { Chess, Square, Piece } from "chess.js"; // Piece might be useful for game.get() return type

export function isAttemptToCaptureShieldedPieceClient(
  targetSquare: string, // The square the player is trying to move to
  opponentShieldedPiece: ShieldedPieceInfo | null,
  game: Chess // The local chess.js game instance
): boolean {
  if (!opponentShieldedPiece) {
    return false; // Opponent has no shielded piece
  }

  // Check if the target square is where the opponent's shielded piece is currently located
  if (targetSquare === opponentShieldedPiece.currentSquare) {
    // Verify that the piece on that square actually matches the shielded piece details
    // (type and color) to confirm it's an attempt to capture *that* specific piece.
    const pieceOnTargetSquare = game.get(targetSquare as Square);

    if (
      pieceOnTargetSquare &&
      pieceOnTargetSquare.type === opponentShieldedPiece.type &&
      pieceOnTargetSquare.color === opponentShieldedPiece.color
    ) {
      return true; // Yes, this is an attempt to move onto/capture the shielded piece
    }
  }

  return false; // Not an attempt to capture the shielded piece
}