import { Chess, Move, Square } from 'chess.js'; // Added Square
// Assuming Advantage is defined in a way that's compatible.
// If Advantage has specific values like 'pawn_rush', ensure it's handled.
import { Advantage } from '../../../shared/types'; 

// Define a more specific type for clientMoveData if possible,
// based on the structure used in server/socketHandlers.ts
interface ClientMovePayload {
  from: string;
  to: string;
  special?: string;
  color?: 'white' | 'black'; // Make color more specific
  // Add other potential fields if they are relevant for pawn rush
}

interface PawnRushParams {
  game: Chess; // This is the serverGame instance
  clientMoveData: ClientMovePayload;
  currentFen: string; // This is room.fen before the move (FEN before this Pawn Rush move)
  playerColor: 'w' | 'b'; // Color of the player making the move
}

interface PawnRushResult {
  moveResult: Move | null;
  nextFen: string;
}

export function handlePawnRush({ 
  game, 
  clientMoveData, 
  currentFen: fenBeforeThisMove, // Renamed for clarity
  playerColor 
}: PawnRushParams): PawnRushResult {

  if (!clientMoveData.from || !clientMoveData.to || !clientMoveData.color || clientMoveData.color[0] !== playerColor) {
    console.error(`[handlePawnRush] Invalid Pawn Rush Manual move received, missing/mismatched data:`, clientMoveData, `Player color: ${playerColor}`);
    return {
      moveResult: null,
      nextFen: fenBeforeThisMove,
    };
  }

  const pawnChessJsColor = playerColor;
  
  // Perform the pawn rush move: remove pawn from 'from', put pawn on 'to'
  game.remove(clientMoveData.from as Square);
  game.put({ type: 'p', color: pawnChessJsColor }, clientMoveData.to as Square);

  // Reconstruct FEN
  let fenParts = game.fen().split(" ");
  fenParts[0] = game.board().map(rank => {
    let empty = 0; let fenRow = "";
    rank.forEach(sq => {
      if (sq === null) { empty++; } 
      else {
        if (empty > 0) { fenRow += empty; empty = 0; }
        fenRow += sq.color === 'w' ? sq.type.toUpperCase() : sq.type.toLowerCase();
      }
    });
    if (empty > 0) fenRow += empty;
    return fenRow;
  }).join('/');
  
  fenParts[1] = (pawnChessJsColor === "w") ? "b" : "w"; 
  fenParts[3] = "-"; 
  fenParts[4] = "0"; 
  
  const currentFullMove = parseInt(fenParts[5], 10);
  if (pawnChessJsColor === "b") {
    fenParts[5] = (currentFullMove + 1).toString();
  }
  
  const constructedFenAfterMove = fenParts.join(" ");
  
  try {
    game.load(constructedFenAfterMove); 
    if (game.fen() !== constructedFenAfterMove) {
      console.warn(`[handlePawnRush] FEN mismatch after Pawn Rush Manual: "${game.fen()}" vs "${constructedFenAfterMove}". Using loaded FEN.`);
    }
    
    const finalFenAfterMove = game.fen();

    const moveResult: Move = {
      piece: 'p',
      flags: 'b', // 'b' for two-square pawn push (standard flag, Pawn Rush is essentially this but from any rank)
      from: clientMoveData.from as Square,
      to: clientMoveData.to as Square,
      color: pawnChessJsColor,
      san: `${clientMoveData.to}`, // Simplified SAN. A proper SAN would be more complex for non-standard moves.

      lan: `${clientMoveData.from}${clientMoveData.to}`,
      before: fenBeforeThisMove,
      after: finalFenAfterMove,

      captured: undefined, // Pawn Rush as defined here is a non-capturing move
      promotion: undefined, // Pawn Rush is distinct from promotion


      // Boolean flags as functions
      isCapture: () => false,
      isPromotion: () => false,
      isEnPassant: () => false,
      isKingsideCastle: () => false,
      isQueensideCastle: () => false,
      isBigPawn: function (): boolean {
        throw new Error('Function not implemented.');
      }
    };
    
    return {
      moveResult,
      nextFen: finalFenAfterMove,
    };

  } catch (e) {
    console.error(`[handlePawnRush] Error loading FEN for Pawn Rush Manual:`, e, `Constructed FEN: ${constructedFenAfterMove}`);
    game.load(fenBeforeThisMove); // Revert game state
    return {
      moveResult: null,
      nextFen: fenBeforeThisMove, 
    };
  }
}
