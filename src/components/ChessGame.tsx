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

    socket.on("receiveMove", (move: { from: string; to: string }) => {
      game.move(move);
      setFen(game.fen());
    });

    socket.on("revealAdvantages", (data: {
      whiteAdvantage?: Advantage;
      blackAdvantage?: Advantage;
      winnerColor?: "white" | "black" | null;
    }) => {
      setRevealedAdvantages(data);
    });

    return () => {
      socket.off("colorAssigned");
      socket.off("opponentJoined");
      socket.off("opponentDisconnected");
      socket.off("receiveMove");
      socket.off("revealAdvantages");
    };
  }, [roomId]);

  const [revealedAdvantages, setRevealedAdvantages] = useState<{
    whiteAdvantage?: Advantage;
    blackAdvantage?: Advantage;
    winnerColor?: "white" | "black" | null;
  } | null>(null);

  function findKingSquare(game: Chess, color: "w" | "b"): string | null {
    const board = game.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece?.type === "k" && piece.color === color) {
          const square = String.fromCharCode(97 + file) + (8 - rank);
          return square;
        }
      }
    }
    return null;
  }

  const hasUsedCastleMaster = useRef(false);

  const makeMove = (from: string, to: string) => {
    if (!color) return null;

    const turn = game.turn();
    if ((turn === "w" && color !== "white") || (turn === "b" && color !== "black")) {
      return null;
    }

    let move: any;
    const snapshot = game.fen();

    // Pawn Rush logic
    if (myAdvantage?.id === "pawn_rush") {
      const piece = game.get(from as Square);
      if (piece?.type === "p") {
        const fromRank = parseInt(from[1], 10);
        const toRank = parseInt(to[1], 10);
        const fileMatch = from[0] === to[0];

        if (fileMatch && Math.abs(toRank - fromRank) === 2) {
          const direction = piece.color === "w" ? 1 : -1;
          const midRank = fromRank + direction;
          const midSquare = from[0] + midRank;

          if (!game.get(midSquare as Square) && !game.get(to as Square)) {
            move = game.move({ from, to });
          }
        }
      }
    }

    // Castle Master logic
    if (!move && myAdvantage?.id === "castle_master" && !hasUsedCastleMaster.current) {
      const fenParts = game.fen().split(" ");
      const originalFen = game.fen();

      fenParts[2] = color === "white" ? "KQ" : "kq";
      const modifiedFen = fenParts.join(" ");
      game.load(modifiedFen);

      const tentativePiece = game.get(from as Square);
      const tentativeIsPawnPromotion = tentativePiece?.type === "p" &&
        ((tentativePiece.color === "w" && to[1] === "8") || (tentativePiece.color === "b" && to[1] === "1"));

      const tentativeMove = game.move({
        from,
        to,
        ...(tentativeIsPawnPromotion ? { promotion: "q" } : {})
      });

      const isCastlingMove =
        (color === "white" && from === "e1" && (to === "g1" || to === "c1")) ||
        (color === "black" && from === "e8" && (to === "g8" || to === "c8"));

      if (tentativeMove && isCastlingMove) {
        hasUsedCastleMaster.current = true;
        move = tentativeMove;
      } else if (!tentativeMove && isCastlingMove) {
        hasUsedCastleMaster.current = true;

        if (from === "e1" && to === "g1") {
          game.remove("e1");
          game.remove("h1");
          game.put({ type: "k", color: "w" }, "g1");
          game.put({ type: "r", color: "w" }, "f1");
          move = { from, to, special: "castle-master" };
        } else if (from === "e1" && to === "c1") {
          game.remove("e1");
          game.remove("a1");
          game.put({ type: "k", color: "w" }, "c1");
          game.put({ type: "r", color: "w" }, "d1");
          move = { from, to, special: "castle-master" };
        } else if (from === "e8" && to === "g8") {
          game.remove("e8");
          game.remove("h8");
          game.put({ type: "k", color: "b" }, "g8");
          game.put({ type: "r", color: "b" }, "f8");
          move = { from, to, special: "castle-master" };
        } else if (from === "e8" && to === "c8") {
          game.remove("e8");
          game.remove("a8");
          game.put({ type: "k", color: "b" }, "c8");
          game.put({ type: "r", color: "b" }, "d8");
          move = { from, to, special: "castle-master" };
        }

        setFen(game.fen());
        socket.emit("sendMove", { roomId, move });
        return move;
      } else {
        game.load(originalFen);
      }

      const history = game.history();
      game.reset();
      for (const m of history) game.move(m);
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

    // Auto-Deflect logic
    if (move && myAdvantage?.id === "auto_deflect") {
      const opponentColor = color === "white" ? "black" : "white";
      const chessJsColor = opponentColor === "white" ? "w" : "b";
      const kingSquare = findKingSquare(game, chessJsColor);

      if (game.inCheck() && kingSquare) {
        const moves = game.moves({ verbose: true });
        const knightCheck = moves.find(
          (m) => m.piece === "n" && m.to === kingSquare
        );

        if (knightCheck) {
          game.load(snapshot);
          return null;
        }
      }
    }

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
