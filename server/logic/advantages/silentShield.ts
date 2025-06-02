import { Chess, Square, PieceSymbol, Color, Move } from "chess.js";
import { ShieldedPieceInfo } from "../../../shared/types";

export function selectProtectedPiece(
  game: Chess, // The chess.js game instance
  playerColor: 'w' | 'b'
): ShieldedPieceInfo | null {
  const board = game.board(); // Get the board representation
  const possiblePieces: { square: Square; piece: PieceSymbol; color: Color }[] = [];

  const startingRank1 = playerColor === 'w' ? '1' : '8';
  const startingRank2 = playerColor === 'w' ? '2' : '7';

  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const squareInfo = board[r][c];
      if (squareInfo) {
        const { square, type, color } = squareInfo;
        // Check if the piece belongs to the player, is not a king, and is on a starting rank
        if (
          color === playerColor &&
          type !== 'k' && 
          (square[1] === startingRank1 || square[1] === startingRank2)
        ) {
          possiblePieces.push({ square, piece: type, color });
        }
      }
    }
  }

  if (possiblePieces.length === 0) {
    return null; // No eligible pieces to protect
  }

  const randomIndex = Math.floor(Math.random() * possiblePieces.length);
  const selectedPiece = possiblePieces[randomIndex];

  const pieceId = `${selectedPiece.piece}@${selectedPiece.square}`;

  return {
    id: pieceId,
    type: selectedPiece.piece,
    initialSquare: selectedPiece.square,
    currentSquare: selectedPiece.square, // Initially, currentSquare is the initialSquare
    color: playerColor,
  };
}

export function isCaptureOfShieldedPiece(
  move: Move, // The move object from chess.js
  opponentShieldedPiece: ShieldedPieceInfo | null,
  // game: Chess // game instance might not be needed if move object has all info
): boolean {
  if (!opponentShieldedPiece) {
    return false; // No piece is shielded
  }

  if (!move.captured) {
    return false; // Not a capture move
  }

  // Check if the captured piece type and its square match the opponent's shielded piece
  // move.captured stores the type of the captured piece (e.g., 'p', 'q')
  // move.to is the square where the capture happens
  if (
    move.captured === opponentShieldedPiece.type &&
    move.to === opponentShieldedPiece.currentSquare
  ) {
    // Further check: ensure the color of the piece at move.to was indeed the opponent's color.
    // This is implicitly handled because we're checking against opponentShieldedPiece,
    // which has a .color property. And chess.js only allows capturing opponent pieces.
    return true; // Yes, this move attempts to capture the shielded piece
  }

  return false; // Not a capture of the shielded piece
}
