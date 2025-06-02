import { Chess, Square, Color } from 'chess.js';

export interface CornerBlitzClientMove {
  from: string;
  to: string;
  special: 'corner_blitz';
  color: 'white' | 'black';
  // We might need to send which pawn was jumped if server needs to validate that explicitly
  // jumpedPawnSquare?: string; 
}

// Tracks which of the player's rooks have moved from their starting squares
export interface PlayerRooksMovedState {
  a1?: boolean;
  h1?: boolean;
  a8?: boolean;
  h8?: boolean;
}

interface HandleCornerBlitzClientParams {
  game: Chess;
  from: string;
  to: string;
  color: 'white' | 'black';
  playerRooksMoved: PlayerRooksMovedState; // Tracks if rooks on a1, h1, a8, h8 have moved
}

export interface HandleCornerBlitzClientResult {
  moveData: CornerBlitzClientMove | null;
  rookMovedKey: keyof PlayerRooksMovedState | null; // e.g., 'a1', 'h1', to update the state in ChessGame
}

export function handleCornerBlitzClient({
  game,
  from,
  to,
  color,
  playerRooksMoved,
}: HandleCornerBlitzClientParams): HandleCornerBlitzClientResult {
  console.log("[CornerBlitzClient] Attempting move:", { from, to, color, playerRooksMoved });

  const piece = game.get(from as Square);
  const playerChessJsColor = color === 'white' ? 'w' : 'b';

  if (!piece || piece.type !== 'r' || piece.color !== playerChessJsColor) {
    console.log("[CornerBlitzClient] Not player's rook.");
    return { moveData: null, rookMovedKey: null };
  }

  const fromSquare = from as Square;
  const toSquare = to as Square;
  const rookKey = fromSquare as keyof PlayerRooksMovedState;

  const validStartingSquares: (keyof PlayerRooksMovedState)[] = playerChessJsColor === 'w' ? ['a1', 'h1'] : ['a8', 'h8'];
  if (!validStartingSquares.includes(rookKey)) {
    console.log(`[CornerBlitzClient] Rook not on a valid starting square for ${color}: ${fromSquare}`);
    return { moveData: null, rookMovedKey: null };
  }
  if (playerRooksMoved[rookKey]) {
    console.log(`[CornerBlitzClient] Rook ${rookKey} has already blitzed.`);
    return { moveData: null, rookMovedKey: rookKey }; // Return rookKey as an attempt was made for this rook
  }

  if (fromSquare[0] !== toSquare[0] && fromSquare[1] !== toSquare[1]) {
    console.log("[CornerBlitzClient] Move not in a straight line.");
    return { moveData: null, rookMovedKey: rookKey }; // Indicate attempt for this rook
  }

  // Path checking
  let pathClearForLeap = true; // Will be false if blocked by non-pawn or >1 piece
  let jumpedPawnSquare: string | null = null;
  let piecesInPath = 0;
  const opponentColor = playerChessJsColor === 'w' ? 'b' : 'w';

  const fileDiff = Math.abs(toSquare.charCodeAt(0) - fromSquare.charCodeAt(0));
  const rankDiff = Math.abs(parseInt(toSquare[1], 10) - parseInt(fromSquare[1], 10));
  const stepX = fromSquare.charCodeAt(0) === toSquare.charCodeAt(0) ? 0 : (toSquare.charCodeAt(0) > fromSquare.charCodeAt(0) ? 1 : -1);
  const stepY = fromSquare[1] === toSquare[1] ? 0 : (toSquare[1] > fromSquare[1] ? 1 : -1);
  const maxSteps = Math.max(fileDiff, rankDiff);

  console.log(`[CornerBlitzClient] Path check: from ${fromSquare} to ${toSquare}, maxSteps ${maxSteps}`);

  for (let i = 1; i < maxSteps; i++) {
    const currentPathSq = String.fromCharCode(fromSquare.charCodeAt(0) + i * stepX) + (parseInt(fromSquare[1], 10) + i * stepY).toString();
    const pieceOnPath = game.get(currentPathSq as Square);
    console.log(`[CornerBlitzClient] Checking path square: ${currentPathSq}, piece:`, pieceOnPath);
    if (pieceOnPath) {
      piecesInPath++;
      if (pieceOnPath.type === 'p' && pieceOnPath.color === opponentColor && !jumpedPawnSquare) {
        jumpedPawnSquare = currentPathSq;
        console.log(`[CornerBlitzClient] Identified potential jumped pawn: ${jumpedPawnSquare}`);
      } else {
        pathClearForLeap = false; // Blocked by another piece or a second pawn
        console.log("[CornerBlitzClient] Path blocked by non-pawn or second piece.");
        break;
      }
    }
  }

  const pieceOnToSquare = game.get(toSquare);
  if (pieceOnToSquare && pieceOnToSquare.color === playerChessJsColor) {
    console.log("[CornerBlitzClient] Destination square occupied by friendly piece.");
    pathClearForLeap = false; // Cannot capture own piece
  }

  if (!pathClearForLeap || (piecesInPath > 1) || (piecesInPath === 1 && !jumpedPawnSquare)) {
    console.log("[CornerBlitzClient] Path validation failed:", { pathClearForLeap, piecesInPath, jumpedPawnSquare });
    return { moveData: null, rookMovedKey: rookKey };
  }
  if (jumpedPawnSquare && toSquare === jumpedPawnSquare) {
    console.log("[CornerBlitzClient] Cannot land on the jumped pawn.");
    return { moveData: null, rookMovedKey: rookKey };
  }
  
  console.log("[CornerBlitzClient] Path validation successful. Proceeding with FEN update.");
  const snapshot = game.fen();
  console.log(`[CornerBlitzClient] FEN before local update: ${snapshot}`);

  // Perform local move
  game.remove(fromSquare);
  const capturedPiece = game.get(toSquare); // Check if 'to' is a capture
  if (capturedPiece) {
    game.remove(toSquare); // Remove captured piece before putting the rook
    console.log(`[CornerBlitzClient] Captured piece on ${toSquare}:`, capturedPiece);
  }
  game.put({ type: 'r', color: playerChessJsColor }, toSquare);

  // FEN Reconstruction
  let fenParts = game.fen().split(" "); // Start with FEN after put/remove for piece placement
  const originalFenParts = snapshot.split(' '); // Use snapshot for counters and castling

  // 1. Piece placement (fenParts[0]) - already updated by game.put/remove

  // 2. Active color (turn)
  fenParts[1] = playerChessJsColor === 'w' ? 'b' : 'w';

  // 3. Castling availability
  let currentCastling = originalFenParts[2];
  if (playerChessJsColor === 'w') {
    if (fromSquare === 'a1') currentCastling = currentCastling.replace('Q', '');
    if (fromSquare === 'h1') currentCastling = currentCastling.replace('K', '');
  } else { // playerChessJsColor === 'b'
    if (fromSquare === 'a8') currentCastling = currentCastling.replace('q', '');
    if (fromSquare === 'h8') currentCastling = currentCastling.replace('k', '');
  }
  fenParts[2] = currentCastling === '' ? '-' : currentCastling.replace(/undefined/g, ''); // Clean up if one right was only one present

  // 4. En passant target square
  fenParts[3] = '-'; // Rook move, so en passant not possible this turn

  // 5. Halfmove clock
  // Resets to 0 on a capture or pawn move. Increments otherwise.
  const originalHalfmoves = parseInt(originalFenParts[4], 10) || 0;
  fenParts[4] = capturedPiece ? '0' : (originalHalfmoves + 1).toString();

  // 6. Fullmove number
  const originalFullmoves = parseInt(originalFenParts[5], 10) || 1;
  if (playerChessJsColor === 'b') {
    fenParts[5] = (originalFullmoves + 1).toString();
  } else {
    fenParts[5] = originalFullmoves.toString();
  }
  
  const nextFen = fenParts.join(" ");
  console.log(`[CornerBlitzClient] Constructed FEN: ${nextFen}`);

  try {
    game.load(nextFen);
    if (game.fen() !== nextFen) {
      console.warn(`[CornerBlitzClient] FEN mismatch after load. Loaded: ${game.fen()}, Expected: ${nextFen}. Reverting.`);
      game.load(snapshot); // Revert
      return { moveData: null, rookMovedKey: rookKey }; // Attempted, but FEN reconstruction/load failed
    }
    
    console.log(`[CornerBlitzClient] FEN load successful. Final FEN: ${game.fen()}`);
    const moveData: CornerBlitzClientMove = { from, to, special: 'corner_blitz', color };
    return { moveData, rookMovedKey: rookKey };
  } catch (e) {
    console.error("[CornerBlitzClient] Error loading constructed FEN. Reverting.", e, "Attempted FEN:", nextFen);
    game.load(snapshot); // Revert
    return { moveData: null, rookMovedKey: rookKey }; // Attempted, but FEN load threw error
  }
}

export interface OpponentCornerBlitzMove {
  from: string;
  to: string;
  special?: 'corner_blitz';
  color?: 'white' | 'black';
}

// Also refine applyCornerBlitzOpponentMove for consistency in FEN handling (especially counters and castling from snapshot)
export function applyCornerBlitzOpponentMove({
  game,
  receivedMove,
}: { game: Chess; receivedMove: OpponentCornerBlitzMove }): boolean {
  console.log("[CornerBlitzOpponent] Applying move:", receivedMove);
  if (!receivedMove.color || !receivedMove.from || !receivedMove.to || receivedMove.special !== 'corner_blitz') {
    console.error("[CornerBlitzOpponent] Invalid data:", receivedMove);
    return false;
  }
  const opponentChessJsColor = receivedMove.color === 'white' ? 'w' : 'b';
  const fromSquare = receivedMove.from as Square;
  const toSquare = receivedMove.to as Square;
  
  const snapshot = game.fen();
  console.log(`[CornerBlitzOpponent] FEN before: ${snapshot}`);

  // Check for piece on 'to' square *before* removing 'from' to correctly identify captures for halfmove clock
  const pieceOnToInitially = game.get(toSquare);
  
  game.remove(fromSquare);
  // If the piece on 'to' was the same as the one being moved (should not happen if from != to),
  // then it's not a capture for halfmove clock purposes.
  // This logic assumes 'from' and 'to' are different, which is standard for moves.
  const capturedPiece = (pieceOnToInitially && pieceOnToInitially.color !== opponentChessJsColor) ? pieceOnToInitially : null;
  if (capturedPiece) {
      // game.remove(toSquare) was implicitly done if rook lands on opponent piece.
      // If we explicitly remove, ensure it's only if 'toSquare' had an opponent piece.
      // chess.js put() overwrites, so explicit remove of captured piece isn't strictly needed before put().
      console.log(`[CornerBlitzOpponent] Captured piece on ${toSquare}:`, capturedPiece);
  }
  game.put({ type: 'r', color: opponentChessJsColor }, toSquare);

  let fenParts = game.fen().split(" ");
  const originalFenParts = snapshot.split(' ');

  fenParts[1] = opponentChessJsColor === 'w' ? 'b' : 'w'; // Turn switch

  let currentCastling = originalFenParts[2];
  if (opponentChessJsColor === 'w') {
    if (fromSquare === 'a1') currentCastling = currentCastling.replace('Q', '');
    if (fromSquare === 'h1') currentCastling = currentCastling.replace('K', '');
  } else {
    if (fromSquare === 'a8') currentCastling = currentCastling.replace('q', '');
    if (fromSquare === 'h8') currentCastling = currentCastling.replace('k', '');
  }
  fenParts[2] = currentCastling === '' ? '-' : currentCastling.replace(/undefined/g, '');

  fenParts[3] = '-'; // En passant

  const originalHalfmoves = parseInt(originalFenParts[4], 10) || 0;
  // Halfmove clock resets if a capture occurred.
  fenParts[4] = capturedPiece ? '0' : (originalHalfmoves + 1).toString(); 

  const originalFullmoves = parseInt(originalFenParts[5], 10) || 1;
  if (opponentChessJsColor === 'b') { // If opponent (who made the move) was black
    fenParts[5] = (originalFullmoves + 1).toString();
  } else {
    fenParts[5] = originalFullmoves.toString();
  }
  
  const newFen = fenParts.join(" ");
  console.log(`[CornerBlitzOpponent] Constructed FEN: ${newFen}`);

  try {
    game.load(newFen);
    if (game.fen() !== newFen) {
      console.warn(`[CornerBlitzOpponent] FEN mismatch. Loaded: ${game.fen()}, Expected: ${newFen}. Reverting.`);
      game.load(snapshot); return false;
    }
    console.log(`[CornerBlitzOpponent] Success. New FEN: ${game.fen()}`);
    return true;
  } catch (e) {
    console.error("[CornerBlitzOpponent] Error loading FEN. Reverting.", e);
    game.load(snapshot); return false;
  }
}
