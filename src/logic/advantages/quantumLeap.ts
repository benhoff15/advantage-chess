import { Chess, Square } from "chess.js";

/**
 * Parameters for initiating a Quantum Leap swap.
 */
export interface QuantumLeapClientParams {
  from: Square;
  to: Square;
}

/**
 * Parameters for applying a Quantum Leap swap on the client after server confirmation.
 */
export interface QuantumLeapApplyParams {
  game: Chess;
  from: Square;
  to: Square;
  newFen: string;
  isMyMove: boolean;
}

/**
 * Returns the payload to send to the server for a Quantum Leap swap.
 * The actual socket.emit should be done in the component or socket handler.
 */
export function getQuantumLeapPayload({
  from,
  to,
}: QuantumLeapClientParams) {
  return { from, to };
}

/**
 * Applies the Quantum Leap swap on the client side when the server confirms it.
 * Always loads the server-authoritative FEN for consistency.
 * Returns true if successful, false if FEN loading failed.
 */
export function applyQuantumLeapClient({
  game,
  from,
  to,
  newFen,
  isMyMove,
}: QuantumLeapApplyParams): boolean {
  console.log(
    `[QuantumLeap] Applying swap. From: ${from}, To: ${to}. New FEN: ${newFen}. Is my move: ${isMyMove}`
  );

  // Optionally, for visual feedback, swap pieces before loading FEN.
  const pieceFrom = game.get(from);
  const pieceTo = game.get(to);

  if (pieceFrom && pieceTo) {
    game.remove(from);
    game.remove(to);
    game.put({ type: pieceTo.type, color: pieceTo.color }, from);
    game.put({ type: pieceFrom.type, color: pieceFrom.color }, to);
  }

  // Always load the server-authoritative FEN.
  try {
    game.load(newFen);
    console.log(`[QuantumLeap] FEN loaded successfully: ${game.fen()}`);
    return true;
  } catch (e) {
    console.error(
      "[QuantumLeap] Error loading FEN:",
      e,
      "FEN was:",
      newFen
    );
    return false;
  }
}
