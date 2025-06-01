import { ADVANTAGE_POOL } from "./advantages";
import type { Advantage } from "../shared/types";

const RARITY_WEIGHTS: Record<"common" | "rare" | "legendary", number> = {
  common: 70,
  rare: 25,
  legendary: 5,
};

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  const r = Math.random() * total;
  let sum = 0;

  for (let i = 0; i < items.length; i++) {
    sum += weights[i];
    if (r <= sum) return items[i];
  }

  return items[items.length - 1];
}



const testSequence: Advantage[] = [
  {
    id: "auto_deflect",
    name: "Auto-Deflect",
    description: "First time a piece is captured, it dodges instead.",
    rarity: "legendary"
  },
  {
    id: "pawn_rush",
    name: "Pawn Rush",
    description: "All pawns can move 3 squares forward on their first move.",
    rarity: "rare"
  }
];

let index = 0;

export function assignRandomAdvantage(): Advantage {
  const advantage = testSequence[index % testSequence.length];
  index++;
  return advantage;
}

export { RARITY_WEIGHTS };
