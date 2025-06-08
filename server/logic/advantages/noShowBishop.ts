import { Chess, Square, PieceSymbol } from 'chess.js';
import { PlayerAdvantageStates, SummonNoShowBishopPayload } from '../../../shared/types';

export const handleNoShowBishopServer = (
  game: Chess,
  payload: SummonNoShowBishopPayload,
  playerColor: 'w' | 'b',
  playerAdvantageStates: PlayerAdvantageStates
) => {
  console.log("Handling No-Show Bishop server logic");

  // Validation: Check if noShowBishopUsed is true
  if (playerAdvantageStates.noShowBishopUsed) {
    console.error("Error: Bishop already summoned.");
    return { error: "Bishop already summoned." };
  }

  // Validation: Check if game.history().length >= 20
  if (game.history().length >= 20) {
    console.error("Error: Summon period expired.");
    return { error: "Summon period expired." };
  }

  // Validation: Check if the payload.square is a valid square
  if (!/^[a-h][1-8]$/.test(payload.square)) {
    console.error(`Error: Invalid square format - ${payload.square}`);
    return { error: `Invalid square format: ${payload.square}` };
  }

  // PATCH: Log FEN and piece on target square before empty check
  console.log("[No-Show Bishop Server] FEN before summon:", game.fen());
  const pieceOnTarget = game.get(payload.square as Square);
  console.log("[No-Show Bishop Server] Piece on", payload.square, ":", pieceOnTarget);

  // PATCH: Defensive empty check (match sacrificial blessing logic)
  if (pieceOnTarget !== null && typeof pieceOnTarget !== 'undefined') {
    console.error(`Error: Target square ${payload.square} is not empty.`, pieceOnTarget);
    return { error: "Target square is not empty." };
  }

  // Validation: Ensure noShowBishopRemovedPiece exists
  if (
    !playerAdvantageStates.noShowBishopRemovedPiece ||
    !playerAdvantageStates.noShowBishopRemovedPiece.type ||
    !playerAdvantageStates.noShowBishopRemovedPiece.square
  ) {
    console.error("Error: Removed bishop details not found in playerAdvantageStates.");
    return { error: "Removed bishop details not found." };
  }

  const removedBishopType = playerAdvantageStates.noShowBishopRemovedPiece.type as PieceSymbol;

  // Logic: Place the bishop on the board
  console.log(
    `Attempting to place bishop of type ${removedBishopType} and color ${playerColor} on square ${payload.square}`
  );
  const putResult = game.put(
    { type: removedBishopType, color: playerColor },
    payload.square as Square
  );

  if (!putResult) {
    console.error("Error: Failed to place bishop on the board.");
    return { error: "Failed to place bishop." };
  }

  console.log("Bishop placed successfully.");
  return { success: true, newFen: game.fen() };
};
