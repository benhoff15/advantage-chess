import { Chess, Square, Color } from 'chess.js';
import { RecallState } from '../../../shared/types';
import { PieceTrackingInfo } from '../../socketHandlers';

interface ValidateRecallServerParams {
  game: Chess;
  pieceTracking: Record<string, PieceTrackingInfo>;
  pieceTrackingHistory: Record<string, PieceTrackingInfo>[];
  pieceSquare: Square;
  playerColor: Color;
  recallState: RecallState;
}

interface RecallServerResult {
  isValid: boolean;
  nextFen?: string;
  error?: string;
}

export const validateRecallServerWithUID = ({
  game,
  pieceTracking,
  pieceTrackingHistory,
  pieceSquare,
  playerColor,
  recallState,
}: ValidateRecallServerParams): RecallServerResult => {
  if (recallState.used) {
    return { isValid: false, error: "Recall advantage has already been used." };
  }
  if (!pieceTracking || !pieceTrackingHistory || pieceTrackingHistory.length < 6) {
    return { isValid: false, error: "Not enough game history (less than 3 full turns)." };
  }

  // 1. Find UID of the selected piece in current pieceTracking
  let selectedUid: string | undefined;
  for (const [uid, info] of Object.entries(pieceTracking)) {
    if (
      info.square === pieceSquare &&
      info.color === playerColor &&
      info.alive
    ) {
      selectedUid = uid;
      break;
    }
  }
  if (!selectedUid) {
    return { isValid: false, error: "Could not identify the selected piece in tracking state." };
  }

  // 2. Find the same UID in the snapshot from 3 turns ago
  const snapshot = pieceTrackingHistory[pieceTrackingHistory.length - 6];
  if (!snapshot || !snapshot[selectedUid]) {
    return { isValid: false, error: "Piece did not exist 3 turns ago." };
  }
  const oldInfo = snapshot[selectedUid];
  if (!oldInfo.alive || !oldInfo.square) {
    return { isValid: false, error: "Piece was not alive 3 turns ago." };
  }

  // 3. Check if the target square is currently empty
  const targetSquareOccupant = game.get(oldInfo.square);
  if (targetSquareOccupant) {
    return { isValid: false, error: `Target square (${oldInfo.square}) is currently occupied by a ${targetSquareOccupant.type}.` };
  }

  // 4. Perform the recall: remove from current, place at old square
  const newGame = new Chess(game.fen());
  const pieceBeingMoved = newGame.remove(pieceSquare);
  if (!pieceBeingMoved) {
    return { isValid: false, error: "Internal error: Could not remove piece for recall." };
  }
  const placed = newGame.put({ type: pieceBeingMoved.type, color: pieceBeingMoved.color }, oldInfo.square);
  if (!placed) {
    newGame.put({ type: pieceBeingMoved.type, color: pieceBeingMoved.color }, pieceSquare);
    return { isValid: false, error: "Internal error: Could not place piece for recall." };
  }

  return { isValid: true, nextFen: newGame.fen() };
};
