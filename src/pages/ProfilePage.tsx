import { ADVANTAGE_POOL } from "../shared/advantages"; // for name lookup
import { useEffect, useState } from "react";

const ProfilePage = () => {
  // Mock profile stats (can replace with localStorage or API later)
  const mockStats = {
    username: "ChessStrategist",
    avatarLetter: "C",
    wins: 28,
    losses: 15,
    draws: 4,
    favoriteAdvantageId: "queens_domain",
    recentGames: [
      { opponent: "KnightRider", result: "Win", advantage: "silent_shield", date: "2024-01-12" },
      { opponent: "RookRoller", result: "Loss", advantage: "pawn_rush", date: "2024-01-11" },
      { opponent: "CastleKing", result: "Draw", advantage: "castle_master", date: "2024-01-10" },
    ],
  };

  const favorite = ADVANTAGE_POOL.find(a => a.id === mockStats.favoriteAdvantageId);

  return (
    <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto", color: "white" }}>
      {/* Avatar + Name */}
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            backgroundColor: "#ffcc00",
            color: "#000",
            fontWeight: "bold",
            fontSize: "2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto",
          }}
        >
          {mockStats.avatarLetter}
        </div>
        <h2>{mockStats.username}</h2>
      </div>

      {/* Match Stats */}
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "2rem" }}>
        <div>
          <h3 style={{ margin: 0 }}>{mockStats.wins}</h3>
          <p style={{ margin: 0, color: "#aaa" }}>Wins</p>
        </div>
        <div>
          <h3 style={{ margin: 0 }}>{mockStats.losses}</h3>
          <p style={{ margin: 0, color: "#aaa" }}>Losses</p>
        </div>
        <div>
          <h3 style={{ margin: 0 }}>{mockStats.draws}</h3>
          <p style={{ margin: 0, color: "#aaa" }}>Draws</p>
        </div>
      </div>

      {/* Favorite Advantage */}
      <div style={{ marginBottom: "2rem", textAlign: "center" }}>
        <h4 style={{ marginBottom: "0.5rem" }}>🌟 Favorite Advantage</h4>
        <strong>{favorite?.name || "N/A"}</strong>
        <p style={{ fontSize: "0.9rem", color: "#ccc" }}>{favorite?.description}</p>
      </div>

      {/* Recent Matches */}
      <div>
        <h4>Recent Matches</h4>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {mockStats.recentGames.map((game, index) => {
            const adv = ADVANTAGE_POOL.find(a => a.id === game.advantage);
            const color = game.result === "Win" ? "#4caf50" : game.result === "Loss" ? "#f44336" : "#ffc107";

            return (
              <li
                key={index}
                style={{
                  background: "#222",
                  padding: "1rem",
                  marginBottom: "0.5rem",
                  borderLeft: `4px solid ${color}`,
                }}
              >
                <strong style={{ color }}>{game.result}</strong> vs <span>{game.opponent}</span> —{" "}
                <em>{adv?.name || game.advantage}</em> on {game.date}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default ProfilePage;
