import { create } from 'zustand';
import { socket } from '../../socket'; // Assuming socket.ts is in the parent directory of src/
import { Square } from 'chess.js';

export interface SacrificialBlessingPiece {
  type: 'n' | 'b';
  square: string;
}

interface SacrificialBlessingState {
  isSacrificialBlessingActive: boolean;
  availablePieces: SacrificialBlessingPiece[];
  selectedPiece: SacrificialBlessingPiece | null;
  activate: (pieces: SacrificialBlessingPiece[]) => void;
  selectPiece: (piece: SacrificialBlessingPiece) => void;
  deselectPiece: () => void;
  placePiece: (roomId: string, toSquare: Square) => void;
  deactivate: () => void;
  reset: () => void; // To ensure full reset if needed
}

export const useSacrificialBlessingStore = create<SacrificialBlessingState>((set, get) => ({
  isSacrificialBlessingActive: false,
  availablePieces: [],
  selectedPiece: null,

  activate: (pieces) => {
    console.log('[SacrificialBlessingStore] Activating with pieces:', pieces);
    set({
      isSacrificialBlessingActive: true,
      availablePieces: pieces,
      selectedPiece: null,
    });
  },

  selectPiece: (piece) => {
    console.log('[SacrificialBlessingStore] Selecting piece:', piece);
    set({ selectedPiece: piece });
  },

  deselectPiece: () => {
    console.log('[SacrificialBlessingStore] Deselecting piece.');
    set({ selectedPiece: null });
  },

  placePiece: (roomId: string, toSquare: Square) => {
    const { selectedPiece } = get();
    if (!selectedPiece) {
      console.error('[SacrificialBlessingStore] No piece selected to place.');
      return;
    }
    console.log(`[SacrificialBlessingStore] Emitting placeSacrificialBlessingPiece: roomId=${roomId}, pieceSquare=${selectedPiece.square}, toSquare=${toSquare}`);
    socket.emit('placeSacrificialBlessingPiece', {
      roomId,
      pieceSquare: selectedPiece.square, // The current square of the piece being moved
      // pieceType: selectedPiece.type, // Server can get type from game.get(pieceSquare)
      toSquare,
    });
    // Deactivation will be handled by ChessGame.tsx upon receiving boardUpdateFromBlessing or failure event
  },

  deactivate: () => {
    console.log('[SacrificialBlessingStore] Deactivating.');
    set({
      isSacrificialBlessingActive: false,
      // Keep available pieces and selected piece for potential UI needs until explicitly reset,
      // or clear them here if preferred:
      // availablePieces: [], 
      // selectedPiece: null,
    });
  },
  
  reset: () => {
    console.log('[SacrificialBlessingStore] Resetting state.');
    set({
      isSacrificialBlessingActive: false,
      availablePieces: [],
      selectedPiece: null,
    });
  }
}));

// Optional: Export individual actions if preferred over using the store directly
// export const activateSacrificialBlessing = useSacrificialBlessingStore.getState().activate;
// export const selectSacrificialBlessingPiece = useSacrificialBlessingStore.getState().selectPiece;
// etc.
