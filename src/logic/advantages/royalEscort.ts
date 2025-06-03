import { Chess, Square, PieceSymbol } from 'chess.js';
import { RoyalEscortState } from '../../../shared/types';

// Helper function for coordinate conversion
function getSquareCoordinates(square: Square): { row: number; col: number } {
  const col = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const row = parseInt(square.substring(1), 10) - 1;
  return { row, col };
}

export interface RoyalEscortClientMove {
  from: string;
  to: string;
  special: 'royal_escort';
  color: 'white' | 'black';
}

interface HandleRoyalEscortClientParams {
  game: Chess;
  from: string;
  to: string;
  color: 'white' | 'black';
  royalEscortState: RoyalEscortState;
}

export interface HandleRoyalEscortClientResult {
  moveData: RoyalEscortClientMove | null;
  attempted: boolean; // True if a Royal Escort move was attempted
}

// Helper to generate board part of FEN
function generateFenBoard(board: (({ type: PieceSymbol; color: 'w' | 'b'; square: Square; } | null)[])[]): string {
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


export function handleRoyalEscortClient({
  game,
  from,
  to,
  color,
  royalEscortState,
}: HandleRoyalEscortClientParams): HandleRoyalEscortClientResult {
  const piece = game.get(from as Square);
  const playerColorChar = color[0] as 'w' | 'b';

  if (!piece || piece.type !== 'k' || piece.color !== playerColorChar) {
    return { moveData: null, attempted: false };
  }

  if (royalEscortState.usedCount >= 3) {
    return { moveData: null, attempted: false };
  }

  // Basic validation for 'to' square format
  const validSquarePattern = /^[a-h][1-8]$/;
  if (!validSquarePattern.test(to)) {
      return { moveData: null, attempted: true }; // Attempted an off-board move format
  }
  if (from === to) {
      return { moveData: null, attempted: false }; // Cannot move to the same square
  }

  const fromCoords = getSquareCoordinates(from as Square);
  const toCoords = getSquareCoordinates(to as Square);
  const rowDiff = Math.abs(fromCoords.row - toCoords.row);
  const colDiff = Math.abs(fromCoords.col - toCoords.col);

  const isValidTwoSquareMove =
    (rowDiff === 2 && colDiff === 0) ||
    (rowDiff === 0 && colDiff === 2) ||
    (rowDiff === 2 && colDiff === 2);

  if (!isValidTwoSquareMove) {
    return { moveData: null, attempted: false };
  }

  const pieceOnToSquare = game.get(to as Square);
  if (pieceOnToSquare && pieceOnToSquare.color === playerColorChar) {
    return { moveData: null, attempted: true }; // Cannot capture friendly piece
  }

  const snapshot = game.fen();
  const tempGameForValidation = new Chess(snapshot);
  const kingPiece: PieceSymbol = 'k';

  // 1. Simulate move on a temporary board for validation
  tempGameForValidation.remove(from as Square);
  tempGameForValidation.put({ type: kingPiece, color: playerColorChar }, to as Square);

  // 2. Check if this move puts the current player's king in check.
  // Construct FEN representing the state *after* the move, but *before* the turn switches.
  const currentFenParts = tempGameForValidation.fen().split(" "); // game.fen() still has current player's turn
  let checkKingSafetyFen = `${generateFenBoard(tempGameForValidation.board())} ${playerColorChar}`; // Board state + current player's turn

  let castlingRights = currentFenParts[2];
  if (playerColorChar === 'w') {
    castlingRights = castlingRights.replace(/K/g, '').replace(/Q/g, '');
  } else {
    castlingRights = castlingRights.replace(/k/g, '').replace(/q/g, '');
  }
  checkKingSafetyFen += ` ${castlingRights === '' ? '-' : castlingRights}`;
  checkKingSafetyFen += ` -`; // En passant
  checkKingSafetyFen += ` 0`; // Halfmove clock
  checkKingSafetyFen += ` ${currentFenParts[5]}`; // Fullmove number (unchanged for this check)

  const kingSafetyCheckGame = new Chess();
  try {
    kingSafetyCheckGame.load(checkKingSafetyFen);
    if (kingSafetyCheckGame.fen() !== checkKingSafetyFen) {
      console.error("Client Royal Escort: checkKingSafetyFen FEN mismatch.", { constructed: checkKingSafetyFen, loaded: kingSafetyCheckGame.fen() });
      return { moveData: null, attempted: true };
    }
  } catch (e) {
    console.error("Client Royal Escort: Error loading checkKingSafetyFen.", { fen: checkKingSafetyFen, error: e });
    return { moveData: null, attempted: true };
  }

  const opponentColorChar = playerColorChar === 'w' ? 'b' : 'w';
  if (kingSafetyCheckGame.isAttacked(to as Square, opponentColorChar)) {
    // Move puts own king in check
    return { moveData: null, attempted: true };
  }

  // 3. Construct the final FEN for the tempGame with turn switched, etc.
  // This is to ensure the overall FEN is valid for chess.js
  let finalTempFenParts = currentFenParts.slice(); // Create a copy
  finalTempFenParts[0] = generateFenBoard(tempGameForValidation.board());
  finalTempFenParts[1] = playerColorChar === 'w' ? 'b' : 'w'; // Switch turn
  finalTempFenParts[2] = castlingRights === '' ? '-' : castlingRights; // Use updated castling
  finalTempFenParts[3] = '-'; // En passant
  finalTempFenParts[4] = '0'; // Halfmove clock
  // Fullmove number increments if black made the move.
  // Here, 'color' is the player making the move.
  if (playerColorChar === 'b') {
    finalTempFenParts[5] = (parseInt(finalTempFenParts[5], 10) + 1).toString();
  }
  const finalTempNewFen = finalTempFenParts.join(" ");
  
  const tempGameForLoadTest = new Chess(); // Use a fresh instance for load test
  try {
    tempGameForLoadTest.load(finalTempNewFen);
    if (tempGameForLoadTest.fen() !== finalTempNewFen) {
      console.error("Client Royal Escort: finalTempNewFen FEN mismatch.");
      return { moveData: null, attempted: true };
    }
  } catch (e) {
    console.error("Client Royal Escort: Error loading finalTempNewFen.", { fen: finalTempNewFen, error: e });
    return { moveData: null, attempted: true };
  }
  // No need to check isKingAttacked on tempGameForLoadTest, already did safety check.

  // If all checks pass, apply to the actual game instance
  game.remove(from as Square);
  game.put({ type: kingPiece, color: playerColorChar }, to as Square);
  
  // Construct final FEN for the main game instance
  // This FEN is what will be used by the game
  // const gameFen = finalTempNewFen; // We can reuse the FEN validated by tempGameForLoadTest - gameFen is finalTempNewFen

  try {
    game.load(finalTempNewFen); 
    if (game.fen() !== finalTempNewFen) {
       console.error("Client Royal Escort: Main game FEN mismatch after load.");
       game.load(snapshot); // Revert on critical failure
       return { moveData: null, attempted: true };
    }
  } catch (e) {
    console.error("Client Royal Escort: Error loading finalTempNewFen to main game.", { fen: finalTempNewFen, error: e });
    game.load(snapshot); // Revert on critical failure
    return { moveData: null, attempted: true };
  }

  return { moveData: { from, to, special: 'royal_escort', color }, attempted: true };
}


export interface OpponentRoyalEscortMove {
  from: string;
  to: string;
  special?: 'royal_escort';
  color?: 'white' | 'black'; // Color of the player who made the move
}

interface ApplyRoyalEscortOpponentMoveParams {
  game: Chess;
  receivedMove: OpponentRoyalEscortMove;
}

export function applyRoyalEscortOpponentMove({
  game,
  receivedMove,
}: ApplyRoyalEscortOpponentMoveParams): boolean {
  if (!receivedMove || !receivedMove.from || !receivedMove.to || !receivedMove.color || receivedMove.special !== 'royal_escort') {
    console.error("Invalid receivedMove for Royal Escort", receivedMove);
    return false;
  }
  
  const validSquarePattern = /^[a-h][1-8]$/;
  if (!validSquarePattern.test(receivedMove.from) || !validSquarePattern.test(receivedMove.to)) {
      console.error("Invalid square in receivedMove for Royal Escort", receivedMove);
      return false;
  }


  const snapshot = game.fen();
  const pieceColor = receivedMove.color[0] as 'w' | 'b';
  const kingPiece: PieceSymbol = 'k';

  // Validate that the piece at 'from' is indeed the opponent's king
  const pieceAtFrom = game.get(receivedMove.from as Square);
  if (!pieceAtFrom || pieceAtFrom.type !== 'k' || pieceAtFrom.color !== pieceColor) {
    console.error("Piece at 'from' is not the opponent's king or mismatch color", { receivedMove, pieceAtFrom });
    // Potentially revert or handle as error, but for now, proceed with caution or return false
    // Depending on strictness, might be game.load(snapshot); return false;
    return false;
  }
  
  // Check if 'to' square has a piece of the same color as the current player (i.e. client's piece)
  // This should ideally not happen if opponent move is validated server-side, but good check
  const currentTurnColor = game.turn();
  const pieceAtTo = game.get(receivedMove.to as Square);
  if (pieceAtTo && pieceAtTo.color === currentTurnColor) {
      console.error("Opponent's Royal Escort targets square occupied by client's own piece", {receivedMove, pieceAtTo});
      return false; // Invalid move, would capture own piece.
  }


  game.remove(receivedMove.from as Square);
  game.put({ type: kingPiece, color: pieceColor }, receivedMove.to as Square);

  const initialFenParts = game.fen().split(" "); // Base for constructing the new FEN
  let newFenParts = initialFenParts.slice();

  newFenParts[0] = generateFenBoard(game.board());
  newFenParts[1] = pieceColor === 'w' ? 'b' : 'w'; // Turn switches to the other player

  let castlingRights = initialFenParts[2];
  if (pieceColor === 'w') {
    castlingRights = castlingRights.replace(/K/g, '').replace(/Q/g, '');
  } else {
    castlingRights = castlingRights.replace(/k/g, '').replace(/q/g, '');
  }
  newFenParts[2] = castlingRights === '' ? '-' : castlingRights;
  
  newFenParts[3] = '-'; // En passant
  newFenParts[4] = '0'; // Halfmove clock
  
  // Fullmove number increments if Black made the move
  if (pieceColor === 'b') {
    newFenParts[5] = (parseInt(initialFenParts[5], 10) + 1).toString();
  } else {
    newFenParts[5] = initialFenParts[5]; // Keep same if white moved
  }
  const newFen = newFenParts.join(" ");

  try {
    game.load(newFen);
    // Chess.js load can sometimes slightly alter a FEN if it's "fixable" but not identical.
    // For strictness, ensure the loaded FEN is exactly what we constructed.
    if (game.fen() !== newFen) {
        console.warn("Loaded FEN differs slightly from constructed FEN for opponent Royal Escort", { constructed: newFen, loaded: game.fen() });
        // If strict matching is required (as per original comments):
        // game.load(snapshot);
        // return false;
    }
  } catch (e) {
    console.error("Failed to load FEN for opponent Royal Escort (syntax).", { newFen, error: e, snapshot });
    game.load(snapshot); 
    return false;
  }

  return true;
}
