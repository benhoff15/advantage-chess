import { Chess, Square, Color, PieceSymbol, Move } from 'chess.js'; // Added PieceSymbol and Move

export interface CornerBlitzClientMove {
  from: string;
  to: string;
  special: 'corner_blitz';
  color: 'white' | 'black';
}

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
  playerRooksMoved: PlayerRooksMovedState;
}

export interface HandleCornerBlitzClientResult {
  moveData: CornerBlitzClientMove | null;
  rookMovedKey: keyof PlayerRooksMovedState | null; 
}

export function handleCornerBlitzClient({
  game,
  from,
  to,
  color,
  playerRooksMoved,
}: HandleCornerBlitzClientParams): HandleCornerBlitzClientResult {
  const fromSq = from as Square;
  const toSq = to as Square;
  const playerChessJsColor = color === 'white' ? 'w' : 'b';

  const pieceAtFrom = game.get(fromSq);
  if (!pieceAtFrom || pieceAtFrom.type !== 'r' || pieceAtFrom.color !== playerChessJsColor) {
    console.log('[CornerBlitzClient] Selected piece is not the player\'s rook.');
    return { moveData: null, rookMovedKey: null };
  }

  const rookKey = fromSq as keyof PlayerRooksMovedState;
  const validStartingSquares: ReadonlyArray<Square> = playerChessJsColor === 'w' ? ['a1', 'h1'] : ['a8', 'h8'];

  if (!validStartingSquares.includes(fromSq) || playerRooksMoved[rookKey]) {
    console.log(`[CornerBlitzClient] Rook ${fromSq} not eligible or already blitzed.`);
    return { moveData: null, rookMovedKey: rookKey }; 
  }

  if (fromSq[0] !== toSq[0]) { 
    console.log('[CornerBlitzClient] Corner Blitz move must be along the same file.');
    return { moveData: null, rookMovedKey: rookKey };
  }

  let pawnSquareToJump: Square;
  let validDestinations: [Square, Square]; 
  let intermediateSquareForFarDest: Square;
  const file = fromSq[0];

  if (playerChessJsColor === 'w') {
    if (fromSq[1] !== '1') return { moveData: null, rookMovedKey: rookKey }; 
    pawnSquareToJump = (file + '2') as Square;
    validDestinations = [(file + '3') as Square, (file + '4') as Square];
    intermediateSquareForFarDest = (file + '3') as Square;
  } else { 
    if (fromSq[1] !== '8') return { moveData: null, rookMovedKey: rookKey }; 
    pawnSquareToJump = (file + '7') as Square;
    validDestinations = [(file + '6') as Square, (file + '5') as Square];
    intermediateSquareForFarDest = (file + '6') as Square;
  }

  const pawnToJump = game.get(pawnSquareToJump);
  if (!pawnToJump || pawnToJump.type !== 'p' || pawnToJump.color !== playerChessJsColor) {
    console.log(`[CornerBlitzClient] No friendly pawn at ${pawnSquareToJump} to jump.`);
    return { moveData: null, rookMovedKey: rookKey };
  }

  if (!validDestinations.includes(toSq)) {
    console.log(`[CornerBlitzClient] Invalid destination ${toSq}. Valid are ${validDestinations.join(', ')}.`);
    return { moveData: null, rookMovedKey: rookKey };
  }

  if (toSq === validDestinations[1]) {
    const pieceOnIntermediate = game.get(intermediateSquareForFarDest);
    if (pieceOnIntermediate) {
      console.log(`[CornerBlitzClient] Intermediate square ${intermediateSquareForFarDest} for far jump is not empty.`);
      return { moveData: null, rookMovedKey: rookKey };
    }
  }

  const pieceOnToSquare = game.get(toSq);
  if (pieceOnToSquare && pieceOnToSquare.color === playerChessJsColor) {
    console.log('[CornerBlitzClient] Destination square occupied by a friendly piece.');
    return { moveData: null, rookMovedKey: rookKey };
  }
  const isCapture = !!pieceOnToSquare && pieceOnToSquare.color !== playerChessJsColor;

  const snapshot = game.fen();
  console.log(`[CornerBlitzClient] FEN before local update: ${snapshot}`);

  game.remove(fromSq);
  game.remove(pawnSquareToJump);
  game.put({ type: 'r', color: playerChessJsColor }, toSq);

  let fenParts = game.fen().split(' '); 
  const originalFenParts = snapshot.split(' '); 

  fenParts[1] = playerChessJsColor === 'w' ? 'b' : 'w';

  let currentCastling = originalFenParts[2];
  const castlingChars = { w: {a1: 'Q', h1: 'K'}, b: {a8: 'q', h8: 'k'} };
  if (playerChessJsColor === 'w') {
    if (fromSq === 'a1') currentCastling = currentCastling.replace(castlingChars.w.a1, '');
    if (fromSq === 'h1') currentCastling = currentCastling.replace(castlingChars.w.h1, '');
  } else { 
    if (fromSq === 'a8') currentCastling = currentCastling.replace(castlingChars.b.a8, '');
    if (fromSq === 'h8') currentCastling = currentCastling.replace(castlingChars.b.h8, '');
  }
  let finalCastling = "";
  if (currentCastling.includes('K')) finalCastling += 'K';
  if (currentCastling.includes('Q')) finalCastling += 'Q';
  if (currentCastling.includes('k')) finalCastling += 'k';
  if (currentCastling.includes('q')) finalCastling += 'q';
  fenParts[2] = finalCastling === '' ? '-' : finalCastling;

  fenParts[3] = '-';

  const originalHalfmoves = parseInt(originalFenParts[4], 10) || 0;
  fenParts[4] = isCapture ? '0' : (originalHalfmoves + 1).toString();

  const originalFullmoves = parseInt(originalFenParts[5], 10) || 1;
  if (playerChessJsColor === 'b') {
    fenParts[5] = (originalFullmoves + 1).toString();
  } else {
    fenParts[5] = originalFullmoves.toString();
  }
  
  const nextFen = fenParts.join(' ');
  console.log(`[CornerBlitzClient] Constructed FEN: ${nextFen}`);

  try {
    game.load(nextFen); 
    if (game.fen() !== nextFen) {
      console.warn(`[CornerBlitzClient] FEN mismatch after load. Loaded: ${game.fen()}, Expected: ${nextFen}. Reverting.`);
      game.load(snapshot); 
      return { moveData: null, rookMovedKey: rookKey };
    }
    
    console.log(`[CornerBlitzClient] FEN load successful. Final FEN: ${game.fen()}`);
    const moveData: CornerBlitzClientMove = { from, to, special: 'corner_blitz', color };
    return { moveData, rookMovedKey: rookKey };

  } catch (e) {
    console.error('[CornerBlitzClient] Error loading constructed FEN. Reverting.', e, 'Attempted FEN:', nextFen);
    game.load(snapshot); 
    return { moveData: null, rookMovedKey: rookKey };
  }
}

export interface OpponentCornerBlitzMoveData {
    from: string; 
    to: string;
    special?: 'corner_blitz'; 
    color?: 'white' | 'black'; 
}

export function applyCornerBlitzOpponentMove({
  game,
  receivedMove,
}: { game: Chess; receivedMove: OpponentCornerBlitzMoveData }): boolean {
  console.log('[CornerBlitzOpponent] Applying move:', receivedMove);
  if (!receivedMove.color || !receivedMove.from || !receivedMove.to || receivedMove.special !== 'corner_blitz') {
    console.error('[CornerBlitzOpponent] Invalid data for opponent Corner Blitz:', receivedMove);
    return false;
  }

  const opponentChessJsColor = receivedMove.color === 'white' ? 'w' : 'b';
  const fromSq = receivedMove.from as Square;
  const toSq = receivedMove.to as Square;

  let jumpedPawnSquare: Square;
  const file = fromSq[0];
  if (opponentChessJsColor === 'w') {
    if (fromSq[1] !== '1') { console.error('[CornerBlitzOpponent] Opponent white rook not on rank 1.'); return false; }
    jumpedPawnSquare = (file + '2') as Square;
  } else { 
    if (fromSq[1] !== '8') { console.error('[CornerBlitzOpponent] Opponent black rook not on rank 8.'); return false; }
    jumpedPawnSquare = (file + '7') as Square;
  }

  const snapshot = game.fen();
  console.log(`[CornerBlitzOpponent] FEN before applying opponent move: ${snapshot}`);

  const pieceOnToSquareBeforeMove = game.get(toSq);
  const isCapture = !!pieceOnToSquareBeforeMove && pieceOnToSquareBeforeMove.color !== opponentChessJsColor;

  game.remove(fromSq);
  const pawnBeingJumped = game.get(jumpedPawnSquare);
  if (!pawnBeingJumped || pawnBeingJumped.type !== 'p' || pawnBeingJumped.color !== opponentChessJsColor) {
      console.error(`[CornerBlitzOpponent] Expected opponent pawn at ${jumpedPawnSquare} but found:`, pawnBeingJumped, `Skipping its removal. FEN: ${game.fen()}`);
      game.load(snapshot); return false; 
  }
  game.remove(jumpedPawnSquare); 
  game.put({ type: 'r', color: opponentChessJsColor }, toSq);

  let fenParts = game.fen().split(' ');
  const originalFenParts = snapshot.split(' ');

  fenParts[1] = opponentChessJsColor === 'w' ? 'b' : 'w'; 

  let currentCastling = originalFenParts[2];
  const castlingChars = { w: {a1: 'Q', h1: 'K'}, b: {a8: 'q', h8: 'k'} };
    if (opponentChessJsColor === 'w') {
        if (fromSq === 'a1') currentCastling = currentCastling.replace(castlingChars.w.a1, '');
        if (fromSq === 'h1') currentCastling = currentCastling.replace(castlingChars.w.h1, '');
    } else {
        if (fromSq === 'a8') currentCastling = currentCastling.replace(castlingChars.b.a8, '');
        if (fromSq === 'h8') currentCastling = currentCastling.replace(castlingChars.b.h8, '');
    }
    let finalCastling = "";
    if (currentCastling.includes('K')) finalCastling += 'K';
    if (currentCastling.includes('Q')) finalCastling += 'Q';
    if (currentCastling.includes('k')) finalCastling += 'k';
    if (currentCastling.includes('q')) finalCastling += 'q';
    fenParts[2] = finalCastling === '' ? '-' : finalCastling;

  fenParts[3] = '-'; 

  const originalHalfmoves = parseInt(originalFenParts[4], 10) || 0;
  fenParts[4] = isCapture ? '0' : (originalHalfmoves + 1).toString();

  const originalFullmoves = parseInt(originalFenParts[5], 10) || 1;
  if (opponentChessJsColor === 'b') { 
    fenParts[5] = (originalFullmoves + 1).toString();
  } else {
    fenParts[5] = originalFullmoves.toString();
  }
  
  const newFen = fenParts.join(' ');
  console.log(`[CornerBlitzOpponent] Constructed FEN for opponent move: ${newFen}`);

  try {
    game.load(newFen);
    if (game.fen() !== newFen) {
      console.warn(`[CornerBlitzOpponent] FEN mismatch. Loaded: ${game.fen()}, Expected: ${newFen}. Reverting.`);
      game.load(snapshot); return false;
    }
    console.log(`[CornerBlitzOpponent] Success applying opponent move. New FEN: ${game.fen()}`);
    return true;
  } catch (e) {
    console.error('[CornerBlitzOpponent] Error loading FEN for opponent move. Reverting.', e);
    game.load(snapshot); return false;
  }
}
