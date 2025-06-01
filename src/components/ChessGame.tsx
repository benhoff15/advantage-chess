import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { socket } from "../socket";
import { Advantage } from "../../shared/types";

export default function ChessGame() {
  const { roomId } = useParams(); // 🔥 This gets /game/:roomId
  const [game] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [color, setColor] = useState<"white" | "black" | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    socket.emit("joinRoom", roomId);

    socket.on("colorAssigned", (assignedColor) => {
      setColor(assignedColor);
    });

    socket.on("opponentJoined", () => {
      setOpponentConnected(true);
    });

    socket.on("opponentDisconnected", () => {
      setOpponentConnected(false);
      alert("Your opponent has disconnected.");
    });

    socket.on("receiveMove", (move) => {
      game.move(move);
      setFen(game.fen());
    });

    socket.on("revealAdvantages", (data) => {
      setRevealedAdvantages(data);
    });

    return () => {
      socket.off("colorAssigned");
      socket.off("opponentJoined");
      socket.off("opponentDisconnected");
      socket.off("receiveMove");
    };
  }, [game, roomId]);
  
  const [revealedAdvantages, setRevealedAdvantages] = useState<{
    whiteAdvantage?: Advantage;
    blackAdvantage?: Advantage;
    winnerColor?: "white" | "black" | null;
  } | null>(null);

  const makeMove = (from: string, to: string) => {
    const turn = game.turn();
    if ((turn === "w" && color !== "white") || (turn === "b" && color !== "black")) {
      return null;
    }

    const move = game.move({ from, to, promotion: "q" });
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
