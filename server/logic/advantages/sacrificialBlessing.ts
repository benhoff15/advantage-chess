import { Chess, PieceSymbol, Square, Color } from 'chess.js';
import { PlayerAdvantageStates, SacrificialBlessingPendingState } from '../../../shared/types'; // Adjusted path assuming types.ts is three levels up
import { RoomState } from '../../socketHandlers'; // Assuming RoomState is exported from socketHandlers or a types file it uses

// Helper to get player's color from 'w' or 'b'
const getPlayerColor = (chessColor: Color): 'white' | 'black' => {
  return chessColor === 'w' ? 'white' : 'black';
};

export function canTriggerSacrificialBlessing(
  game: Chess,
  playerColor: Color, // 'w' or 'b'
  capturedPieceType: PieceSymbol,
  roomState: RoomState, // Pass the whole roomState
): boolean {
  const playerAdvantageStateKey = playerColor === 'w' ? 'whiteAdvantage' : 'blackAdvantage';
  const playerAdvantage = roomState[playerAdvantageStateKey];

  const hasUsedAdvantageKey = playerColor === 'w' ? 'whiteHasUsedSacrificialBlessing' : 'blackHasUsedSacrificialBlessing';
  const hasUsedAdvantage = roomState[hasUsedAdvantageKey];

  if (playerAdvantage?.id !== 'sacrificial_blessing' || hasUsedAdvantage) {
    return false;
  }

  if (capturedPieceType !== 'n' && capturedPieceType !== 'b') {
    return false;
  }

  // Check if the player has other knights or bishops
  const board = game.board();
  for (const row of board) {
    for (const piece of row) {
      if (piece && piece.color === playerColor && (piece.type === 'n' || piece.type === 'b')) {
        return true; // Found at least one knight or bishop
      }
    }
  }

  return false; // No other knights or bishops found
}

export function getPlaceableKnightsAndBishops(
  game: Chess,
  playerColor: Color, // 'w' or 'b'
): { type: 'n' | 'b'; square: string }[] {
  const placeablePieces: { type: 'n' | 'b'; square: string }[] = [];
  const board = game.board();
  for (const row of board) {
    for (const piece of row) {
      if (piece && piece.color === playerColor && (piece.type === 'n' || piece.type === 'b')) {
        placeablePieces.push({ type: piece.type as 'n' | 'b', square: piece.square });
      }
    }
  }
  return placeablePieces;
}

export function handleSacrificialBlessingPlacement(
  game: Chess,
  playerColor: Color, // 'w' or 'b'
  pieceSquare: Square, // The square of the piece to be moved
  toSquare: Square,
): { success: boolean; error?: string; newFen?: string } {
  const pieceToMove = game.get(pieceSquare);

  if (!pieceToMove || pieceToMove.color !== playerColor || (pieceToMove.type !== 'n' && pieceToMove.type !== 'b')) {
    return { success: false, error: 'Invalid piece selected or piece not found at ' + pieceSquare };
  }

  if (game.get(toSquare) !== null) {
    return { success: false, error: 'Target square is not empty.' };
  }

  // Perform the move: remove from old square, put on new square
  game.remove(pieceSquare);
  const putResult = game.put({ type: pieceToMove.type, color: playerColor }, toSquare);

  if (!putResult) {
    // Attempt to revert if put failed (e.g., invalid square for piece type, though 'put' is generally flexible)
    game.put({ type: pieceToMove.type, color: playerColor }, pieceSquare); // Put it back
    return { success: false, error: 'Failed to place piece on the board.' };
  }
  
  // Important: The FEN should be generated based on the game state *before* the turn would normally change.
  // Since game.put() doesn't advance turns, game.fen() is correct here.
  return { success: true, newFen: game.fen() };
}
