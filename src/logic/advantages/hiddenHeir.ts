import { Chess, Square, PieceSymbol, Color } from 'chess.js';
import { Advantage, PlayerAdvantageStates as FullPlayerAdvantageStates } from '../../../shared/types'; // Assuming FullPlayerAdvantageStates is the correct name from shared/types.ts
import { socket } from '../../socket'; // Assuming socket is exported from here
import { toast } from 'react-toastify'; // Assuming react-toastify is used for toasts

// Function to generate a piece UID similar to server-side logic if needed,
// or this can be simplified if server sends all UIDs initially.
// For this implementation, we'll assume the server's pieceTracking UIDs are somewhat predictable
// or that the client has a way to get the specific UID for a piece on a square.
// A common pattern is type@initialSquare, e.g., "p@e2".
// The server's pieceTracking uses UIDs like "w_p_1", "b_n_2".
// This is a known point of potential mismatch that might need addressing later
// if the client cannot accurately determine the server's UID for a piece.
// For now, we'll construct a client-side ID and assume it can be mapped or is consistent.
// Let's use a simple convention for now: colorChar + typeChar + '@' + square
// e.g., 'wP@d2' - this would need server-side parsing if different from server's internal UIDs.
// The plan specified pieceId like "wP@d2" for "set_hidden_heir", so client will generate this.

export function handleHeirSelectionClient(
  roomId: string | undefined,
  square: Square,
  piece: PieceSymbol,
  color: Color,
  myAdvantage: Advantage | null,
  game: Chess,
  playerAdvantageStates: FullPlayerAdvantageStates | null,
  pieceTracking: Record<string, { type: string; color: string; square: string; alive: boolean }>
): boolean {
  if (!roomId) {
    console.error('[HiddenHeir Client] Room ID not available for heir selection.');
    toast.error("Error: Room ID missing, cannot set heir.");
    return false;
  }

  if (myAdvantage?.id !== 'hidden_heir') return false;
  if (game.history().length > 0) {
    toast.info("Cannot select Hidden Heir after the game has started.");
    return false;
  }
  if (playerAdvantageStates?.hiddenHeir?.square) {
    toast.info("Hidden Heir already selected.");
    return false;
  }
  if (piece === 'k') {
    toast.error("You cannot choose your king as the Hidden Heir.");
    return false;
  }

  // --- NEW: Find the correct UID from pieceTracking ---
  let selectedUid: string | undefined = undefined;
  for (const [uid, info] of Object.entries(pieceTracking)) {
    if (
      info.square === square &&
      info.type === piece &&
      info.color === color[0] // 'w' or 'b'
    ) {
      selectedUid = uid;
      break;
    }
  }
  if (!selectedUid) {
    toast.error("Could not find piece UID for selection. Please try again.");
    console.error('[HiddenHeir Client] No matching UID in pieceTracking for', { square, piece, color });
    return false;
  }

  console.log(`[HiddenHeir Client] Attempting to set heir. Room: ${roomId}, Square: ${square}, Piece: ${piece}, Color: ${color}, UID: ${selectedUid}`);

  socket.emit("set_hidden_heir", {
    roomId,
    square,
    pieceId: selectedUid
  });

  toast.success(`Hidden Heir selected: ${piece.toUpperCase()} on ${square}`);
  return true;
}

export function getHiddenHeirDisplaySquare(
  playerAdvantageStates: FullPlayerAdvantageStates | null,
  myColor: Color | null, // The color of the current player viewing the board
  playerColorWhoseStatesTheseAre: Color | null // The color of the player who owns these advantage states
): Square | null {
  // Only display the heir if it's the current player's own heir
  if (myColor && playerColorWhoseStatesTheseAre && myColor === playerColorWhoseStatesTheseAre) {
    if (playerAdvantageStates?.hiddenHeir?.square && !playerAdvantageStates.hiddenHeirCaptured) {
      return playerAdvantageStates.hiddenHeir.square as Square;
    }
  }
  return null;
}

// It might also be useful to have a client-side check for if the heir is captured,
// though the server is the source of truth. This could be for UI prompts.
export function isClientHeirCaptured(playerAdvantageStates: FullPlayerAdvantageStates | null): boolean {
    return playerAdvantageStates?.hiddenHeirCaptured ?? false;
}
