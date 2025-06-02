import React, { useEffect, useState, useRef } from "react";
// Removed duplicate React import
import { useParams } from "react-router-dom";
// Removed duplicate useParams import
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Square } from "chess.js"; // Square is already imported
import { socket } from "../socket";
import { Advantage } from "../../shared/types";
import { handlePawnRushClient, applyPawnRushOpponentMove } from "../logic/advantages/pawnRush";
import { handleCastleMasterClient, applyCastleMasterOpponentMove } from "../logic/advantages/castleMaster"; // Added import

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
      // TEST: Verify client-side handling of opponent's Castle Master move.
      if (receivedMove.special?.startsWith("castle-master")) {
        // Call the refactored function for applying opponent's Castle Master move
        const gameChanged = applyCastleMasterOpponentMove({ game, receivedMove });
        if (gameChanged) {
          setFen(game.fen());
        } else {
          // Handle error or inconsistent state if applyCastleMasterOpponentMove fails
          console.error("Failed to apply opponent's Castle Master move. FEN might be desynced.");
          // Optionally, request a FEN sync from the server here.
        }
      } else if (receivedMove.special === "pawn_rush_manual") {
        // TEST: Verify client-side handling of opponent's Pawn Rush move.
        // Call the refactored function
        // Ensure receivedMove matches OpponentPawnRushMove type if more fields are needed by applyPawnRushOpponentMove
        const gameChanged = applyPawnRushOpponentMove({ game, receivedMove });
        if (gameChanged) {
          setFen(game.fen());
        } else {
          // Handle error or inconsistent state if applyPawnRushOpponentMove fails
          console.error("Failed to apply opponent's Pawn Rush move. FEN might be desynced.");
          // Optionally, request a FEN sync from the server here.
        }

      } else {
        // Standard move or other special move not handled here
        // Ensure this part is safe if `receivedMove` doesn't have `promotion`
        const standardMove = game.move({ 
          from: receivedMove.from, 
          to: receivedMove.to, 
          promotion: receivedMove.promotion ? receivedMove.promotion as any : undefined
        });
        // if (!standardMove) {
          // This implies the server sent a move that chess.js on client deems illegal after all other special handling.
          // This should ideally not happen if server validation is robust.
          // console.error("Received move was deemed invalid by client's chess.js instance:", receivedMove);
          // Potentially request FEN sync.
        // }
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

    // TEST: Verify client behavior when a move is deflected by Auto Deflect (alert, FEN revert).
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
    // TEST: Verify client-side Pawn Rush move creation (valid/invalid paths, different ranks).
    if (myAdvantage?.id === "pawn_rush" && color) { // Ensure color is not null
      const pawnRushMove = handlePawnRushClient({ game, from, to, color });
      if (pawnRushMove) {
        // The game instance is already updated by handlePawnRushClient if successful
        move = pawnRushMove; 
        // Note: setFen will be called later if move is successful.
        // The 'move' object here is what gets sent to the server.
      }
      // If pawnRushMove is null, it means it wasn't a valid pawn rush.
      // We proceed to check other advantages or standard move logic.
      // If it *was* a pawn rush attempt that failed validation inside handlePawnRushClient,
      // the game state should have been reverted by it, so 'game' is still valid for next checks.
    }

    // Castle Master logic
    // Allows castling even if king/rook has moved. Usable once.
    // Bypasses normal castling rights checks but respects path clear, not in check, and not through attacked squares.
    // TEST: Verify client-side Castle Master move creation (king/rook moved, path clear/blocked, in check, through attacked squares, usage flag).
    if (!move && myAdvantage?.id === "castle_master" && !hasUsedCastleMaster.current && color) {
      const castleMasterResult = handleCastleMasterClient({ game, from, to, color });

      if (castleMasterResult.moveData) {
        // The game instance is updated by handleCastleMasterClient if FEN load was successful.
        // The component needs to update its FEN state from the game instance.
        setFen(game.fen()); 
        move = castleMasterResult.moveData; // This is the object to send to the server
        // The `move` object itself will be emitted later in makeMove if it's not null.
        // No need to emit here.
      }
      
      if (castleMasterResult.advantageUsed) {
        // This flag is set if an attempt to use Castle Master was made (pieces moved),
        // even if the final FEN loading failed (in which case game state was reverted).
        // This ensures the advantage is marked as "used" after one attempt.
        hasUsedCastleMaster.current = true;
      }

      if (castleMasterResult.moveData) {
        // If a valid Castle Master move was constructed and game state updated,
        // we should emit this move and potentially bypass further move processing in makeMove.
        // The current structure of makeMove will emit `move` if it's truthy later on.
        // If castleMasterResult.moveData is not null, it means the move was successful locally.
        // We need to ensure this move is sent to the server.
        // The existing makeMove structure handles emitting the `move` if it's valid.
        // If moveData is not null, it means the local game state reflects the castle.
        // We also need to return from makeMove here to prevent standard move logic.
        socket.emit("sendMove", { roomId, move: castleMasterResult.moveData });
        return castleMasterResult.moveData; // Bypass further move processing
      } else if (castleMasterResult.advantageUsed) {
        // Advantage was attempted, pieces might have been moved and reverted.
        // No valid move object to send, but we should prevent further standard move logic.
        return null; // Or handle as an invalid move attempt
      }
      // If !advantageUsed, it means it wasn't a Castle Master attempt (e.g., not a king move to castling squares)
      // and we fall through to standard move logic.
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
