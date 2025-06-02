import { Chess, Square } from 'chess.js';

// Type for the special move object returned by handleCastleMasterClient
export interface CastleMasterClientMove {
  from: string; // King's current square
  to: string;   // King's target square for castling
  special: string; // e.g., "castle-master-wk", "castle-master-wq", etc.
  color: 'white' | 'black';
  rookFrom: string;
  rookTo: string;
}

interface HandleCastleMasterClientParams {
  game: Chess;
  from: string; // The square the player is trying to move from (should be king)
  to: string;   // The square the player is trying to move to (king's destination)
  color: 'white' | 'black'; // Player's color
}

export interface HandleCastleMasterClientResult {
  moveData: CastleMasterClientMove | null;
  advantageUsed: boolean; // Indicates if the Castle Master attempt was made and pieces moved (even if FEN load failed)
}

export function handleCastleMasterClient({
  game,
  from,
  to,
  color,
}: HandleCastleMasterClientParams): HandleCastleMasterClientResult {
  const piece = game.get(from as Square);
  const playerColor = color; // "white" or "black"
  const chessJsPlayerColor = playerColor === "white" ? "w" : "b";

  if (piece?.type === "k" && piece.color === chessJsPlayerColor) {
    const isWhiteKingsideCastle = playerColor === "white" && from === "e1" && to === "g1";
    const isWhiteQueensideCastle = playerColor === "white" && from === "e1" && to === "c1";
    const isBlackKingsideCastle = playerColor === "black" && from === "e8" && to === "g8";
    const isBlackQueensideCastle = playerColor === "black" && from === "e8" && to === "c8";

    if (isWhiteKingsideCastle || isWhiteQueensideCastle || isBlackKingsideCastle || isBlackQueensideCastle) {
      let canCastle = true;
      const opponentChessJsColor = playerColor === "white" ? "b" : "w";
      const snapshot = game.fen(); // Snapshot before any checks or piece movements

      const tempGameCheck = new Chess(snapshot); 

      if (tempGameCheck.inCheck()) {
        canCastle = false;
      }

      if (canCastle) {
        if (isWhiteKingsideCastle) {
          if (tempGameCheck.get("f1" as Square) || tempGameCheck.get("g1" as Square) ||
              tempGameCheck.isAttacked("e1" as Square, opponentChessJsColor) ||
              tempGameCheck.isAttacked("f1" as Square, opponentChessJsColor) ||
              tempGameCheck.isAttacked("g1" as Square, opponentChessJsColor)) {
            canCastle = false;
          }
        } else if (isWhiteQueensideCastle) {
          if (tempGameCheck.get("d1" as Square) || tempGameCheck.get("c1" as Square) || tempGameCheck.get("b1" as Square) ||
              tempGameCheck.isAttacked("e1" as Square, opponentChessJsColor) ||
              tempGameCheck.isAttacked("d1" as Square, opponentChessJsColor) ||
              tempGameCheck.isAttacked("c1" as Square, opponentChessJsColor)) {
            canCastle = false;
          }
        } else if (isBlackKingsideCastle) {
          if (tempGameCheck.get("f8" as Square) || tempGameCheck.get("g8" as Square) ||
              tempGameCheck.isAttacked("e8" as Square, opponentChessJsColor) ||
              tempGameCheck.isAttacked("f8" as Square, opponentChessJsColor) ||
              tempGameCheck.isAttacked("g8" as Square, opponentChessJsColor)) {
            canCastle = false;
          }
        } else if (isBlackQueensideCastle) {
          if (tempGameCheck.get("d8" as Square) || tempGameCheck.get("c8" as Square) || tempGameCheck.get("b8" as Square) ||
              tempGameCheck.isAttacked("e8" as Square, opponentChessJsColor) ||
              tempGameCheck.isAttacked("d8" as Square, opponentChessJsColor) ||
              tempGameCheck.isAttacked("c8" as Square, opponentChessJsColor)) {
            canCastle = false;
          }
        }
      }

      if (canCastle) {
        // Perform manual piece movements using the main `game` instance
        // This is done on the actual game instance passed to the function.
        if (isWhiteKingsideCastle) {
          game.remove("e1" as Square); game.remove("h1" as Square);
          game.put({ type: "k", color: "w" }, "g1" as Square); game.put({ type: "r", color: "w" }, "f1" as Square);
        } else if (isWhiteQueensideCastle) {
          game.remove("e1" as Square); game.remove("a1" as Square);
          game.put({ type: "k", color: "w" }, "c1" as Square); game.put({ type: "r", color: "w" }, "d1" as Square);
        } else if (isBlackKingsideCastle) {
          game.remove("e8" as Square); game.remove("h8" as Square);
          game.put({ type: "k", color: "b" }, "g8" as Square); game.put({ type: "r", color: "b" }, "f8" as Square);
        } else if (isBlackQueensideCastle) {
          game.remove("e8" as Square); game.remove("a8" as Square);
          game.put({ type: "k", color: "b" }, "c8" as Square); game.put({ type: "r", color: "b" }, "d8" as Square);
        }
        
        // Construct the FEN for the new state
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

        fenParts[1] = (playerColor === "white") ? "b" : "w";
        let currentCastlingRights = fenParts[2];
        if (playerColor === "white") {
          currentCastlingRights = currentCastlingRights.replace("K", "").replace("Q", "");
        } else {
          currentCastlingRights = currentCastlingRights.replace("k", "").replace("q", "");
        }
        if (currentCastlingRights === "") currentCastlingRights = "-";
        fenParts[2] = currentCastlingRights;
        fenParts[3] = "-";
        fenParts[4] = "0";
        if (playerColor === "black") {
          fenParts[5] = (parseInt(fenParts[5], 10) + 1).toString();
        }
        
        const nextFen = fenParts.join(" ");
        let loadedSuccessfully = false;
        try {
          game.load(nextFen);
          if (game.fen() === nextFen) {
            loadedSuccessfully = true;
          } else {
            // console.warn(`Castle Master Client: game.fen() "${game.fen()}" does not match expected nextFen "${nextFen}" after load.`);
            game.load(snapshot); // Revert
          }
        } catch (e) {
          // console.error("Castle Master Client: Error during game.load(nextFen):", e);
          game.load(snapshot); // Revert
        }

        if (loadedSuccessfully) {
          let specialMoveType = "castle-master"; // Generic, server might use more specific
          if (isWhiteKingsideCastle) specialMoveType = "castle-master-wk";
          else if (isWhiteQueensideCastle) specialMoveType = "castle-master-wq";
          else if (isBlackKingsideCastle) specialMoveType = "castle-master-bk";
          else if (isBlackQueensideCastle) specialMoveType = "castle-master-bq";

          const castleMasterMoveData: CastleMasterClientMove = {
            from, to, special: specialMoveType, color: playerColor,
            rookFrom: isWhiteKingsideCastle ? "h1" : isWhiteQueensideCastle ? "a1" : isBlackKingsideCastle ? "h8" : "a8",
            rookTo: isWhiteKingsideCastle ? "f1" : isWhiteQueensideCastle ? "d1" : isBlackKingsideCastle ? "f8" : "d8",
          };
          return { moveData: castleMasterMoveData, advantageUsed: true };
        } else {
          // FEN loading failed, game was reverted. Indicate advantage wasn't successfully used.
          // The 'advantageUsed: true' here means an *attempt* was made and pieces were moved,
          // triggering the hasUsedCastleMaster.current = true in the component.
          // If we want to only set `advantageUsed` if FEN is successfully loaded, this should be false.
          // Given the original logic sets hasUsedCastleMaster.current = true *before* FEN loading,
          // we'll keep advantageUsed: true to signify the attempt.
          return { moveData: null, advantageUsed: true }; 
        }
      }
    }
  }
  return { moveData: null, advantageUsed: false };
}

// Type for the move object received by applyCastleMasterOpponentMove
export interface OpponentCastleMasterMove {
  from: string;
  to: string;
  special?: string; // Will start with "castle-master"
  color?: 'white' | 'black';
  rookFrom?: string;
  rookTo?: string;
}

interface ApplyCastleMasterOpponentMoveParams {
  game: Chess; // Client's game instance
  receivedMove: OpponentCastleMasterMove;
}

export function applyCastleMasterOpponentMove({
  game,
  receivedMove,
}: ApplyCastleMasterOpponentMoveParams): boolean { // Returns true if game state changed
  if (!receivedMove.color || !receivedMove.rookFrom || !receivedMove.rookTo || !receivedMove.from || !receivedMove.to) {
    // console.error("Invalid Opponent Castle Master move received, missing data:", receivedMove);
    return false;
  }
  const castlingPlayerChessJsColor = receivedMove.color === "white" ? "w" : "b";
  const snapshot = game.fen(); // Snapshot before applying changes

  game.remove(receivedMove.from as Square);
  game.remove(receivedMove.rookFrom as Square);
  game.put({ type: "k", color: castlingPlayerChessJsColor }, receivedMove.to as Square);
  game.put({ type: "r", color: castlingPlayerChessJsColor }, receivedMove.rookTo as Square);

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

  let currentCastlingRights = fenParts[2];
  if (receivedMove.color === "white") {
    currentCastlingRights = currentCastlingRights.replace("K", "").replace("Q", "");
  } else {
    currentCastlingRights = currentCastlingRights.replace("k", "").replace("q", "");
  }
  if (currentCastlingRights === "") currentCastlingRights = "-";
  fenParts[2] = currentCastlingRights;
  
  fenParts[3] = "-"; 
  fenParts[4] = "0"; 
  
  const currentFullMoveNumber = parseInt(fenParts[5], 10);
  if (receivedMove.color === "black") {
       fenParts[5] = (currentFullMoveNumber + 1).toString();
  }

  const newFen = fenParts.join(" ");
  try {
    game.load(newFen);
    if (game.fen() !== newFen) {
      // console.warn(`Apply Opponent Castle Master: game.fen() "${game.fen()}" does not match expected newFen "${newFen}" after load.`);
      game.load(snapshot); // Revert
      return false;
    }
    return true; // Game state changed
  } catch (e) {
    // console.error("Apply Opponent Castle Master: Error during game.load(newFen):", e);
    game.load(snapshot); // Revert
    return false;
  }
}