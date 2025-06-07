export type Rarity = "common" | "rare" | "legendary";

export interface Advantage {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  serverValidation?: (params: any) => any; // Add this line
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

export interface CoordinatedPushState {
  active: boolean;
  usedThisTurn: boolean;
}

export interface CloakState {
  pieceId: string;          // e.g., "wNb1" (white Knight on b1) or "bRd8" (black Rook on d8)
  turnsRemaining: number;   // starts at 20, decrements each of the owner’s moves
}

export interface PlayerAdvantageStates {
  royalEscort?: RoyalEscortState;
  lightningCapture?: LightningCaptureState;
  openingSwap?: OpeningSwapState;
  pawnAmbush?: PawnAmbushState; // Added Pawn Ambush state
  coordinatedPush?: CoordinatedPushState;
  hasUsedSacrificialBlessing?: boolean;
  queens_domain?: {
    isActive: boolean;
    hasUsed: boolean;
  };
  knightmare?: { hasUsed: boolean };
  queenly_compensation?: {
    hasUsed: boolean;
  };
  arcane_reinforcement?: {
    spawnedSquare?: string; // e.g., 'e2', 'f7'
  };
  // Add other advantage states here as needed
  cloak?: CloakState; // Add this line
}

export interface SacrificialBlessingPendingState {
  color: 'white' | 'black';
  availablePieces: { type: 'n' | 'b'; square: string }[];
}

export interface ServerMovePayload {
  from: string;
  to: string;
  special?: string; // e.g., 'coordinated_push', 'lightning_capture', 'queens_domain_move'
  color?: "white" | "black";
  rookFrom?: string;
  rookTo?: string;
  promotion?: string;
  secondTo?: string;   // For Coordinated Push second pawn
  wasPawnAmbush?: boolean; // Added for Pawn Ambush
  secondFrom?: string; // For Coordinated Push second pawn
  specialServerEffect?: string; // Add this line (e.g., 'queens_domain_consumed')
  afterFen?: string; // Add this line
  updatedAdvantageStates?: Partial<PlayerAdvantageStates>;
}