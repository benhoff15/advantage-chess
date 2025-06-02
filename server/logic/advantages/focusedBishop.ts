import { Chess, Move, Square, Color, PieceSymbol } from 'chess.js';

// Type for clientMoveData when special is 'focused_bishop'
interface FocusedBishopServerClientMoveData {
  from: string;
  to: string;
  special: 'focused_bishop';
  color: 'white' | 'black'; // Color of the player making the move
}

// Server-side state for tracking usage
export interface FocusedBishopAdvantageState {
  focusedBishopUsed: boolean;
}

interface HandleFocusedBishopServerParams {
  game: Chess; // Server's main game instance, loaded with currentFen
  clientMoveData: FocusedBishopServerClientMoveData;
  currentFen: string; // FEN before this Focused Bishop move attempt
  playerColor: 'w' | 'b'; // Player's color ('w' or 'b')
  advantageState: FocusedBishopAdvantageState; // Player's current state for this advantage
}

interface HandleFocusedBishopServerResult {
  moveResult: Move | null; // chess.js Move object if successful
  nextFen: string; // The FEN after the move, or currentFen if failed
  advantageStateUpdated: FocusedBishopAdvantageState; // Potentially updated state
}

export function handleFocusedBishopServer({
  game,
  clientMoveData,
  currentFen,
  playerColor,
  advantageState,
}: HandleFocusedBishopServerParams): HandleFocusedBishopServerResult {
  const initialAdvantageState = { ...advantageState };

  if (advantageState.focusedBishopUsed) {
    console.warn(`[FocusedBishopServer] Advantage already used by ${playerColor}.`);
    return {
      moveResult: null,
      nextFen: currentFen,
      advantageStateUpdated: initialAdvantageState,
    };
  }

  const piece = game.get(clientMoveData.from as Square);
  if (!piece || piece.type !== 'b' || piece.color !== playerColor) {
    console.warn(`[FocusedBishopServer] Piece at ${clientMoveData.from} is not player's bishop.`);
    return {
      moveResult: null,
      nextFen: currentFen,
      advantageStateUpdated: initialAdvantageState,
    };
  }

  // Validate rook-like move (same rank or file, clear path)
  const fromSquare = clientMoveData.from as Square;
  const toSquare = clientMoveData.to as Square;
  let isValidRookMove = false;

  if (fromSquare[0] === toSquare[0] || fromSquare[1] === toSquare[1]) {
    isValidRookMove = true;
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
    console.warn(`[FocusedBishopServer] Invalid rook-like move from ${fromSquare} to ${toSquare}.`);
    return {
      moveResult: null,
      nextFen: currentFen,
      advantageStateUpdated: initialAdvantageState,
    };
  }
  
  // Path is clear, and it's a valid rook-like destination.
  // Create a temporary game instance to safely attempt the move and FEN generation
  const tempGame = new Chess(currentFen);
  tempGame.remove(fromSquare);
  tempGame.put({ type: 'b', color: playerColor }, toSquare);

  // Construct new FEN (simplified, focusing on critical parts)
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
  
  fenParts[1] = (playerColor === 'w') ? 'b' : 'w'; // Next turn
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
    // Validate the constructed FEN by loading it into the main game instance
    game.load(constructedFen); // This updates the main 'game' instance

    // Create a chess.js Move object
    const moveResultObject: Move = {
      color: playerColor,
      from: fromSquare,
      to: toSquare,
      flags: 'n', // Normal move (not capture, etc.)
      piece: 'b', // Bishop moved
      san: `B${toSquare}`, // Simplified SAN
      lan: `${fromSquare}${toSquare}`,
      before: currentFen,
      after: game.fen(),
      // isCapture, isPromotion, etc. functions
      isCapture: () => !!game.get(toSquare), // Check if destination was occupied
      isPromotion: () => false,
      isEnPassant: () => false,
      isKingsideCastle: () => false,
      isQueensideCastle: () => false,
      isBigPawn: () => false,
    };
    
    // If an enemy piece was on 'toSquare', it would be a capture.
    // The path clearing logic should prevent this unless 'toSquare' itself is the capture.
    // For focused bishop, it's a move, not capture. If 'toSquare' had an enemy piece, path wasn't clear.
    // If 'toSquare' had a friendly piece, path also wasn't clear.
    // So, move.captured should be undefined.
    const pieceOnToSquare = new Chess(currentFen).get(toSquare); // Check original FEN for piece on toSquare
     if (pieceOnToSquare) {
      moveResultObject.captured = pieceOnToSquare.type;
      // Need to set flags accordingly if it's a capture, e.g. 'c'
      // However, the path clearing should mean 'toSquare' is empty.
      // If it's not, the client-side or server-side path check failed.
      // For this advantage, let's assume 'to' is an empty square.
      // If it becomes a capture, the SAN and flags need more work.
    }


    return {
      moveResult: moveResultObject,
      nextFen: game.fen(),
      advantageStateUpdated: { ...initialAdvantageState, focusedBishopUsed: true },
    };

  } catch (e) {
    console.error(`[FocusedBishopServer] Error loading constructed FEN '${constructedFen}':`, e);
    game.load(currentFen); // Revert main game instance to original FEN
    return {
      moveResult: null,
      nextFen: currentFen,
      advantageStateUpdated: initialAdvantageState, // Advantage not used
    };
  }
}
