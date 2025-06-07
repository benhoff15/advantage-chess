import { Chess, Piece, Square, PieceSymbol } from "chess.js"; // PieceSymbol is 'p', 'n', etc.
import { PlayerAdvantageStates, CloakState } from "../../../shared/types";

export function assignCloakedPiece(game: Chess, color: 'white' | 'black'): string | null {
  const board = game.board();
  const possiblePieces: { square: Square; piece: Piece }[] = [];
  const playerColorChar = color === 'white' ? 'w' : 'b';

  for (const row of board) {
    for (const squareInfo of row) {
      if (squareInfo && squareInfo.color === playerColorChar && squareInfo.type !== 'k') {
        possiblePieces.push({ square: squareInfo.square, piece: squareInfo });
      }
    }
  }

  if (possiblePieces.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * possiblePieces.length);
  const selected = possiblePieces[randomIndex];
  
  // New format: square + lowercase piece type character (e.g., "b1n")
  const pieceId = `${selected.square}${selected.piece.type.toLowerCase()}`;
  console.log(`[Cloak Server Logic - assignCloakedPiece] Assigned to ${color}. Piece ID: ${pieceId}`);
  return pieceId;
}

export function handleCloakTurn(playerStates: PlayerAdvantageStates): PlayerAdvantageStates {
  if (playerStates.cloak && playerStates.cloak.turnsRemaining > 0) {
    playerStates.cloak.turnsRemaining--;
    console.log(`[Cloak Server Logic - handleCloakTurn] Decremented turns for ${playerStates.cloak.pieceId}. Remaining: ${playerStates.cloak.turnsRemaining}`);
    if (playerStates.cloak.turnsRemaining === 0) {
      console.log(`[Cloak Server Logic - handleCloakTurn] Cloak EXPIRED for ${playerStates.cloak.pieceId}`);
      delete playerStates.cloak;
    }
  }
  return playerStates;
}

export function removeCloakOnCapture(
  playerStates: PlayerAdvantageStates,
  capturedPieceSquare: Square, 
  game: Chess // Game state AFTER capture. History contains the capture move.
): PlayerAdvantageStates {
  console.log(`[Cloak Server Logic - removeCloakOnCapture] Checking capture. Cloaked ID: ${playerStates.cloak?.pieceId}, Captured on square: ${capturedPieceSquare}`);
  if (playerStates.cloak && playerStates.cloak.pieceId) {
    // activeCloakId is e.g., "d2n" (meaning a knight on d2 is currently cloaked)
    // This pieceId is assumed to be updated by socketHandlers if the cloaked piece moves.
    const activeCloakId = playerStates.cloak.pieceId;

    const lastMove = game.history({verbose: true}).slice(-1)[0];
    if (lastMove && lastMove.captured && lastMove.to === capturedPieceSquare) {
      // lastMove.captured is the type of the piece, e.g., 'n'
      // capturedPieceSquare is the square it was on, e.g., "d2"
      const typeOfActualCapturedPiece = lastMove.captured.toLowerCase(); // Ensure lowercase
      const idOfActualCapturedPiece = `${capturedPieceSquare}${typeOfActualCapturedPiece}`;

      if (idOfActualCapturedPiece === activeCloakId) {
        console.log(`[Cloak Server Logic - removeCloakOnCapture] Cloak REMOVED for ${activeCloakId} due to capture.`);
        delete playerStates.cloak;
      }
    }
  }
  return playerStates;
}
