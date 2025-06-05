import { Chess, Square, Color, PieceSymbol } from 'chess.js';
import { ServerMovePayload } from '../../../shared/types'; // Adjust path as needed

// Define the 12 valid Knightmare move vectors (same as server)
const KNIGHTMARE_MOVES: { dx: number; dy: number }[] = [
  { dx: 2, dy: 4 }, { dx: 2, dy: -4 }, { dx: -2, dy: 4 }, { dx: -2, dy: -4 },
  { dx: 4, dy: 2 }, { dx: 4, dy: -2 }, { dx: -4, dy: 2 }, { dx: -4, dy: -2 },
  { dx: 3, dy: 3 }, { dx: 3, dy: -3 }, { dx: -3, dy: 3 }, { dx: -3, dy: -3 },
];

export interface KnightmareClientAdvantageState {
  usedSquares: string[];
}

// Helper to convert square to 0-indexed coordinates
const squareToCoords = (square: Square): { x: number; y: number } => {
  return {
    x: square.charCodeAt(0) - 'a'.charCodeAt(0),
    y: parseInt(square[1], 10) - 1,
  };
};

// Helper to convert 0-indexed coordinates to square
const coordsToSquare = (coords: { x: number; y: number }): Square | null => {
  if (coords.x < 0 || coords.x > 7 || coords.y < 0 || coords.y > 7) {
    return null;
  }
  return (String.fromCharCode('a'.charCodeAt(0) + coords.x) + (coords.y + 1)) as Square;
};

export function canKnightUseKnightmare(
  from: string, // The square the knight is on
  advantageState: KnightmareClientAdvantageState | null | undefined
): boolean {
  console.log(`[KM Client DEBUG] canKnightUseKnightmare called. From: ${from}, State: ${JSON.stringify(advantageState)}`);
  if (!advantageState) {
    console.log('[KM Client DEBUG] canKnightUseKnightmare: No advantage state provided, returning false.');
    return false;
  }
  const isUsed = advantageState.usedSquares.includes(from);
  console.log(`[KM Client DEBUG] canKnightUseKnightmare: Is square ${from} in usedSquares (${JSON.stringify(advantageState.usedSquares)})? ${isUsed}`);
  const canUse = !isUsed;
  console.log(`[KM Client DEBUG] canKnightUseKnightmare for knight on ${from}: ${canUse}.`);
  return canUse;
}

export function getKnightmareSquares(
  game: Chess, // Current game instance
  from: Square,
  playerColor: 'w' | 'b' // Color of the knight's player
): Square[] {
  console.log(`[KM Client DEBUG] getKnightmareSquares called. From: ${from}, PlayerColor: ${playerColor}, CurrentFEN: ${game.fen()}`);
  const validSquares: Square[] = [];
  const fromCoords = squareToCoords(from);
  const pieceAtFrom = game.get(from);

  if (!pieceAtFrom || pieceAtFrom.type !== 'n' || pieceAtFrom.color !== playerColor) {
    console.warn(`[KM Client DEBUG] getKnightmareSquares: No knight of player ${playerColor} at ${from}. Found: ${JSON.stringify(pieceAtFrom)}`);
    return [];
  }
  console.log(`[KM Client DEBUG] getKnightmareSquares: Knight confirmed at ${from}. FromCoords: ${JSON.stringify(fromCoords)}`);

  KNIGHTMARE_MOVES.forEach(move => {
    const toCoords = { x: fromCoords.x + move.dx, y: fromCoords.y + move.dy };
    const toSquare = coordsToSquare(toCoords);
    // console.log(`[KM Client DEBUG] getKnightmareSquares: Checking vector {dx:${move.dx}, dy:${move.dy}} -> toCoords: ${JSON.stringify(toCoords)}, toSquare: ${toSquare}`);

    if (toSquare) {
      const pieceAtTo = game.get(toSquare);
      // console.log(`[KM Client DEBUG] getKnightmareSquares: Potential square ${toSquare}. Piece on it: ${JSON.stringify(pieceAtTo)}`);
      if (!pieceAtTo || pieceAtTo.color !== playerColor) {
        validSquares.push(toSquare);
        // console.log(`[KM Client DEBUG] getKnightmareSquares: Added ${toSquare} to valid squares.`);
      } else {
        // console.log(`[KM Client DEBUG] getKnightmareSquares: Skipped ${toSquare} (own piece).`);
      }
    } else {
      // console.log(`[KM Client DEBUG] getKnightmareSquares: Skipped vector {dx:${move.dx}, dy:${move.dy}} (off board).`);
    }
  });
  console.log(`[KM Client DEBUG] getKnightmareSquares from ${from} for ${playerColor}: Final validSquares = ${JSON.stringify(validSquares)}`);
  return validSquares;
}

interface HandleKnightmareClientMoveParams {
  game: Chess; // Client's game instance
  from: string;
  to: string;
  color: 'white' | 'black'; // Player's color
  // advantageState is not strictly needed here for constructing the payload,
  // but ChessGame.tsx will use canKnightUseKnightmare before calling this.
}

export function handleKnightmareClientMove({
  game,
  from,
  to,
  color,
}: HandleKnightmareClientMoveParams): ServerMovePayload | null {
  console.log(`[KnightmareClient] handleKnightmareClientMove: Attempt from ${from} to ${to} for ${color}`);
  const piece = game.get(from as Square);
  const playerChessJsColor = color === 'white' ? 'w' : 'b';

  if (!piece || piece.type !== 'n' || piece.color !== playerChessJsColor) {
    console.warn(`[KnightmareClient] Not player's knight at ${from}. Piece: ${JSON.stringify(piece)}`);
    return null;
  }

  // Validate if 'to' is a valid Knightmare destination from 'from'
  const possibleKnightmareSquares = getKnightmareSquares(game, from as Square, playerChessJsColor);
  if (!possibleKnightmareSquares.includes(to as Square)) {
    console.warn(`[KnightmareClient] ${to} is not a valid Knightmare destination from ${from}. Possible: ${JSON.stringify(possibleKnightmareSquares)}`);
    return null;
  }

  // If client-side validation passes, prepare the payload for the server
  const movePayload: ServerMovePayload = {
    from,
    to,
    special: 'knightmare',
    color, // Client's color ('white' or 'black')
  };
  console.log('[KnightmareClient] Knightmare move payload prepared:', movePayload);
  return movePayload;
}

interface ApplyKnightmareOpponentMoveParams {
  game: Chess; // Client's game instance to be updated
  receivedMove: ServerMovePayload; // Move data from the server
}

export function applyKnightmareOpponentMove({
  game,
  receivedMove,
}: ApplyKnightmareOpponentMoveParams): boolean {
  console.log('[KnightmareClient] applyKnightmareOpponentMove:', JSON.stringify(receivedMove));
  if (receivedMove.special !== 'knightmare' || !receivedMove.color || !receivedMove.from || !receivedMove.to) {
    console.error('[KnightmareClient] Invalid opponent Knightmare move data:', receivedMove);
    return false;
  }

  const opponentChessJsColor = receivedMove.color === 'white' ? 'w' : 'b';
  const pieceToMove = game.get(receivedMove.from as Square);

  if (!pieceToMove || pieceToMove.type !== 'n' || pieceToMove.color !== opponentChessJsColor) {
    console.error(
      `[KnightmareClient] Piece at ${receivedMove.from} is not opponent's knight as expected. Actual: ${pieceToMove?.type}${pieceToMove?.color}. Expected: n${opponentChessJsColor}. FEN: ${game.fen()}`
    );
    // Proceed with caution, server is authoritative.
  }

  // If server sends afterFen, client should ideally use it.
  // For now, this function will manually apply and reconstruct FEN if afterFen is missing.
  // However, the plan is for ChessGame.tsx to primarily rely on afterFen from the server echo.
  // This function is more for applying opponent's move if no afterFen was sent (which shouldn't happen with good server logic).

  const snapshotFen = game.fen();
  console.log(`[KnightmareClient applyOpponent] FEN before applying: ${snapshotFen}`);

  const fromSq = receivedMove.from as Square;
  const toSq = receivedMove.to as Square;

  game.remove(fromSq);
  const capturedPiece = game.get(toSq); // Check if destination was occupied for capture flag
  if (capturedPiece) {
    game.remove(toSq);
  }
  game.put({ type: 'n', color: opponentChessJsColor }, toSq);
  
  // FEN Reconstruction (simplified, assuming server's afterFen is preferred)
  // This manual FEN update is a fallback. ChessGame.tsx should use server's afterFen.
  let fenParts = game.fen().split(' ');
  const originalSnapshotFenParts = snapshotFen.split(' ');

  fenParts[1] = opponentChessJsColor === 'w' ? 'b' : 'w'; // Switch turn
  fenParts[2] = originalSnapshotFenParts[2]; // Castling rights (Knightmare move doesn't affect them)
  fenParts[3] = '-'; // En passant target square reset

  const originalHalfmoves = parseInt(originalSnapshotFenParts[4], 10) || 0;
  fenParts[4] = capturedPiece ? '0' : (originalHalfmoves + 1).toString();

  const originalFullmoves = parseInt(originalSnapshotFenParts[5], 10) || 1;
  if (opponentChessJsColor === 'b') { // If Black (opponent) made the move
    fenParts[5] = (originalFullmoves + 1).toString();
  } else {
    fenParts[5] = originalFullmoves.toString();
  }
  
  const constructedFen = fenParts.join(' ');
  console.log(`[KnightmareClient applyOpponent] Manually constructed FEN: ${constructedFen}`);

  try {
    // Validate the constructed FEN by loading it.
    // If receivedMove.afterFen exists, ChessGame.tsx will use that primarily.
    // This load is more of a sanity check for this manual application.
    game.load(constructedFen); 
    if (game.fen().split(' ')[0] !== constructedFen.split(' ')[0]) { // Compare piece placement part
        console.warn(`[KnightmareClient applyOpponent] FEN mismatch after load. Loaded: ${game.fen()}, Expected (manually constructed): ${constructedFen}. Reverting.`);
        game.load(snapshotFen); // Revert to snapshot
        return false;
    }
    console.log(`[KnightmareClient applyOpponent] Successfully applied. New FEN: ${game.fen()}`);
    return true;
  } catch (e) {
    console.error("[KnightmareClient applyOpponent] Error loading manually constructed FEN. Reverting.", e, "Attempted FEN:", constructedFen);
    game.load(snapshotFen);
    return false;
  }
}
