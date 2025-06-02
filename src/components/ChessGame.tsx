import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Square } from "chess.js";
import { socket } from "../socket";
import { Advantage } from "../../shared/types";
import { handlePawnRushClient, applyPawnRushOpponentMove } from "../logic/advantages/pawnRush";
import { handleCastleMasterClient, applyCastleMasterOpponentMove } from "../logic/advantages/castleMaster";
import { 
  handleFocusedBishopClient, 
  applyFocusedBishopOpponentMove, 
  FocusedBishopClientMove, 
  OpponentFocusedBishopMove 
} from "../logic/advantages/focusedBishop";
import {
  handleCornerBlitzClient,
  applyCornerBlitzOpponentMove,
  PlayerRooksMovedState, // Type for the new ref state
} from "../logic/advantages/cornerBlitz";

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

    console.log("Joining room:", roomId);
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
      console.log("[ChessGame] Received move from server:", receivedMove); // Log the raw received move

      let moveSuccessfullyApplied = false; // Flag to track if any handler processed the move

      if (receivedMove.special?.startsWith("castle-master")) {
        const gameChanged = applyCastleMasterOpponentMove({ game, receivedMove });
        if (gameChanged) {
          setFen(game.fen());
          moveSuccessfullyApplied = true;
        } else {
          console.error("Failed to apply opponent's Castle Master move. FEN might be desynced.");
          // Potentially request FEN sync from server here.
        }
      } else if (receivedMove.special === "pawn_rush_manual") {
        const gameChanged = applyPawnRushOpponentMove({ game, receivedMove });
        if (gameChanged) {
          setFen(game.fen());
          moveSuccessfullyApplied = true;
        } else {
          console.error("Failed to apply opponent's Pawn Rush move. FEN might be desynced.");
        }
      } else if (receivedMove.special === "focused_bishop") {
        const gameChanged = applyFocusedBishopOpponentMove({
          game,
          receivedMove: receivedMove as OpponentFocusedBishopMove, // Ensure type assertion if needed
        });
        if (gameChanged) {
          setFen(game.fen());
          moveSuccessfullyApplied = true;
        } else {
          console.error("Failed to apply opponent's Focused Bishop move. FEN might be desynced.");
          // Even if it fails, we don't want to try it as a standard move.
          // The error is logged by applyFocusedBishopOpponentMove.
        }
      } else if (receivedMove.special === "corner_blitz") {
        const gameChanged = applyCornerBlitzOpponentMove({
          game,
          receivedMove: receivedMove as any, // Cast if OpponentCornerBlitzMove is specific
        });
        if (gameChanged) {
          setFen(game.fen());
          moveSuccessfullyApplied = true;
        } else {
          console.error("Failed to apply opponent's Corner Blitz move. FEN might be desynced.");
        }
      } else {
        // Standard move processing (no 'special' tag or unhandled 'special' tag)
        console.log("[ChessGame] Applying as standard move:", receivedMove);
        const standardMove = game.move({
          from: receivedMove.from,
          to: receivedMove.to,
          promotion: receivedMove.promotion ? (receivedMove.promotion as any) : undefined,
        });

        if (standardMove) {
          setFen(game.fen());
          moveSuccessfullyApplied = true; // this is the default path if no special
        } else {
          console.error(
            `[ChessGame] Standard game.move() failed for received move. ` +
            `This should not happen if server validated. Move: ${JSON.stringify(receivedMove)}. Current FEN: ${game.fen()}`
          );
          // This implies a potential desync or an issue with server validation logic if a non-special move arrives here and fails.
        }
      }

      // Check game over states AFTER the move is applied (either special or standard)
      if (moveSuccessfullyApplied) { // Only check if a move was actually made
        if (game.isCheckmate()) {
          const winner = game.turn() === "w" ? "black" : "white"; // Winner is whose turn it ISN'T
          setGameOverMessage(`${winner} wins by checkmate`);
          // Note: Server typically dictates game over, client updates UI.
          // This client-side check is good for immediate UI feedback.
        } else if (game.isDraw()) {
          setGameOverMessage("Draw");
        } else if (game.isStalemate()) {
          setGameOverMessage("Draw by Stalemate");
        } else if (game.isThreefoldRepetition()) {
          setGameOverMessage("Draw by Threefold Repetition");
        } else if (game.isInsufficientMaterial()) {
          setGameOverMessage("Draw by Insufficient Material");
        }
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

    const handleInvalidMove = (data: { message: string, move?: any }) => {
      console.warn("Invalid move received from server:", data.move, "Reason:", data.message);
      alert(`Invalid Move: ${data.message}`);
      try {
        game.load(fenSnapshotBeforeMove.current);
        setFen(game.fen());
        console.log("Game state reverted to FEN:", fenSnapshotBeforeMove.current);
      } catch (e) {
        console.error("Error loading snapshot after invalid move:", e);
        // Consider requesting a full FEN sync from the server if the game state is potentially corrupt
      }
    };
    socket.on("invalidMove", handleInvalidMove);

    return () => {
      socket.off("colorAssigned");
      socket.off("opponentJoined");
      socket.off("opponentDisconnected");
      socket.off("receiveMove");
      socket.off("revealAdvantages");
      socket.off("advantageAssigned", handleAdvantageAssigned);
      socket.off("moveDeflected", handleMoveDeflected);
      socket.off("invalidMove", handleInvalidMove);
    };
  }, [roomId, game]); // Added game to dependency array

  const [revealedAdvantages, setRevealedAdvantages] = useState<{
    whiteAdvantage?: Advantage;
    blackAdvantage?: Advantage;
    winnerColor?: "white" | "black" | null;
  } | null>(null);

  const hasUsedCastleMaster = useRef(false);
  const hasUsedFocusedBishop = useRef(false);
  const playerRooksMoved = useRef<PlayerRooksMovedState>({ 
    a1: false, h1: false, a8: false, h8: false 
  });

  const makeMove = (from: string, to: string) => {
    if (!color) return null;

    const turn = game.turn();
    if ((turn === "w" && color !== "white") || (turn === "b" && color !== "black")) {
      return null;
    }

    // Capture FEN before any move attempt for potential server-side deflection
    fenSnapshotBeforeMove.current = game.fen();

    let move: any; // This will hold the move object to be sent or processed

    // Pawn Rush logic
    if (myAdvantage?.id === "pawn_rush" && color) { 
      const pawnRushMove = handlePawnRushClient({ game, from, to, color });
      if (pawnRushMove) {
        move = pawnRushMove; 
      }
    }

    // Castle Master logic
    if (!move && myAdvantage?.id === "castle_master" && !hasUsedCastleMaster.current && color) {
      const castleMasterResult = handleCastleMasterClient({ game, from, to, color });

      if (castleMasterResult.moveData) {
        setFen(game.fen()); 
        move = castleMasterResult.moveData; 
      }
      
      if (castleMasterResult.advantageUsed) {
        hasUsedCastleMaster.current = true;
      }

      if (castleMasterResult.moveData) {
        socket.emit("sendMove", { roomId, move: castleMasterResult.moveData });
        // Game over checks after emitting Castle Master move
        if (game.isCheckmate()) { 
            const winner = game.turn() === "w" ? "black" : "white";
            setGameOverMessage(`${winner} wins by checkmate`);
            socket.emit("gameOver", { roomId, winnerColor: winner });
        } else if (game.isDraw()) { 
            setGameOverMessage("Draw");
            socket.emit("gameDraw", { roomId });
        }
        return castleMasterResult.moveData; 
      } else if (castleMasterResult.advantageUsed) {
        return null; 
      }
    }

    // Focused Bishop Logic
    if (!move && myAdvantage?.id === "focused_bishop" && !hasUsedFocusedBishop.current && color) {
      const focusedBishopResult = handleFocusedBishopClient({
        game,
        from,
        to,
        color,
        hasUsedFocusedBishop: hasUsedFocusedBishop.current,
      });
      if (focusedBishopResult.moveData) {
        setFen(game.fen()); 
        move = focusedBishopResult.moveData; 
      }
      if (focusedBishopResult.advantageUsedAttempt) {
        hasUsedFocusedBishop.current = true; 
        if (focusedBishopResult.moveData) {
          socket.emit("sendMove", { roomId, move: focusedBishopResult.moveData });
          // Game over checks
          if (game.isCheckmate()) { 
            const winner = game.turn() === "w" ? "black" : "white";
            setGameOverMessage(`${winner} wins by checkmate`);
            socket.emit("gameOver", { roomId, winnerColor: winner });
          } else if (game.isDraw()) { 
            setGameOverMessage("Draw");
            socket.emit("gameDraw", { roomId });
          }
          return focusedBishopResult.moveData; 
        } else {
          return null; 
        }
      }
    }

    // Corner Blitz Logic
    if (!move && myAdvantage?.id === "corner_blitz" && color) {
      console.log("[ChessGame] makeMove: Checking Corner Blitz for", { from, to });
      const cornerBlitzResult = handleCornerBlitzClient({
        game,
        from,
        to,
        color,
        playerRooksMoved: playerRooksMoved.current,
      });
      console.log("[ChessGame] makeMove: Corner Blitz result:", cornerBlitzResult);

      if (cornerBlitzResult.moveData) {
        // Valid Corner Blitz move constructed and applied locally by handleCornerBlitzClient
        setFen(game.fen()); // Update FEN from game instance modified by handler

        if (cornerBlitzResult.rookMovedKey) {
          playerRooksMoved.current = {
            ...playerRooksMoved.current,
            [cornerBlitzResult.rookMovedKey]: true,
          };
          console.log("[ChessGame] makeMove: Updated playerRooksMoved:", playerRooksMoved.current);
        }
        
        // Emit the special move to the server
        console.log("[ChessGame] makeMove: Emitting Corner Blitz move to server:", cornerBlitzResult.moveData);
        socket.emit("sendMove", { roomId, move: cornerBlitzResult.moveData });
        
        // Check for game over states immediately after this client-side validated special move
        if (game.isCheckmate()) {
          const winner = game.turn() === "w" ? "black" : "white";
          setGameOverMessage(`${winner} wins by checkmate`);
          socket.emit("gameOver", { roomId, winnerColor: winner });
        } else if (game.isDraw()) {
          setGameOverMessage("Draw");
          socket.emit("gameDraw", { roomId });
        }
        // IMPORTANT: Return early to prevent this move from being processed by standard game.move()
        return cornerBlitzResult.moveData; 
      } else if (cornerBlitzResult.rookMovedKey) {
        console.log(`[ChessGame] makeMove: Corner Blitz attempt for rook ${cornerBlitzResult.rookMovedKey} failed locally. Not sending to server or trying as standard move.`);
        return null; // Prevent standard move logic by returning null
      }
      // If rookMovedKey was null, it means it wasn't even a Corner Blitz attempt (e.g., wrong piece clicked),
      // so we fall through, and 'move' remains undefined, allowing standard logic or other advantages.
    }

    // Fallback: standard move
    // This block is reached if 'move' is still undefined (no special advantage handled it and returned early)
    if (!move) {
      console.log("[ChessGame] makeMove: Attempting as standard move for", { from, to });
      const piece = game.get(from as Square);
      const isPawnPromotion = piece?.type === "p" &&
        ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1"));
      const standardMoveAttempt = game.move({
        from,
        to,
        ...(isPawnPromotion ? { promotion: "q" } : {})
      });
      if (standardMoveAttempt) {
        move = standardMoveAttempt; // Assign to 'move' if successful
      } else {
        console.log("[ChessGame] makeMove: Standard game.move() returned null (invalid standard move).");
        return null; // Explicitly return null if standard move is invalid
      }
    }

    // Emit standard moves or special moves that didn't emit themselves and return early
    // (This block should now primarily handle standard moves if 'move' got populated by the standard logic)
    if (move) { 
      // If 'move' is populated here, it means it was a successful standard move or pawn rush.
      // Special moves like Corner Blitz, Focused Bishop, Castle Master should have returned earlier.
      console.log("[ChessGame] makeMove: Emitting standard or Pawn Rush move to server:", move);
      setFen(game.fen()); // Ensure FEN is updated for standard moves too
      socket.emit("sendMove", { roomId, move });

      // Game over checks for standard moves / Pawn Rush
      if (game.isCheckmate()) { 
        const winner = game.turn() === "w" ? "black" : "white";
        setGameOverMessage(`${winner} wins by checkmate`);
        socket.emit("gameOver", { roomId, winnerColor: winner });
      } else if (game.isDraw()) { 
        setGameOverMessage("Draw");
        socket.emit("gameDraw", { roomId });
      }  else if (game.isStalemate()) { // Added more draw checks here as well
        setGameOverMessage("Draw by Stalemate");
        socket.emit("gameDraw", { roomId });
      } else if (game.isThreefoldRepetition()) {
        setGameOverMessage("Draw by Threefold Repetition");
        socket.emit("gameDraw", { roomId });
      } else if (game.isInsufficientMaterial()) {
        setGameOverMessage("Draw by Insufficient Material");
        socket.emit("gameDraw", { roomId });
      }
    }
    return move; // Return the move object (or null if all attempts failed)
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
