import { Chess, Move, Square, Color, PieceSymbol } from 'chess.js';

interface CornerBlitzServerClientMoveData {
  from: string;
  to: string;
  special: 'corner_blitz'; // Ensure client sends this
  color: 'white' | 'black'; // Client should also send its color
}

export interface CornerBlitzAdvantageRookState {
  a1?: boolean;
  h1?: boolean;
  a8?: boolean;
  h8?: boolean;
}

interface HandleCornerBlitzServerParams {
  game: Chess; // Server's game instance, IS ALREADY LOADED WITH currentFen by caller (socketHandlers)
  clientMoveData: CornerBlitzServerClientMoveData;
  currentFen: string; // FEN before this move attempt (used for reverting and reference)
  playerColor: 'w' | 'b'; // Determined by socketHandlers
  rooksMovedState: CornerBlitzAdvantageRookState;
}

interface HandleCornerBlitzServerResult {
  moveResult: Move | null;
  nextFen: string; // This will be game.fen() if successful, or currentFen if failed
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

  // 1. Initial Checks
  const pieceAtFrom = game.get(fromSq); // Use game.get() as it's loaded with currentFen
  if (!pieceAtFrom || pieceAtFrom.type !== 'r' || pieceAtFrom.color !== playerColor) {
    console.warn(`[CornerBlitzServer] Piece at ${fromSq} is not player's rook or wrong color. FEN: ${currentFen}`);
    return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
  }

  const validStartingRookSquares: ReadonlyArray<Square> = playerColor === 'w' ? ['a1', 'h1'] : ['a8', 'h8'];
  const rookKey = fromSq as keyof CornerBlitzAdvantageRookState;

  if (!validStartingRookSquares.includes(fromSq as Square) || initialRooksState[rookKey]) {
    console.warn(`[CornerBlitzServer] Rook at ${fromSq} not eligible (not on start square or already blitzed). State:`, initialRooksState);
    return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
  }

  if (fromSq[0] !== toSq[0]) { // Move must be along the same file
    console.warn(`[CornerBlitzServer] Move from ${fromSq} to ${toSq} is not along the same file.`);
    return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
  }

  // 2. Path and Target Validation
  const file = fromSq[0];
  let pawnSquareToJump: Square;
  let validDestinations: [Square, Square]; // [short_jump_sq, long_jump_sq]
  let intermediateSquareForFarDest: Square; 

  if (playerColor === 'w') {
    if (fromSq[1] !== '1') { // Should be on rank 1
        console.warn(`[CornerBlitzServer] White rook not on rank 1: ${fromSq}`);
        return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
    }
    pawnSquareToJump = (file + '2') as Square;
    validDestinations = [(file + '3') as Square, (file + '4') as Square];
    intermediateSquareForFarDest = (file + '3') as Square;
  } else { // playerColor === 'b'
    if (fromSq[1] !== '8') { // Should be on rank 8
        console.warn(`[CornerBlitzServer] Black rook not on rank 8: ${fromSq}`);
        return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
    }
    pawnSquareToJump = (file + '7') as Square;
    validDestinations = [(file + '6') as Square, (file + '5') as Square];
    intermediateSquareForFarDest = (file + '6') as Square;
  }

  const pawnPiece = game.get(pawnSquareToJump);
  if (!pawnPiece || pawnPiece.type !== 'p' || pawnPiece.color !== playerColor) {
    console.warn(`[CornerBlitzServer] No friendly pawn found at ${pawnSquareToJump} to jump over. Found:`, pawnPiece);
    return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
  }

  if (!validDestinations.includes(toSq)) {
    console.warn(`[CornerBlitzServer] Invalid destination ${toSq}. Valid are: ${validDestinations.join(', ')}`);
    return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
  }

  // If moving to the "far" destination (e.g., a1 to a4), the intermediate square (a3) must be empty.
  if (toSq === validDestinations[1]) { 
    const pieceOnIntermediateSquare = game.get(intermediateSquareForFarDest);
    if (pieceOnIntermediateSquare) {
      console.warn(`[CornerBlitzServer] Intermediate square ${intermediateSquareForFarDest} for far jump to ${toSq} is not empty. Found:`, pieceOnIntermediateSquare);
      return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
    }
  }

  const pieceOnToSquareBeforeMove = game.get(toSq); // Check before any modifications
  if (pieceOnToSquareBeforeMove && pieceOnToSquareBeforeMove.color === playerColor) {
    console.warn(`[CornerBlitzServer] Destination square ${toSq} occupied by a friendly piece.`);
    return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
  }
  const isCapture = !!pieceOnToSquareBeforeMove && pieceOnToSquareBeforeMove.color !== playerColor;

  // 3. Perform Operations and FEN Reconstruction
  // The 'game' instance IS the main serverGame from socketHandlers, loaded with currentFen.
  // Perform operations, then if anything fails or FEN is bad, load(currentFen) to revert.

  game.remove(fromSq);             // Remove rook from starting square
  game.remove(pawnSquareToJump);   // Remove the jumped friendly pawn
  
  // If 'toSq' had an opponent's piece, it's captured. chess.js 'put' handles this.
  game.put({ type: 'r', color: playerColor }, toSq); // Place rook on destination

  // Construct FEN based on original FEN parts and new board state
  const originalFenParts = currentFen.split(' ');
  let newFenParts = game.fen().split(' '); // Base this on game.fen() for piece placement

  // [0] Piece placement - already handled by game.fen() after remove/put.
  // newFenParts[0] is from game.fen()

  // [1] Active color
  newFenParts[1] = playerColor === 'w' ? 'b' : 'w';

  // [2] Castling availability
  let newCastlingRights = originalFenParts[2];
  const castlingChars = { w: {a1: 'Q', h1: 'K'}, b: {a8: 'q', h8: 'k'} };
  if (playerColor === 'w') {
    if (fromSq === 'a1') newCastlingRights = newCastlingRights.replace(castlingChars.w.a1, '');
    if (fromSq === 'h1') newCastlingRights = newCastlingRights.replace(castlingChars.w.h1, '');
  } else {
    if (fromSq === 'a8') newCastlingRights = newCastlingRights.replace(castlingChars.b.a8, '');
    if (fromSq === 'h8') newCastlingRights = newCastlingRights.replace(castlingChars.b.h8, '');
  }
  // Clean up castling string
  let finalCastling = "";
  if (newCastlingRights.includes('K')) finalCastling += 'K';
  if (newCastlingRights.includes('Q')) finalCastling += 'Q';
  if (newCastlingRights.includes('k')) finalCastling += 'k';
  if (newCastlingRights.includes('q')) finalCastling += 'q';
  newFenParts[2] = finalCastling === '' ? '-' : finalCastling;


  // [3] En passant target square - always reset by non-pawn moves/jumps
  newFenParts[3] = '-';

  // [4] Halfmove clock
  const originalHalfmoves = parseInt(originalFenParts[4], 10) || 0;
  newFenParts[4] = isCapture ? '0' : (originalHalfmoves + 1).toString();

  // [5] Fullmove number
  const originalFullmoves = parseInt(originalFenParts[5], 10) || 1;
  if (playerColor === 'b') {
    newFenParts[5] = (originalFullmoves + 1).toString();
  } else {
    newFenParts[5] = originalFullmoves.toString(); 
  }

  const constructedFen = newFenParts.join(' ');
  
  try {
    // Validate the constructed FEN by loading it into the game instance.
    // This updates 'game' to the new state.
    game.load(constructedFen); 
    
    // Additional check: if chess.js "corrected" the FEN, it might indicate an issue.
    if (game.fen() !== constructedFen) {
        console.warn(`[CornerBlitzServer] FEN mismatch after load. Expected: "${constructedFen}", Got: "${game.fen()}". Reverting.`);
        game.load(currentFen); // Revert
        return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
    }

  } catch (e) {
    console.error(`[CornerBlitzServer] CRITICAL: Error loading constructed FEN "${constructedFen}": ${e}. Reverting.`);
    game.load(currentFen); // Revert
    return { moveResult: null, nextFen: currentFen, advantageStateUpdated: initialRooksState };
  }

  // If successful:
  const moveResultObject: Move = {
    color: playerColor,
    from: fromSq,
    to: toSq,
    flags: isCapture ? 'c' : 'n',
    piece: 'r',
    san: `R${fromSq[0]}${isCapture ? 'x' : ''}${toSq}`, // SAN like Raxh3 or Rh1-h3
    lan: `${fromSq}${toSq}`,
    before: currentFen,
    after: game.fen(),
    isCapture: function (): boolean {
      throw new Error('Function not implemented.');
    },
    isPromotion: function (): boolean {
      throw new Error('Function not implemented.');
    },
    isEnPassant: function (): boolean {
      throw new Error('Function not implemented.');
    },
    isKingsideCastle: function (): boolean {
      throw new Error('Function not implemented.');
    },
    isQueensideCastle: function (): boolean {
      throw new Error('Function not implemented.');
    },
    isBigPawn: function (): boolean {
      throw new Error('Function not implemented.');
    }
  };
  if (isCapture && pieceOnToSquareBeforeMove) { 
    moveResultObject.captured = pieceOnToSquareBeforeMove.type;
  }
  
  const updatedRooksState = { ...initialRooksState, [rookKey]: true };
  console.log(`[CornerBlitzServer] Corner Blitz success: ${fromSq} to ${toSq}. Jumped ${pawnSquareToJump}. New FEN: ${game.fen()}`);
  return { moveResult: moveResultObject, nextFen: game.fen(), advantageStateUpdated: updatedRooksState };
}
