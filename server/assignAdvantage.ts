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

export function assignRandomAdvantage(): Advantage {
  const weightedPool = ADVANTAGE_POOL;
  const weights = weightedPool.map((a) => RARITY_WEIGHTS[a.rarity]);

  return weightedRandom(weightedPool, weights);
}

export { RARITY_WEIGHTS };
