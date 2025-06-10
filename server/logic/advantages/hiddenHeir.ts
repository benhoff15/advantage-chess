import { PlayerAdvantageStates } from '../../../shared/types';
import { PieceTrackingInfo } from '../../socketHandlers'; // Assuming PieceTrackingInfo is exported from socketHandlers

export function setHiddenHeirServer(
  playerAdvantageStates: PlayerAdvantageStates,
  square: string,
  pieceId: string,
): PlayerAdvantageStates {
  console.log(`[HiddenHeir Server] Setting Hidden Heir: Piece ID ${pieceId} on square ${square}`);
  playerAdvantageStates.hiddenHeir = { square, pieceId };
  playerAdvantageStates.hiddenHeirCaptured = false;
  console.log('[HiddenHeir Server] PlayerAdvantageStates updated:', playerAdvantageStates);
  return playerAdvantageStates;
}

export function isHeirAlive(
  playerAdvantageStates: PlayerAdvantageStates,
  pieceTracking: Record<string, PieceTrackingInfo> | undefined,
): boolean {
  if (!playerAdvantageStates.hiddenHeir?.pieceId || !pieceTracking) {
    console.log('[HiddenHeir Server isHeirAlive] No heir set or no piece tracking available.');
    return false; // No heir set or no tracking info
  }
  if (playerAdvantageStates.hiddenHeirCaptured) {
    console.log('[HiddenHeir Server isHeirAlive] Heir is marked as captured.');
    return false; // Heir already marked as captured
  }

  const heirPieceId = playerAdvantageStates.hiddenHeir.pieceId;
  const heirInfo = pieceTracking[heirPieceId];

  if (heirInfo && heirInfo.alive) {
    console.log(`[HiddenHeir Server isHeirAlive] Heir ${heirPieceId} is alive on square ${heirInfo.square}.`);
    return true;
  }
  console.log(`[HiddenHeir Server isHeirAlive] Heir ${heirPieceId} is NOT alive or not found in pieceTracking.`);
  return false;
}

export function handleHeirCaptured(
  playerAdvantageStates: PlayerAdvantageStates,
  capturedPieceId: string, // This should be the UID of the piece from pieceTracking
  pieceTracking: Record<string, PieceTrackingInfo> | undefined,
): PlayerAdvantageStates {
  if (playerAdvantageStates.hiddenHeir?.pieceId && capturedPieceId === playerAdvantageStates.hiddenHeir.pieceId) {
    if (!playerAdvantageStates.hiddenHeirCaptured) { // Only log and update if not already captured
      playerAdvantageStates.hiddenHeirCaptured = true;
      console.log(`[HiddenHeir Server] Heir ${capturedPieceId} has been captured.`);
    }
  }
  // Also check if the heir was captured but the event is based on square rather than ID (e.g. en-passant)
  // This requires checking the pieceTracking data for the heir's ID and seeing if it's marked as not alive.
  // This check might be redundant if the caller correctly identifies capturedPieceId from pieceTracking.
  if (pieceTracking && playerAdvantageStates.hiddenHeir?.pieceId && !playerAdvantageStates.hiddenHeirCaptured) {
    const heirInfo = pieceTracking[playerAdvantageStates.hiddenHeir.pieceId];
    if (heirInfo && !heirInfo.alive) {
        playerAdvantageStates.hiddenHeirCaptured = true;
        console.log(`[HiddenHeir Server] Heir ${playerAdvantageStates.hiddenHeir.pieceId} was found to be not alive in pieceTracking. Marking as captured.`);
    }
  }
  return playerAdvantageStates;
}

export function checkHeirPromotion(
    playerAdvantageStates: PlayerAdvantageStates,
    promotedPieceOriginalId: string, // The UID of the pawn *before* promotion
    promotedToType: string // The type of piece it promoted to (e.g., 'q')
): PlayerAdvantageStates {
    if (playerAdvantageStates.hiddenHeir?.pieceId && promotedPieceOriginalId === playerAdvantageStates.hiddenHeir.pieceId) {
        if (!playerAdvantageStates.hiddenHeirCaptured) { // Only log and update if not already captured
            playerAdvantageStates.hiddenHeirCaptured = true;
            console.log(`[HiddenHeir Server] Heir pawn ${promotedPieceOriginalId} has been promoted to ${promotedToType} and is now considered captured.`);
        }
    }
    return playerAdvantageStates;
}

// It's also useful to have a function to update the heir's square if it moves
export function updateHeirSquare(
    playerAdvantageStates: PlayerAdvantageStates,
    movedPieceId: string,
    newSquare: string
): PlayerAdvantageStates {
    if (playerAdvantageStates.hiddenHeir?.pieceId === movedPieceId) {
        if (playerAdvantageStates.hiddenHeir.square !== newSquare) {
            console.log(`[HiddenHeir Server] Heir ${movedPieceId} moved from ${playerAdvantageStates.hiddenHeir.square} to ${newSquare}.`);
            playerAdvantageStates.hiddenHeir.square = newSquare;
        }
    }
    return playerAdvantageStates;
}