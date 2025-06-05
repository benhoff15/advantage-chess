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

// New state for Pawn Ambush
export interface PawnAmbushState {
  ambushedPawns: string[]; // Stores initial squares of pawns that have used ambush, e.g., ["e2", "g7"]
}

export interface PlayerAdvantageStates {
  royalEscort?: RoyalEscortState;
  lightningCapture?: LightningCaptureState;
  openingSwap?: OpeningSwapState;
  pawnAmbush?: PawnAmbushState; // Added Pawn Ambush state
  hasUsedSacrificialBlessing?: boolean;
  // Add other advantage states here as needed
}

export interface SacrificialBlessingPendingState {
  color: 'white' | 'black';
  availablePieces: { type: 'n' | 'b'; square: string }[];
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
  wasPawnAmbush?: boolean; // Added for Pawn Ambush
}