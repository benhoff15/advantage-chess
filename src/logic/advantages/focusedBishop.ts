import { Chess, Square, Color } from 'chess.js';

// Type for the special move object returned by handleFocusedBishopClient
export interface FocusedBishopClientMove {
  from: string;
  to: string;
  special: 'focused_bishop';
  color: 'white' | 'black';
  // Potentially add originalPiece: 'b' if needed for server validation clarity
}

interface HandleFocusedBishopClientParams {
  game: Chess; // The main game instance from ChessGame.tsx
  from: string;
  to: string;
  color: 'white' | 'black'; // Player's color
  hasUsedFocusedBishop: boolean; // From the useRef in ChessGame.tsx
}

export interface HandleFocusedBishopClientResult {
  moveData: FocusedBishopClientMove | null;
  advantageUsedAttempt: boolean; // Indicates if an attempt to use the advantage was made (triggers marking it as used)
}

export function handleFocusedBishopClient({
  game,
  from,
  to,
  color,
  hasUsedFocusedBishop,
}: HandleFocusedBishopClientParams): HandleFocusedBishopClientResult {
  if (hasUsedFocusedBishop) {
    return { moveData: null, advantageUsedAttempt: false };
  }

  const piece = game.get(from as Square);
  const playerChessJsColor = color === 'white' ? 'w' : 'b';

  if (!piece || piece.type !== 'b' || piece.color !== playerChessJsColor) {
    return { moveData: null, advantageUsedAttempt: false }; // Not the player's bishop
  }

  // Check if the move is a valid rook move (same rank or same file and path is clear)
  const fromSquare = from as Square;
  const toSquare = to as Square;
  let isValidRookMove = false;

  // Check if on the same rank or file
  if (fromSquare[0] === toSquare[0] || fromSquare[1] === toSquare[1]) {
    isValidRookMove = true;
    // Check for obstructions along the path
    const fileDiff = Math.abs(toSquare.charCodeAt(0) - fromSquare.charCodeAt(0));
    const rankDiff = Math.abs(parseInt(toSquare[1], 10) - parseInt(fromSquare[1], 10));
    const stepX = fromSquare.charCodeAt(0) === toSquare.charCodeAt(0) ? 0 : (toSquare.charCodeAt(0) > fromSquare.charCodeAt(0) ? 1 : -1);
    const stepY = fromSquare[1] === toSquare[1] ? 0 : (toSquare[1] > fromSquare[1] ? 1 : -1);
    
    let currentX = fromSquare.charCodeAt(0) + stepX;
    let currentY = parseInt(fromSquare[1], 10) + stepY;

    const maxSteps = Math.max(fileDiff, rankDiff);

    for (let i = 1; i < maxSteps; i++) {
      const currentPathSquare = String.fromCharCode(currentX) + currentY.toString();
      if (game.get(currentPathSquare as Square)) {
        isValidRookMove = false;
        break;
      }
      currentX += stepX;
      currentY += stepY;
    }
  }

  if (!isValidRookMove) {
    return { moveData: null, advantageUsedAttempt: false };
  }

  // If it's a valid rook-like move for the bishop
  const snapshot = game.fen(); // Snapshot before making changes

  // Manually update the game instance
  game.remove(fromSquare);
  game.put({ type: 'b', color: playerChessJsColor }, toSquare);

  // Reconstruct FEN (turn, castling rights, en passant, halfmove, fullmove)
  // This is a simplified FEN update; more robust would be like castleMaster
  let fenParts = game.fen().split(" ");
  // Update piece placement part based on current board state
   fenParts[0] = game.board().map(rank => {
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

  fenParts[1] = playerChessJsColor === 'w' ? 'b' : 'w'; // Switch turn
  // Castling rights might change if a rook or king *could* have moved from 'to' or 'from', but for a bishop move, it's unlikely.
  // For simplicity, we assume castling rights are not affected by this specific bishop move.
  // A truly robust solution would re-evaluate castling rights based on piece positions.
  // Taking from snapshot for safety, assuming this specific move doesn't alter them.
  const originalSnapshotFenParts = snapshot.split(' ');
  fenParts[2] = originalSnapshotFenParts[2]; 

  fenParts[3] = '-'; // En passant target square reset
  
  // Halfmove and fullmove clock update
  const originalHalfmoves = parseInt(originalSnapshotFenParts[4], 10) || 0;
  const originalFullmoves = parseInt(originalSnapshotFenParts[5], 10) || 1;

  fenParts[4] = (originalHalfmoves + 1).toString(); // Increment halfmove clock
  if (playerChessJsColor === 'b') { // If black moved
    fenParts[5] = (originalFullmoves + 1).toString(); // Increment fullmove number
  } else {
    fenParts[5] = originalFullmoves.toString();
  }
  const nextFen = fenParts.join(" ");

  try {
    game.load(nextFen);
    if (game.fen() !== nextFen) {
      // console.warn("FocusedBishop Client: FEN mismatch after load. Reverting.");
      game.load(snapshot); // Revert
      return { moveData: null, advantageUsedAttempt: true }; // Attempted, but FEN failed
    }
    
    const moveData: FocusedBishopClientMove = {
      from,
      to,
      special: 'focused_bishop',
      color,
    };
    return { moveData, advantageUsedAttempt: true };

  } catch (e) {
    // console.error("FocusedBishop Client: Error loading FEN. Reverting.", e);
    game.load(snapshot); // Revert
    return { moveData: null, advantageUsedAttempt: true }; // Attempted, but FEN load threw error
  }
}

// Type for applying opponent's Focused Bishop move
export interface OpponentFocusedBishopMove {
  from: string;
  to: string;
  special?: 'focused_bishop'; // Should be 'focused_bishop'
  color?: 'white' | 'black'; // Color of the opponent who made the move
}

// Strengthened applyFocusedBishopOpponentMove
export function applyFocusedBishopOpponentMove({
  game, // Client's game instance
  receivedMove,
}: { game: Chess; receivedMove: OpponentFocusedBishopMove }): boolean {
  console.log("[FocusedBishopOpponent] Applying move:", receivedMove);
  if (!receivedMove.color || !receivedMove.from || !receivedMove.to || receivedMove.special !== 'focused_bishop') {
    console.error("[FocusedBishopOpponent] Invalid Opponent Focused Bishop move data:", receivedMove);
    return false;
  }

  const opponentChessJsColor = receivedMove.color === 'white' ? 'w' : 'b'; // Color of the player who made the move
  const pieceToMove = game.get(receivedMove.from as Square);

  // It's the opponent's piece, so its type should be 'b' (bishop) and color should match opponent's
  if (!pieceToMove || pieceToMove.type !== 'b' || pieceToMove.color !== opponentChessJsColor) {
    console.error(
      `[FocusedBishopOpponent] Piece at ${receivedMove.from} is not opponent's bishop as expected. ` +
      `Actual: ${pieceToMove?.type}${pieceToMove?.color}. Expected: b${opponentChessJsColor}. FEN: ${game.fen()}`
    );
    // Don't return false immediately, server is authoritative. Try to apply if possible,
    // but this log is important for debugging desyncs.
  }
  
  const snapshot = game.fen();
  console.log(`[FocusedBishopOpponent] FEN before applying: ${snapshot}`);

  // Perform the piece movement on the local game instance
  const removedPiece = game.remove(receivedMove.from as Square);
  if (!removedPiece) {
      console.warn(`[FocusedBishopOpponent] No piece found at ${receivedMove.from} to remove. FEN: ${snapshot}`);
      // Proceeding, as server is authoritative, but this is a sign of desync
  }
  const putPiece = game.put({ type: 'b', color: opponentChessJsColor }, receivedMove.to as Square);
  if (!putPiece) {
      console.error(`[FocusedBishopOpponent] Failed to place bishop at ${receivedMove.to}. FEN: ${game.fen()}`);
      game.load(snapshot); // Revert
      return false;
  }

  // FEN Reconstruction:
  let fenParts = game.fen().split(" "); // Base FEN after put/remove (piece placement is updated)
  const originalFenParts = snapshot.split(' '); // For castling, halfmove, fullmove reference

  // 1. Piece placement - fenParts[0] is already correct from game.fen() after put/remove.

  // 2. Active color (turn) - should be the other player's turn now.
  fenParts[1] = opponentChessJsColor === 'w' ? 'b' : 'w';

  // 3. Castling availability (fenParts[2])
  // A bishop move typically does not affect castling rights. Preserve from original snapshot.
  fenParts[2] = originalFenParts[2];

  // 4. En passant target square (fenParts[3])
  fenParts[3] = '-'; // A non-pawn move always clears the en passant square.

  // 5. Halfmove clock (fenParts[4])
  const originalHalfmoves = parseInt(originalFenParts[4], 10) || 0;
  fenParts[4] = (originalHalfmoves + 1).toString(); // Increments for non-pawn, non-capture move

  // 6. Fullmove number (fenParts[5])
  const originalFullmoves = parseInt(originalFenParts[5], 10) || 1;
  if (opponentChessJsColor === 'b') { // If Black (opponent) made the move
    fenParts[5] = (originalFullmoves + 1).toString();
  } else { // If White (opponent) made the move, fullmove number doesn't change yet for the next player (current player)
    fenParts[5] = originalFullmoves.toString();
  }
  
  const newFen = fenParts.join(" ");
  console.log(`[FocusedBishopOpponent] Constructed FEN: ${newFen} (from pre-move FEN: ${snapshot})`);

  try {
    game.load(newFen); // Load the reconstructed FEN
    if (game.fen() !== newFen) {
        console.warn(`[FocusedBishopOpponent] FEN mismatch after load. Loaded: ${game.fen()}, Expected: ${newFen}. Reverting.`);
        game.load(snapshot); // Revert to snapshot
        return false;
    }
    console.log(`[FocusedBishopOpponent] Successfully applied. New FEN: ${game.fen()}`);
    return true; // Game state changed and FEN loaded
  } catch (e) {
    console.error("[FocusedBishopOpponent] Error loading reconstructed FEN. Reverting.", e, "Attempted FEN:", newFen);
    game.load(snapshot); // Revert to snapshot
    return false;
  }
}
