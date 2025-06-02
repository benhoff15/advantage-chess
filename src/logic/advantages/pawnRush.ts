import { Chess, Square, PieceSymbol } from 'chess.js';

// Type for the special move object returned by handlePawnRushClient
export interface PawnRushClientMove {
  from: string;
  to: string;
  special: "pawn_rush_manual";
  color: 'white' | 'black';
  piece: 'p'; // Pawn Rush always involves a pawn
}

interface HandlePawnRushClientParams {
  game: Chess; // This is the client's game instance
  from: string;
  to: string;
  color: 'white' | 'black'; // Player's color
}

export function handlePawnRushClient({
  game,
  from,
  to,
  color,
}: HandlePawnRushClientParams): PawnRushClientMove | null {
  const piece = game.get(from as Square);
  // Ensure it's the player's pawn
  if (piece && piece.type === "p" && piece.color === (color === "white" ? "w" : "b")) {
    const fromRank = parseInt(from[1], 10);
    const toRank = parseInt(to[1], 10);
    const fileMatch = from[0] === to[0];

    if (fileMatch && Math.abs(toRank - fromRank) === 2) { // Two-square forward move
      const direction = piece.color === "w" ? 1 : -1;
      const midRank = fromRank + direction;
      const midSquare = from[0] + midRank;

      // Check if path is clear
      if (!game.get(midSquare as Square) && !game.get(to as Square)) {
        // Snapshot FEN before attempting any modification for potential revert
        const snapshot = game.fen(); 
        let standardMoveAttempt: any = null;
        try {
          // Try standard chess.js move first (handles pawn on starting rank, en passant creation)
          // This move is temporary and will be undone if it succeeds but we need manual FEN.
          standardMoveAttempt = game.move({ from, to });
        } catch (e) {
          // console.error("Pawn Rush: game.move() threw an error:", e);
          // standardMoveAttempt remains null, will trigger manual FEN reconstruction
        }

        if (standardMoveAttempt) {
          // If standard move succeeded, it means it was a regular two-square push from the 2nd/7th rank.
          // We can return this move, but the server will handle FEN.
          // However, the original logic implies we might want to send a *special* move type
          // if Pawn Rush advantage is active, even if it's a standard-looking move.
          // For consistency with the original logic's else branch, we might want to undo this
          // and proceed to manual FEN construction to send the special move type.
          // Let's undo and proceed to manual for "pawn_rush_manual" emission.
          game.load(snapshot); // Undo the temporary standard move
          // Fall through to manual FEN construction for "pawn_rush_manual"
        }
        
        // If standardMoveAttempt was null (threw or pawn not on 2nd/7th) OR
        // if standardMoveAttempt succeeded but we want to ensure "pawn_rush_manual" is sent.
        // Apply Pawn Rush: Manual move and FEN reconstruction.
        
        const pawnDetails = { type: piece.type, color: piece.color };
        game.remove(from as Square);
        game.put(pawnDetails, to as Square);

        let fenParts = game.fen().split(' ');
        
        fenParts[0] = game.board().map(rankRow => {
          let empty = 0; let fenRow = "";
          rankRow.forEach(sq => {
            if (sq === null) { empty++; } 
            else {
              if (empty > 0) { fenRow += empty; empty = 0; }
              fenRow += sq.color === 'w' ? sq.type.toUpperCase() : sq.type.toLowerCase();
            }
          });
          if (empty > 0) fenRow += empty;
          return fenRow;
        }).join('/');

        fenParts[1] = (color === "white") ? "b" : "w";
        fenParts[3] = "-"; // En passant square (Pawn Rush from non-start ranks doesn't create en passant)
        fenParts[4] = "0"; // Halfmove clock (pawn move resets it)
        
        if (color === "black") {
          fenParts[5] = (parseInt(fenParts[5], 10) + 1).toString();
        }

        const nextFen = fenParts.join(" ");
        let loadedSuccessfully = false;
        try {
          game.load(nextFen);
          if (game.fen() === nextFen) {
            loadedSuccessfully = true;
          } else {
            // console.warn(`Pawn Rush Client: game.fen() "${game.fen()}" does not match expected nextFen "${nextFen}" after load.`);
            game.load(snapshot); // Revert
            loadedSuccessfully = false;
          }
        } catch (e) {
          // console.error("Pawn Rush Client: Error during game.load(nextFen):", e);
          game.load(snapshot); // Revert
          loadedSuccessfully = false;
        }

        if (loadedSuccessfully) {
          return { 
            from, 
            to, 
            special: "pawn_rush_manual",
            color: color, 
            piece: 'p' 
          };
        } else {
          return null; // Indicate Pawn Rush manual application failed
        }
      }
    }
  }
  return null; // Not a valid Pawn Rush move
}

// Type for the move object received by applyPawnRushOpponentMove
export interface OpponentPawnRushMove {
  from: string;
  to: string;
  special?: string;
  color?: 'white' | 'black';
  // Ensure this matches the structure sent by the server for "pawn_rush_manual"
}

interface ApplyPawnRushOpponentMoveParams {
  game: Chess; // Client's game instance
  receivedMove: OpponentPawnRushMove;
}

export function applyPawnRushOpponentMove({
  game,
  receivedMove,
}: ApplyPawnRushOpponentMoveParams): boolean { // Return true if game state changed
  if (!receivedMove.color || !receivedMove.from || !receivedMove.to) {
    // console.error("Invalid Pawn Rush Manual move received by opponent handler, missing data:", receivedMove);
    return false;
  }
  // Snapshot FEN before attempting any modification for potential revert
  const snapshot = game.fen();
  const pawnChessJsColor = receivedMove.color === "white" ? "w" : "b";

  game.remove(receivedMove.from as Square);
  game.put({ type: 'p', color: pawnChessJsColor }, receivedMove.to as Square);

  let fenParts = game.fen().split(" ");
  fenParts[0] = game.board().map(row => {
      let emptyCount = 0; let fenRow = "";
      row.forEach(sq => {
          if (sq === null) { emptyCount++; } 
          else {
              if (emptyCount > 0) { fenRow += emptyCount; emptyCount = 0; }
              fenRow += sq.color === 'w' ? sq.type.toUpperCase() : sq.type.toLowerCase();
          }
      });
      if (emptyCount > 0) fenRow += emptyCount;
      return fenRow;
  }).join('/');

  fenParts[1] = (receivedMove.color === "white") ? "b" : "w";
  // Castling rights (fenParts[2]) are preserved.
  fenParts[3] = "-";
  fenParts[4] = "0";
  
  const currentFullMoveNumber = parseInt(fenParts[5], 10);
  // Fullmove number in FEN is based on the *game's state before this move*.
  // If the player who made the move (receivedMove.color) was black,
  // then the fullmove number needs to be incremented.
  if (receivedMove.color === "black") {
       fenParts[5] = (currentFullMoveNumber + 1).toString();
  }

  const newFen = fenParts.join(" ");
  try {
    game.load(newFen);
    if (game.fen() !== newFen) {
      // console.warn(`Apply Pawn Rush Opponent: game.fen() "${game.fen()}" does not match expected newFen "${newFen}" after load.`);
      game.load(snapshot); // Revert
      return false;
    }
    return true; // Game state changed
  } catch (e) {
    // console.error("Apply Pawn Rush Opponent: Error during game.load(newFen):", e);
    game.load(snapshot); // Revert
    return false;
  }
}
