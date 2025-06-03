import { Chess, Move, Square, PieceSymbol } from 'chess.js';
import { RoyalEscortState } from '../../../shared/types'; // Adjusted path

// Helper function for coordinate conversion
function getSquareCoordinates(square: Square): { row: number; col: number } {
  const col = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const row = parseInt(square.substring(1), 10) - 1;
  return { row, col };
}

// Helper to generate board part of FEN
function generateFenBoard(board: ({ type: PieceSymbol; color: 'w' | 'b'; square: Square; } | null)[][]): string {
    return board.map(rank => {
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
}

export interface RoyalEscortServerMoveData {
  from: string;
  to: string;
  special?: 'royal_escort';
  color: 'white' | 'black';
}

interface ValidateRoyalEscortServerMoveParams {
  game: Chess;
  clientMoveData: RoyalEscortServerMoveData;
  playerColor: 'w' | 'b';
  royalEscortState: RoyalEscortState;
}

export interface ValidateRoyalEscortServerMoveResult {
  moveResult: Move | null;
  nextFen: string;
  updatedRoyalEscortState?: RoyalEscortState;
}

export function validateRoyalEscortServerMove({
  game,
  clientMoveData,
  playerColor,
  royalEscortState,
}: ValidateRoyalEscortServerMoveParams): ValidateRoyalEscortServerMoveResult {
  const currentFen = game.fen();

  if (clientMoveData.special !== 'royal_escort' || clientMoveData.color[0] !== playerColor) {
    return { moveResult: null, nextFen: currentFen };
  }

  const fromSquare = clientMoveData.from as Square;
  const toSquare = clientMoveData.to as Square;

  const piece = game.get(fromSquare);
  if (!piece || piece.type !== 'k' || piece.color !== playerColor) {
    return { moveResult: null, nextFen: currentFen };
  }

  if (royalEscortState.usedCount >= 3) {
    return { moveResult: null, nextFen: currentFen };
  }

  // Basic validation for 'to' square format
  const validSquarePattern = /^[a-h][1-8]$/;
  if (!validSquarePattern.test(clientMoveData.to) || !validSquarePattern.test(clientMoveData.from)) {
      return { moveResult: null, nextFen: currentFen };
  }
   if (clientMoveData.from === clientMoveData.to) {
      return { moveResult: null, nextFen: currentFen };
  }

  const fromCoords = getSquareCoordinates(fromSquare);
  const toCoords = getSquareCoordinates(toSquare);
  const rowDiff = Math.abs(fromCoords.row - toCoords.row);
  const colDiff = Math.abs(fromCoords.col - toCoords.col);

  const isValidTwoSquareMove =
    (rowDiff === 2 && colDiff === 0) ||
    (rowDiff === 0 && colDiff === 2) ||
    (rowDiff === 2 && colDiff === 2);

  if (!isValidTwoSquareMove) {
    return { moveResult: null, nextFen: currentFen };
  }

  const pieceOnToSquare = game.get(toSquare);
  if (pieceOnToSquare && pieceOnToSquare.color === playerColor) {
    return { moveResult: null, nextFen: currentFen }; // Cannot capture friendly piece
  }

  // Simulate move for validation (check, etc.)
  const tempGame = new Chess(currentFen);
  
  // Determine if it's a capture before applying the move on tempGame
  const capturedPieceDetails = tempGame.get(toSquare);
  let isCapture = false;
  let capturedType: PieceSymbol | undefined = undefined;
  if (capturedPieceDetails && capturedPieceDetails.color !== playerColor) {
      isCapture = true;
      capturedType = capturedPieceDetails.type;
  }


  tempGame.remove(fromSquare);
  tempGame.put({ type: 'k', color: playerColor }, toSquare);

  // Construct intermediate FEN to check if player's king is attacked
  // This FEN has the current player's turn, to check their own king's safety
  const currentFenParts = currentFen.split(" ");
  let intermediateFen = `${generateFenBoard(tempGame.board())} ${playerColor}`;
  
  let castlingRights = currentFenParts[2];
  if (playerColor === 'w') {
    castlingRights = castlingRights.replace(/K/g, '').replace(/Q/g, '');
  } else {
    castlingRights = castlingRights.replace(/k/g, '').replace(/q/g, '');
  }
  intermediateFen += ` ${castlingRights === '' ? '-' : castlingRights}`;
  intermediateFen += ` -`; // En passant
  intermediateFen += ` 0`; // Halfmove clock
  intermediateFen += ` ${currentFenParts[5]}`; // Fullmove number (from current FEN)

  const kingSafetyCheckGame = new Chess();
  try {
    kingSafetyCheckGame.load(intermediateFen);
    if (kingSafetyCheckGame.fen() !== intermediateFen) {
      console.error("Royal Escort Server: intermediateFen FEN mismatch after load.", { constructedFen: intermediateFen, loadedFen: kingSafetyCheckGame.fen() });
      return { moveResult: null, nextFen: currentFen };
    }
  } catch (e) {
    console.error("Royal Escort Server: Error loading intermediateFen.", { fen: intermediateFen, error: e });
    return { moveResult: null, nextFen: currentFen }; // FEN invalid
  }

  // Check if the king is attacked on its new square
  const kingToCheckSquare = toSquare; // The king was just moved to 'toSquare' in the simulation
  const opponentColor = playerColor === 'w' ? 'b' : 'w';
  if (kingSafetyCheckGame.isAttacked(kingToCheckSquare, opponentColor)) {
    // Move puts own king in check
    return { moveResult: null, nextFen: currentFen };
  }

  // All checks passed, apply to the main game instance
  // The piece on 'toSquare' (if any) is captured here implicitly by 'put'
  game.remove(fromSquare);
  game.put({ type: 'k', color: playerColor }, toSquare);

  // Construct final FEN for the game state after the move
  let finalFenParts = game.fen().split(" "); // Start with current game's FEN parts, then override
  finalFenParts[0] = generateFenBoard(game.board());
  finalFenParts[1] = playerColor === 'w' ? 'b' : 'w'; // Switch turn
  finalFenParts[2] = castlingRights === '' ? '-' : castlingRights; // Use updated castling rights
  finalFenParts[3] = '-'; // En passant
  finalFenParts[4] = '0'; // Halfmove clock reset
  if (playerColor === 'b') { // If Black moved, increment fullmove number
    finalFenParts[5] = (parseInt(currentFenParts[5], 10) + 1).toString();
  } else {
    finalFenParts[5] = currentFenParts[5]; // White moved, fullmove number is from current FEN
  }
  const nextFen = finalFenParts.join(" ");

  try {
    game.load(nextFen);
    if (game.fen() !== nextFen) {
      console.error("Server: Failed to load final FEN or FEN mismatch after Royal Escort.", { constructedFen: nextFen, loadedFen: game.fen() });
      game.load(currentFen); // Revert
      return { moveResult: null, nextFen: currentFen };
    }
  } catch (e) {
    console.error("Server: Error loading final FEN for Royal Escort.", { fen: nextFen, error: e });
    game.load(currentFen); // Revert
    return { moveResult: null, nextFen: currentFen };
  }

  let san = `K${clientMoveData.to}`;
  let flags = 'n'; // Normal move
  if (isCapture) {
    san = `Kx${clientMoveData.to}`; // Simplified SAN for king capture
    flags = 'c'; // Capture
  }
  
  const moveResult: Move = {
    color: playerColor,
    from: fromSquare,
    to: toSquare,
    flags: flags,
    piece: 'k',
    san: san,
    lan: `${clientMoveData.from}${clientMoveData.to}`, // LAN format
    before: currentFen,
    after: game.fen(),
    captured: capturedType,
    // Explicitly define boolean methods for Move interface if not automatically handled by Chess.js type
    isCapture: () => isCapture,
    isPromotion: () => false,
    isEnPassant: () => false,
    isKingsideCastle: () => false,
    isQueensideCastle: () => false,
    isBigPawn: () => false,
  };

  const updatedRoyalEscortState: RoyalEscortState = {
    ...royalEscortState,
    usedCount: royalEscortState.usedCount + 1,
  };

  return { moveResult, nextFen: game.fen(), updatedRoyalEscortState };
}
