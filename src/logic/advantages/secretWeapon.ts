import { Chess, Square, Color, PieceSymbol, Move } from 'chess.js';
import { PlayerAdvantageStates } from '../../../shared/types'; // Adjust path as needed

// Assuming PieceTrackingType is similar to what's used in ChessGame.tsx for pieceTracking state
export type PieceTrackingClientType = Record<string, {
  type: string; // PieceSymbol ('p', 'n', 'b', 'r', 'q', 'k')
  color: string; // 'w' or 'b'
  square: string; // e.g., 'e2'
  alive: boolean;
}>;

/**
 * Generates legal moves for the Secret Weapon pawn as if it were a queen.
 *
 * @param game The current Chess game instance (immutable, for checking legality).
 * @param square The square of the piece being considered.
 * @param playerColor The color of the current player.
 * @param playerAdvantageStates The advantage states for the current player.
 * @param pieceTracking The client-side piece tracking information.
 * @returns An array of valid destination squares if the piece is the Secret Weapon, otherwise empty.
 */
export function getSecretWeaponLegalMoves(
  game: Chess,
  square: Square,
  playerColor: Color,
  playerAdvantageStates: PlayerAdvantageStates | null,
  pieceTracking: PieceTrackingClientType | null
): Square[] {
  if (!playerAdvantageStates?.secretWeaponPieceId || !pieceTracking) {
    return [];
  }

  const pieceOnSquare = game.get(square);
  if (!pieceOnSquare || pieceOnSquare.color !== playerColor[0]) {
    return [];
  }

  // Find the UID of the piece on the given square
  let currentPieceUid: string | undefined;
  for (const [uid, info] of Object.entries(pieceTracking)) {
    if (info.square === square && info.color === playerColor[0] && info.alive) {
      currentPieceUid = uid;
      break;
    }
  }

  if (currentPieceUid !== playerAdvantageStates.secretWeaponPieceId) {
    return []; // Not the secret weapon piece
  }

  // It IS the Secret Weapon. Generate queen moves.
  // Create a temporary game instance to avoid modifying the main one.
  // Place a queen of the player's color on the square to get its moves.
  const tempGame = new Chess(game.fen());
  tempGame.remove(square);
  tempGame.put({ type: 'q', color: playerColor[0] as 'w' | 'b' }, square);

  const moves = tempGame.moves({ square: square, verbose: true }) as Move[];
  return moves.map(move => move.to);
}

/**
 * Gets display information for the Secret Weapon UI box.
 *
 * @param playerAdvantageStates The advantage states for the current player.
 * @param pieceTracking The client-side piece tracking information.
 * @param myColor The color of the player viewing the game.
 * @returns Info object or null if not applicable.
 */
export function getSecretWeaponDisplayInfo(
  playerAdvantageStates: PlayerAdvantageStates | null,
  pieceTracking: PieceTrackingClientType | null,
  myColor: Color | null // Used to ensure we only show info for the current player's advantage
): { text: string; pieceId: string; currentSquare: string | null } | null {
  if (!myColor || !playerAdvantageStates?.secretWeaponPieceId || !pieceTracking) {
    return null;
  }

  const secretPieceId = playerAdvantageStates.secretWeaponPieceId;
  const pieceInfo = pieceTracking[secretPieceId];

  if (!pieceInfo || !pieceInfo.alive) {
    // Piece not found or captured
    return {
        text: `Your Secret Weapon (ID: ${secretPieceId}) is no longer on the board.`,
        pieceId: secretPieceId,
        currentSquare: null,
    };
  }
  
  // Ensure the piece still belongs to myColor - this check might be redundant
  // if secretWeaponPieceId is correctly managed but good for safety.
  if (pieceInfo.color !== myColor[0]) {
      console.warn(`[getSecretWeaponDisplayInfo] Secret weapon piece ${secretPieceId} color ${pieceInfo.color} does not match player color ${myColor[0]}.`);
      return null;
  }

  return {
    text: `Secret Weapon: Your disguised queen is on ${pieceInfo.square}.`,
    pieceId: secretPieceId,
    currentSquare: pieceInfo.square,
  };
}
