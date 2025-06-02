export type Rarity = "common" | "rare" | "legendary";

export interface Advantage {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
}

export interface ShieldedPieceInfo {
  id: string; // Composed from type + initial square, e.g., "q@d1"
  type: string; // e.g., 'q', 'r', 'p'
  initialSquare: string; // e.g., 'd1'
  currentSquare: string; // e.g., 'd4' (updated as the piece moves)
  color: 'w' | 'b';
}