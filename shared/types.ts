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

export interface RoyalEscortState {
  usedCount: number;
}

export interface LightningCaptureState {
  used: boolean;
}

export interface OpeningSwapState {
  hasSwapped: boolean;
}

export interface PlayerAdvantageStates {
  royalEscort?: RoyalEscortState;
  lightningCapture?: LightningCaptureState;
  openingSwap?: OpeningSwapState;
  // Add other advantage states here as needed
}

export interface ServerMovePayload {
  from: string;
  to: string;
  special?: string;
  color?: "white" | "black";
  rookFrom?: string;
  rookTo?: string;
  promotion?: string;
  secondTo?: string; // For Lightning Capture
}