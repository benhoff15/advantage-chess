import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import ChessGame from "./components/ChessGame";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to={`/game/${generateRandomRoomId()}`} replace />} />
        <Route path="/game/:roomId" element={<ChessGame />} />
      </Routes>
    </Router>
  );
}

function generateRandomRoomId() {
  return Math.random().toString(36).substring(2, 8); // e.g., "x3d2f1"
}

export default App;
