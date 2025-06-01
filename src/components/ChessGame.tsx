import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Square } from "chess.js";
import { socket } from "../socket";
import { Advantage } from "../../shared/types";

export default function ChessGame() {
  const { roomId } = useParams(); //This gets /game/:roomId
  const [game] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [color, setColor] = useState<"white" | "black" | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);
  const [myAdvantage, setMyAdvantage] = useState<Advantage | null>(null);
  const fenSnapshotBeforeMove = useRef<string>(game.fen()); // For reverting deflected moves

  useEffect(() => {
    if (!roomId) return;

    console.log("🧩 Joining room:", roomId);
    socket.emit("joinRoom", roomId);

    socket.on("colorAssigned", (assignedColor: "white" | "black") => {
      setColor(assignedColor);
    });

    socket.on("opponentJoined", () => {
      setOpponentConnected(true);
    });

    socket.on("opponentDisconnected", () => {
      setOpponentConnected(false);
      alert("Your opponent has disconnected.");
    });

    type ReceivedMoveData = {
      from: string;
      to: string;
      special?: string;
      color?: "white" | "black"; // Color of the player who made the move
      rookFrom?: string;
      rookTo?: string;
      promotion?: string;
    };

    socket.on("receiveMove", (receivedMove: ReceivedMoveData) => {
      if (receivedMove.special?.startsWith("castle-master")) {
        if (!receivedMove.color || !receivedMove.rookFrom || !receivedMove.rookTo) {
          console.error("Invalid Castle Master move received, missing data:", receivedMove);
          return;
        }
        const castlingPlayerChessJsColor = receivedMove.color === "white" ? "w" : "b";

        game.remove(receivedMove.from as Square);
        game.remove(receivedMove.rookFrom as Square);
        game.put({ type: "k", color: castlingPlayerChessJsColor }, receivedMove.to as Square);
        game.put({ type: "r", color: castlingPlayerChessJsColor }, receivedMove.rookTo as Square);

        // Reconstruct FEN
        // Snapshot is not available here, so if load fails, game might be inconsistent.
        // This FEN reconstruction logic should mirror the one in makeMove's Castle Master.
        let fenParts = game.fen().split(" ");
        fenParts[0] = game.board().map(row => {
            let emptyCount = 0;
            let fenRow = "";
            row.forEach(sq => {
                if (sq === null) {
                    emptyCount++;
                } else {
                    if (emptyCount > 0) fenRow += emptyCount;
                    emptyCount = 0;
                    fenRow += sq.color === 'w' ? sq.type.toUpperCase() : sq.type.toLowerCase();
                }
            });
            if (emptyCount > 0) fenRow += emptyCount;
            return fenRow;
        }).join('/');

        fenParts[1] = (receivedMove.color === "white") ? "b" : "w"; // Toggle turn

        let currentCastlingRights = fenParts[2];
        if (receivedMove.color === "white") {
          currentCastlingRights = currentCastlingRights.replace("K", "").replace("Q", "");
        } else {
          currentCastlingRights = currentCastlingRights.replace("k", "").replace("q", "");
        }
        if (currentCastlingRights === "") currentCastlingRights = "-";
        fenParts[2] = currentCastlingRights;
        
        fenParts[3] = "-"; // En passant square
        fenParts[4] = "0"; // Halfmove clock 
        
        // Fullmove number increments after black moves
        // Note: game.fen() used for fenParts might have old fullmove if it was white's turn.
        // If it was black who castled, then the fullmove number in fenParts[5] from game.fen()
        // was already incremented by their client, or should be by this client.
        // The player who castled is receivedMove.color.
        // If black castled, this client needs to ensure the fullmove number is incremented.
        // If white castled, the fullmove number should not change yet.
        // The FEN standard: fullmove number is incremented after Black's move.
        // So, if receivedMove.color (the player who castled) is black, we increment.
        const currentFullMoveNumber = parseInt(fenParts[5], 10);
        if (receivedMove.color === "black") {
                // If it was black's move, the fullmove number from game.fen() (which is from before this move's
                // metadata was applied) needs to be incremented.
             fenParts[5] = (currentFullMoveNumber + 1).toString();
        }
        // The FEN standard says "the number of the full move. It starts at 1, and is incremented after Black's move."
            // If black (opponent) castled, their client would have determined the incremented fullmove number.
            // This client, upon receiving that move, reconstructs the FEN.
            // `fenParts` initially holds FEN parts from this client's game *before* applying opponent's move effects.
            // So, if opponent was black, `currentFullMoveNumber` (from `fenParts[5]`) is the number *before* black's move,
            // and `fenParts[5]` is correctly updated to `currentFullMoveNumber + 1`.

        const newFen = fenParts.join(" ");
        try {
          game.load(newFen);
          if (game.fen() !== newFen) {
            console.warn(`ReceiveMove Castle Master: game.fen() "${game.fen()}" does not match expected newFen "${newFen}" after load.`);
            // Potentially problematic state. Might need full sync. For now, proceed with game.fen().
          }
        } catch (e) {
          console.error("ReceiveMove Castle Master: Error during game.load(newFen):", e);
          // Game state might be corrupted.
        }
        setFen(game.fen());

      } else if (receivedMove.special === "pawn_rush_manual") {
        if (!receivedMove.color || !receivedMove.from || !receivedMove.to) {
          console.error("Invalid Pawn Rush Manual move received, missing data:", receivedMove);
          return;
        }
        const pawnChessJsColor = receivedMove.color === "white" ? "w" : "b";

        game.remove(receivedMove.from as Square);
        game.put({ type: 'p', color: pawnChessJsColor }, receivedMove.to as Square);

        // Reconstruct FEN
        let fenParts = game.fen().split(" ");
        fenParts[0] = game.board().map(row => { // Standard FEN row generation
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

        fenParts[1] = (receivedMove.color === "white") ? "b" : "w"; // Toggle turn

        // Castling rights (fenParts[2]) are preserved as pawn moves don't affect them.
        
        fenParts[3] = "-"; // En passant square (Pawn Rush manual doesn't create one)
        fenParts[4] = "0"; // Halfmove clock (pawn move resets it)
        
        const currentFullMoveNumber = parseInt(fenParts[5], 10);
        if (receivedMove.color === "black") { // If black made the move
             fenParts[5] = (currentFullMoveNumber + 1).toString();
        }

        const newFen = fenParts.join(" ");
        try {
          game.load(newFen);
          if (game.fen() !== newFen) {
            console.warn(`ReceiveMove Pawn Rush: game.fen() "${game.fen()}" does not match expected newFen "${newFen}" after load.`);
          }
        } catch (e) {
          console.error("ReceiveMove Pawn Rush: Error during game.load(newFen):", e);
        }
        setFen(game.fen());

      } else {
        // Standard move or other special move not handled here
        game.move({ 
          from: receivedMove.from, 
          to: receivedMove.to, 
          promotion: receivedMove.promotion as any // chess.js expects 'q', 'r', 'b', or 'n'
        });
        setFen(game.fen());
      }
    });

    socket.on("revealAdvantages", (data: {
      whiteAdvantage?: Advantage;
      blackAdvantage?: Advantage;
      winnerColor?: "white" | "black" | null;
    }) => {
      setRevealedAdvantages(data);
    });

    const handleAdvantageAssigned = (advantage: Advantage) => {
      setMyAdvantage(advantage);
      console.log("Advantage assigned:", advantage);
    };

    socket.on("advantageAssigned", handleAdvantageAssigned);

    const handleMoveDeflected = (data?: { move?: any }) => {
      console.log("Move deflected by server:", data?.move);
      alert("Your move was deflected by the opponent's Auto Deflect advantage!");
      try {
        game.load(fenSnapshotBeforeMove.current);
        setFen(game.fen());
      } catch (e) {
        console.error("Error loading snapshot after move deflection:", e);
        // Potentially ask for a full FEN sync from server if game state is corrupt
      }
    };
    socket.on("moveDeflected", handleMoveDeflected);

    return () => {
      socket.off("colorAssigned");
      socket.off("opponentJoined");
      socket.off("opponentDisconnected");
      socket.off("receiveMove");
      socket.off("revealAdvantages");
      socket.off("advantageAssigned", handleAdvantageAssigned);
      socket.off("moveDeflected", handleMoveDeflected);
    };
  }, [roomId, game]); // Added game to dependency array

  const [revealedAdvantages, setRevealedAdvantages] = useState<{
    whiteAdvantage?: Advantage;
    blackAdvantage?: Advantage;
    winnerColor?: "white" | "black" | null;
  } | null>(null);

  // findKingSquare function removed as it was unused.

  const hasUsedCastleMaster = useRef(false);

  const makeMove = (from: string, to: string) => {
    if (!color) return null;

    const turn = game.turn();
    if ((turn === "w" && color !== "white") || (turn === "b" && color !== "black")) {
      return null;
    }

    // Capture FEN before any move attempt for potential server-side deflection
    fenSnapshotBeforeMove.current = game.fen();

    let move: any;
    const snapshot = game.fen(); // Snapshot for Castle Master's internal revert on its own FEN load failure

    // Pawn Rush logic
    // Allows pawns to move two squares forward from any rank,
    // provided the path is clear.
    if (myAdvantage?.id === "pawn_rush") {
      const piece = game.get(from as Square); // Used for piece type and color
      if (piece && piece.type === "p" && piece.color === (color === "white" ? "w" : "b")) { // Ensure it's player's pawn
        const fromRank = parseInt(from[1], 10);
        const toRank = parseInt(to[1], 10);
        const fileMatch = from[0] === to[0];

        if (fileMatch && Math.abs(toRank - fromRank) === 2) { // Two-square forward move
          const direction = piece.color === "w" ? 1 : -1;
          const midRank = fromRank + direction;
          const midSquare = from[0] + midRank;

          // Check if path is clear
          if (!game.get(midSquare as Square) && !game.get(to as Square)) {
            let standardMoveAttempt: any = null;
            try {
              // Try standard chess.js move first (handles pawn on starting rank, en passant creation)
              standardMoveAttempt = game.move({ from, to });
            } catch (e) {
              console.error("Pawn Rush: game.move() threw an error:", e);
              // standardMoveAttempt remains null, will trigger manual FEN reconstruction
            }

            if (standardMoveAttempt) { // or standardMoveAttempt !== null
              move = standardMoveAttempt;
            } else {
              // If standardMoveAttempt is null (either returned null or threw error),
              // it's likely a pawn not on its starting rank or an unexpected issue.
              // Apply Pawn Rush: Manual move and FEN reconstruction.
              
              // Preserve piece details before removing
              const pawnDetails = { type: piece.type, color: piece.color };
              game.remove(from as Square);
              game.put(pawnDetails, to as Square);

              let fenParts = game.fen().split(' '); // FEN after put/remove (pieces updated, metadata old)
              
              // 1. Piece placement (already reflects put/remove, but regenerate for canonical form)
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

              // 2. Toggle turn
              fenParts[1] = (color === "white") ? "b" : "w";
              
              // 3. Castling rights (preserved, Pawn Rush doesn't affect them)
              // fenParts[2] is taken from game.fen() after put/remove, should be current.
              
              // 4. En passant square (Pawn Rush from non-start ranks doesn't create en passant)
              fenParts[3] = "-";
              
              // 5. Halfmove clock (pawn move resets it)
              fenParts[4] = "0";
              
              // 6. Fullmove number (increment if black moved)
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
                  console.warn(`Pawn Rush: game.fen() "${game.fen()}" does not match expected nextFen "${nextFen}" after load.`);
                  game.load(snapshot); // Revert to snapshot before this Pawn Rush attempt
                  loadedSuccessfully = false;
                }
              } catch (e) {
                console.error("Pawn Rush: Error during game.load(nextFen):", e);
                game.load(snapshot); // Revert
                loadedSuccessfully = false;
              }

              if (loadedSuccessfully) {
                move = { 
                  from, 
                  to, 
                  special: "pawn_rush_manual", // Differentiate from standard two-square
                  color: color, // Color of player making the move
                  piece: pawnDetails.type // 'p'
                };
              } else {
                move = null; // Indicate Pawn Rush manual application failed
              }
            }
          }
        }
      }
    }

    // Castle Master logic
    // Allows castling even if king/rook has moved. Usable once.
    // Bypasses normal castling rights checks but respects path clear, not in check, and not through attacked squares.
    if (!move && myAdvantage?.id === "castle_master" && !hasUsedCastleMaster.current) {
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

          // Pre-move state for checks
          // const currentBoardFen = game.fen().split(" ")[0]; // Unused variable removed
          const tempGameCheck = new Chess(game.fen()); // Use full FEN for accurate isAttacked and inCheck

          if (tempGameCheck.inCheck()) {
            canCastle = false;
          }

          if (canCastle) {
            if (isWhiteKingsideCastle) {
              if (tempGameCheck.get("f1") || tempGameCheck.get("g1") ||
                  tempGameCheck.isAttacked("e1", opponentChessJsColor) ||
                  tempGameCheck.isAttacked("f1", opponentChessJsColor) ||
                  tempGameCheck.isAttacked("g1", opponentChessJsColor)) {
                canCastle = false;
              }
            } else if (isWhiteQueensideCastle) {
              if (tempGameCheck.get("d1") || tempGameCheck.get("c1") || tempGameCheck.get("b1") ||
                  tempGameCheck.isAttacked("e1", opponentChessJsColor) ||
                  tempGameCheck.isAttacked("d1", opponentChessJsColor) ||
                  tempGameCheck.isAttacked("c1", opponentChessJsColor)) {
                canCastle = false;
              }
            } else if (isBlackKingsideCastle) {
              if (tempGameCheck.get("f8") || tempGameCheck.get("g8") ||
                  tempGameCheck.isAttacked("e8", opponentChessJsColor) ||
                  tempGameCheck.isAttacked("f8", opponentChessJsColor) ||
                  tempGameCheck.isAttacked("g8", opponentChessJsColor)) {
                canCastle = false;
              }
            } else if (isBlackQueensideCastle) {
              if (tempGameCheck.get("d8") || tempGameCheck.get("c8") || tempGameCheck.get("b8") ||
                  tempGameCheck.isAttacked("e8", opponentChessJsColor) ||
                  tempGameCheck.isAttacked("d8", opponentChessJsColor) ||
                  tempGameCheck.isAttacked("c8", opponentChessJsColor)) {
                canCastle = false;
              }
            }
          }

          if (canCastle) {
            // Perform manual piece movements using the main `game` instance
            if (isWhiteKingsideCastle) {
              game.remove("e1"); game.remove("h1");
              game.put({ type: "k", color: "w" }, "g1"); game.put({ type: "r", color: "w" }, "f1");
            } else if (isWhiteQueensideCastle) {
              game.remove("e1"); game.remove("a1");
              game.put({ type: "k", color: "w" }, "c1"); game.put({ type: "r", color: "w" }, "d1");
            } else if (isBlackKingsideCastle) {
              game.remove("e8"); game.remove("h8");
              game.put({ type: "k", color: "b" }, "g8"); game.put({ type: "r", color: "b" }, "f8");
            } else if (isBlackQueensideCastle) {
              game.remove("e8"); game.remove("a8");
              game.put({ type: "k", color: "b" }, "c8"); game.put({ type: "r", color: "b" }, "d8");
            }

            hasUsedCastleMaster.current = true;
            
            // Construct the FEN for the new state
            // game.fen() currently has the new board but old turn, castling rights etc.
            // We need to update these.
            let fenParts = game.fen().split(" ");
            fenParts[0] = game.board().map(row => { // Get the board state from the game instance directly
                let emptyCount = 0;
                let fenRow = "";
                row.forEach(sq => {
                    if (sq === null) {
                        emptyCount++;
                    } else {
                        if (emptyCount > 0) fenRow += emptyCount;
                        emptyCount = 0;
                        fenRow += sq.color === 'w' ? sq.type.toUpperCase() : sq.type.toLowerCase();
                    }
                });
                if (emptyCount > 0) fenRow += emptyCount;
                return fenRow;
            }).join('/');


            fenParts[1] = (playerColor === "white") ? "b" : "w"; // Toggle turn

            let currentCastlingRights = fenParts[2];
            if (playerColor === "white") {
              currentCastlingRights = currentCastlingRights.replace("K", "").replace("Q", "");
            } else {
              currentCastlingRights = currentCastlingRights.replace("k", "").replace("q", "");
            }
            if (currentCastlingRights === "") currentCastlingRights = "-";
            fenParts[2] = currentCastlingRights;
            
            fenParts[3] = "-"; // En passant square
            fenParts[4] = "0"; // Halfmove clock reset due to pawn move or capture (castling is neither, but often reset)
                               // Standard chess.js behavior for castling is to reset halfmove clock.

            if (playerColor === "black") { // Fullmove number increments after black moves
              fenParts[5] = (parseInt(fenParts[5], 10) + 1).toString();
            }
            
            const nextFen = fenParts.join(" ");
            let loadedSuccessfully = false;
            
            try {
              game.load(nextFen);
              // Check if game.fen() after load is indeed nextFen.
              // FENs should be canonical after generation and loading.
              if (game.fen() === nextFen) {
                loadedSuccessfully = true;
              } else {
                console.warn(`Castle Master: game.fen() "${game.fen()}" does not match expected nextFen "${nextFen}" after load.`);
                game.load(snapshot); // Revert to the clean snapshot.
                loadedSuccessfully = false;
              }
            } catch (e) {
              console.error("Castle Master: Error during game.load(nextFen):", e);
              game.load(snapshot); // Revert to a known good state.
              loadedSuccessfully = false;
            }

            if (!loadedSuccessfully) {
              console.log("Castle Master: Aborting due to FEN load issue, error, or mismatch.");
              return null; 
            }
            
            let specialMoveType = "castle-master";
            if (isWhiteKingsideCastle) specialMoveType = "castle-master-wk";
            else if (isWhiteQueensideCastle) specialMoveType = "castle-master-wq";
            else if (isBlackKingsideCastle) specialMoveType = "castle-master-bk";
            else if (isBlackQueensideCastle) specialMoveType = "castle-master-bq";

            const castleMasterMoveData = {
              from, // Original king start
              to,   // Original king end
              special: specialMoveType,
              color: playerColor, 
              rookFrom: isWhiteKingsideCastle ? "h1" : isWhiteQueensideCastle ? "a1" : isBlackKingsideCastle ? "h8" : "a8",
              rookTo: isWhiteKingsideCastle ? "f1" : isWhiteQueensideCastle ? "d1" : isBlackKingsideCastle ? "f8" : "d8",
            };
            
            setFen(game.fen()); // Update local UI with the new FEN from game instance (after successful load)
            socket.emit("sendMove", { roomId, move: castleMasterMoveData });
            return castleMasterMoveData; // Bypass further move processing
          }
        }
      }
    }

    // Fallback: standard move
    if (!move) {
      const piece = game.get(from as Square);
      const isPawnPromotion = piece?.type === "p" &&
        ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1"));

      move = game.move({
        from,
        to,
        ...(isPawnPromotion ? { promotion: "q" } : {})
      });
    }

    // Client-side Auto-Deflect logic removed as server now handles this validation.

    if (move) {
      setFen(game.fen());
      socket.emit("sendMove", { roomId, move });

      if (game.isCheckmate()) {
        const winner = game.turn() === "w" ? "black" : "white";
        setGameOverMessage(`${winner} wins by checkmate`);
        socket.emit("gameOver", { roomId, winnerColor: winner });
      } else if (game.isDraw()) {
        setGameOverMessage("Draw");
        socket.emit("gameDraw", { roomId });
      }
    }

    return move;
  };

  return (
    <div style={{ padding: "20px", maxWidth: 600, margin: "0 auto" }}>
      <h2>Advantage Chess — Room <code>{roomId}</code></h2>

      <p>
        You are playing as: <strong>{color ?? "..."}</strong><br />
        {opponentConnected ? "Opponent connected ✅" : "Waiting for opponent... ⏳"}
      </p>

      <Chessboard
        position={fen}
        onPieceDrop={(from, to) => !!makeMove(from, to)}
        boardWidth={500}
        boardOrientation={color === "black" ? "black" : "white"}
      />

      {gameOverMessage && (
        <div style={{ marginTop: 20, padding: 20, backgroundColor: "#222", color: "#fff", textAlign: "center", borderRadius: 8 }}>
          <h3>{gameOverMessage}</h3>

          {revealedAdvantages && (
            <>
              <p><strong>Your Advantage:</strong> {color === "white" ? revealedAdvantages.whiteAdvantage?.name : revealedAdvantages.blackAdvantage?.name}</p>
              <p><strong>Opponent's Advantage:</strong> {color === "white" ? revealedAdvantages.blackAdvantage?.name : revealedAdvantages.whiteAdvantage?.name}</p>
            </>
          )}

          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 10, padding: "8px 16px", fontSize: "1rem", borderRadius: 6, backgroundColor: "#fff", color: "#000", border: "none", cursor: "pointer" }}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
