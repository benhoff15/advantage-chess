import { Chess, Move, Square, Color, PieceSymbol } from 'chess.js';

interface CornerBlitzServerClientMoveData {
  from: string;
  to: string;
  special: 'corner_blitz';
  color: 'white' | 'black';
}

// Server-side state for tracking rook movements for this advantage
// Mirrors PlayerRooksMovedState from client, but will be stored per player in RoomState
export interface CornerBlitzAdvantageRookState {
  a1?: boolean;
  h1?: boolean;
  a8?: boolean;
  h8?: boolean;
}

interface HandleCornerBlitzServerParams {
  game: Chess; // Server's game instance, loaded with currentFen
  clientMoveData: CornerBlitzServerClientMoveData;
  currentFen: string; // FEN before this move attempt
  playerColor: 'w' | 'b';
  rooksMovedState: CornerBlitzAdvantageRookState; // Player's current state for their rooks
}

interface HandleCornerBlitzServerResult {
  moveResult: Move | null;
  nextFen: string;
  advantageStateUpdated: CornerBlitzAdvantageRookState;
}

export function handleCornerBlitzServer({
  game,
  clientMoveData,
  currentFen,
  playerColor,
  rooksMovedState,
}: HandleCornerBlitzServerParams): HandleCornerBlitzServerResult {
  const initialRooksState = { ...rooksMovedState };
  const fromSq = clientMoveData.from as Square;
  const toSq = clientMoveData.to as Square;

  const piece = game.get(fromSq);
  if (!piece || piece.type !== 'r' || piece.color !== playerColor) {
    console.warn(`[CornerBlitzServer] Piece at ${fromSq} is not player's rook.`);
    return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
  }

  const validStartingSquares: (keyof CornerBlitzAdvantageRookState)[] = playerColor === 'w' ? ['a1', 'h1'] : ['a8', 'h8'];
  const rookKey = fromSq as keyof CornerBlitzAdvantageRookState;

  if (!validStartingSquares.includes(rookKey) || initialRooksState[rookKey]) {
    console.warn(`[CornerBlitzServer] Rook at ${fromSq} not eligible or already blitzed.`);
    return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
  }

  if (fromSq[0] !== toSq[0] && fromSq[1] !== toSq[1]) { // Must be straight line
    return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
  }
  
  // Path validation (copied and adapted from client, server is authority)
  let pathClear = true;
  let jumpedPawnInfo: { square: Square; type: PieceSymbol; color: Color } | null = null;
  let piecesInPath = 0;
  const opponentColor = playerColor === 'w' ? 'b' : 'w';

  const fileDiff = Math.abs(toSq.charCodeAt(0) - fromSq.charCodeAt(0));
  const rankDiff = Math.abs(parseInt(toSq[1], 10) - parseInt(fromSq[1], 10));
  const stepX = fromSq.charCodeAt(0) === toSq.charCodeAt(0) ? 0 : (toSq.charCodeAt(0) > fromSq.charCodeAt(0) ? 1 : -1);
  const stepY = fromSq[1] === toSq[1] ? 0 : (toSq[1] > fromSq[1] ? 1 : -1);
  const maxSteps = Math.max(fileDiff, rankDiff);

  for (let i = 1; i < maxSteps; i++) {
    const currentPathSq = String.fromCharCode(fromSq.charCodeAt(0) + i * stepX) + (parseInt(fromSq[1], 10) + i * stepY).toString() as Square;
    const pieceOnPath = game.get(currentPathSq);
    if (pieceOnPath) {
      piecesInPath++;
      if (pieceOnPath.type === 'p' && pieceOnPath.color === opponentColor && !jumpedPawnInfo) {
        jumpedPawnInfo = { square: currentPathSq, type: 'p', color: opponentColor };
      } else {
        pathClear = false; break;
      }
    }
  }
  const pieceOnToSquare = game.get(toSq);
  if (pieceOnToSquare && pieceOnToSquare.color === playerColor) pathClear = false;
  if (!pathClear || (piecesInPath > 1) || (piecesInPath === 1 && !jumpedPawnInfo)) {
    console.warn(`[CornerBlitzServer] Path not valid for blitz.`);
    return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
  }
  if (jumpedPawnInfo && toSq === jumpedPawnInfo.square) { // Cannot land on jumped pawn
     return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
  }

  // Move is valid, update game state
  const tempGame = new Chess(currentFen); // Use temp game for manipulation first
  tempGame.remove(fromSq);
  const capturedPieceOnTo = tempGame.get(toSq); // Check if 'to' is a capture
  tempGame.put({ type: 'r', color: playerColor }, toSq);

  let fenParts = tempGame.fen().split(' ');
  fenParts[0] = tempGame.board().map(rank => {
    let empty = 0; let fenRow = "";
    rank.forEach(sq => {
      if (sq === null) { empty++; } 
      else {
        if (empty > 0) { fenRow += empty; empty = 0; }
        fenRow += sq.color === 'w' ? sq.type.toUpperCase() : sq.type.toLowerCase();
      }
    });
    if (empty > 0) fenRow += empty;
    return fenRow;
  }).join('/');
  fenParts[1] = opponentColor; // Next turn
  
  // Update castling rights
  let currentCastling = new Chess(currentFen).fen().split(' ')[2]; // Get from original FEN
  if (playerColor === 'w') {
    if (fromSq === 'a1') currentCastling = currentCastling.replace('Q', '');
    if (fromSq === 'h1') currentCastling = currentCastling.replace('K', '');
  } else { // playerColor === 'b'
    if (fromSq === 'a8') currentCastling = currentCastling.replace('q', '');
    if (fromSq === 'h8') currentCastling = currentCastling.replace('k', '');
  }
  fenParts[2] = currentCastling === '' ? '-' : currentCastling;

  fenParts[3] = '-'; // En passant target reset
  const originalFenParts = currentFen.split(' ');
  const originalHalfmoves = parseInt(originalFenParts[4], 10) || 0;
  const originalFullmoves = parseInt(originalFenParts[5], 10) || 1;

  fenParts[4] = (originalHalfmoves + 1).toString(); // Increment halfmove clock
  if (playerColor === 'b') { // If black made the move
    fenParts[5] = (originalFullmoves + 1).toString(); // Increment fullmove number
  } else {
    fenParts[5] = originalFullmoves.toString(); // Fullmove number stays same if white made the move
  }
  
  const constructedFen = fenParts.join(' ');

  try {
    game.load(constructedFen); // Load into the main game instance

    const moveResultObject: Move = {
      color: playerColor, from: fromSq, to: toSq, flags: 'n', piece: 'r',
      san: `R${jumpedPawnInfo ? 'x' : ''}${toSq}`, // Basic SAN
      lan: `${fromSq}${toSq}`,
      before: currentFen, after: game.fen(),
      isCapture: () => !!capturedPieceOnTo,
      isPromotion: () => false, isEnPassant: () => false,
      isKingsideCastle: () => false, isQueensideCastle: () => false,
      isBigPawn: () => false,
    };
    if (capturedPieceOnTo) {
        moveResultObject.captured = capturedPieceOnTo.type;
        moveResultObject.flags = 'c'; // Mark as capture
    }


    const updatedRooksState = { ...initialRooksState, [rookKey]: true };
    return { moveResult: moveResultObject, nextFen: game.fen(), advantageStateUpdated: updatedRooksState };

  } catch (e) {
    console.error(`[CornerBlitzServer] Error loading FEN: ${e}`);
    game.load(currentFen); // Revert main game instance
    return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
  }
}
