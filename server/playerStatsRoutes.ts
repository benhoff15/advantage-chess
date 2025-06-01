import { Router } from "express";

type PlayerStats = {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  elo: number;
};

const playerStats: Record<string, PlayerStats> = {};

export const playerStatsRouter = Router();

playerStatsRouter.get("/:playerId", (req, res) => {
  const stats = playerStats[req.params.playerId];
  if (!stats) return res.status(404).json({ error: "Player not found" });
  res.json(stats);
});

// Optional: expose this for updates/testing if needed
export function updateOrGetStatsStore() {
  return playerStats;
}
