import { Piece } from "chess.js"; 
import { PlayerAdvantageStates, CloakState } from "../../../shared/types";

export function shouldHidePiece(
  square: string, // current square of the piece being rendered, e.g., "e4"
  piece: Piece,   // { type: 'n', color: 'b' } for the piece being rendered
  opponentAdvantageStates: PlayerAdvantageStates | null | undefined,
  myColor: 'white' | 'black' // The color of the player viewing the board
): boolean {
  if (opponentAdvantageStates?.cloak && opponentAdvantageStates.cloak.turnsRemaining > 0) {
    const potentialMatchId = `${square}${piece.type.toLowerCase()}`;
    // console.log(`[Cloak Client - shouldHidePiece] Input: sq=${square}, p=${piece.type}${piece.color}, oppCloak=${JSON.stringify(opponentAdvantageStates.cloak)}, myC=${myColor}. PotentialMatchId: ${potentialMatchId}`);
    if (potentialMatchId === opponentAdvantageStates.cloak.pieceId) {
         const myColorChar = myColor === 'white' ? 'w' : 'b';
         if (piece.color !== myColorChar) {
            console.log(`[Cloak Client - shouldHidePiece] HIDING piece ${piece.type}${piece.color} on ${square}. Matches opponent cloak ID: ${opponentAdvantageStates.cloak.pieceId}`);
            return true;
         }
    }
  }
  // Original logic continues below, using the already parsed activeCloak if needed, or returning early.

  if (!opponentAdvantageStates || !opponentAdvantageStates.cloak) {
    return false; 
  }

  const activeCloak: CloakState = opponentAdvantageStates.cloak; // e.g. { pieceId: "d2n", turnsRemaining: 5 }

  if (activeCloak.turnsRemaining <= 0) {
    return false; 
  }

  // Construct an ID for the piece currently being rendered on 'square'
  // Format: currentSquare + lowercasePieceType
  const renderedPieceId = `${square}${piece.type.toLowerCase()}`; 

  // Check if the rendered piece is the opponent's cloaked piece
  if (renderedPieceId === activeCloak.pieceId) {
    // Ensure the piece actually belongs to the opponent.
    // The 'piece.color' is the color of the piece on the square.
    // 'myColor' is the color of the player whose client this is.
    // We hide if piece.color is NOT myColor.
    const myColorChar = myColor === 'white' ? 'w' : 'b';
    if (piece.color !== myColorChar) {
      return true; // It's the opponent's piece and matches the cloaked ID
    }
  }
  return false;
}
