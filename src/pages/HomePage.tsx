import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { ADVANTAGE_POOL } from "../shared/advantages"; // Adjust if needed

const generateRoomId = () => Math.random().toString(36).substring(2, 8);

const HomePage = () => {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const randomAdvantage = ADVANTAGE_POOL[Math.floor(Math.random() * ADVANTAGE_POOL.length)];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "radial-gradient(#1e1e2f, #0e0e18)",
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      {/* Hero Section */}
      <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
        <h1 style={{ fontSize: "3rem", fontWeight: "bold", marginBottom: "1rem" }}>
          ♟️ Advantage Chess
        </h1>
        <p style={{ fontSize: "1.25rem", color: "#bbb", marginBottom: "2rem", maxWidth: "600px", textAlign: "center" }}>
          Strategy meets chaos. Every game gives you a unique power to master.
        </p>

        {/* Play Button */}
        <button
          onClick={() => {
            const roomId = generateRoomId();
            navigate(`/game/${roomId}`);
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            padding: "1rem 2rem",
            fontSize: "1.2rem",
            backgroundColor: "#ffcc00",
            color: "#000",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "bold",
            boxShadow: hovered ? "0 0 20px #ffcc00" : "0 0 10px #333",
            transition: "all 0.2s ease-in-out",
          }}
        >
          Play Game
        </button>

        {/* Navigation Links */}
        <div style={{ marginTop: "2rem", display: "flex", gap: "2rem" }}>
          <a href="/glossary" style={{ color: "#ffcc00", textDecoration: "none", fontWeight: "bold" }}>🔍 Explore Advantages</a>
          <a href="/profile" style={{ color: "#ffcc00", textDecoration: "none", fontWeight: "bold" }}>👤 View Profile</a>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ textAlign: "center", padding: "1rem", fontSize: "0.8rem", color: "#777", borderTop: "1px solid #333" }}>
        <p>
          Advantage Chess © {new Date().getFullYear()} | Inspired by{" "}
          <a href="https://drawbackchess.com" target="_blank" rel="noreferrer" style={{ color: "#ffcc00" }}>Drawback Chess</a>
        </p>
        <p>
          <a href="https://github.com/your-repo" target="_blank" rel="noreferrer" style={{ color: "#999" }}>
            View on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
};

export default HomePage;
