import { Chess, Move, Square, PieceSymbol } from 'chess.js';

// Define a more specific type for clientMoveData based on its use for Castle Master
interface CastleMasterClientMoveData {
  from: string; // King's starting square (e.g., 'e1')
  to: string;   // King's ending square (e.g., 'g1' or 'c1')
  special?: string;
  color: 'white' | 'black'; // Color of the player making the move - Marked as non-optional
  rookFrom: string; // Rook's starting square (e.g., 'h1' or 'a1') - Marked as non-optional
  rookTo: string;   // Rook's ending square (e.g., 'f1' or 'd1') - Marked as non-optional
}

interface CastleMasterParams {
  game: Chess;
  clientMoveData: CastleMasterClientMoveData;
  currentFen: string; // This is room.fen before the move (FEN before this Castle Master move)
  playerColor: 'w' | 'b'; // Color of the player making the move ('w' or 'b')
}

interface CastleMasterResult {
  moveResult: Move | null;
  nextFen: string;
}

export function handleCastleMaster({
  game, // This is the serverGame instance, should be loaded with currentFen by caller initially
  clientMoveData,
  currentFen: fenBeforeThisMove,
  playerColor, 
}: CastleMasterParams): CastleMasterResult {

  if (!clientMoveData.color || !clientMoveData.rookFrom || !clientMoveData.rookTo || clientMoveData.color[0] !== playerColor) {
    console.error(`[handleCastleMaster] Invalid Castle Master move received, missing/mismatched data:`, clientMoveData, `Player color: ${playerColor}`);
    return {
      moveResult: null,
      nextFen: fenBeforeThisMove, 
    };
  }

  const castlingPlayerChessJsColor = playerColor;

  // Store the FEN *before* pieces are moved but *after* initial game state was set up by caller.
  const internalBeforeFen = game.fen(); 

  game.remove(clientMoveData.from as Square);
  game.remove(clientMoveData.rookFrom as Square);
  game.put({ type: "k", color: castlingPlayerChessJsColor }, clientMoveData.to as Square);
  game.put({ type: "r", color: castlingPlayerChessJsColor }, clientMoveData.rookTo as Square);

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
  fenParts[1] = (castlingPlayerChessJsColor === "w") ? "b" : "w";
  let currentCastlingRights = fenParts[2];
  if (castlingPlayerChessJsColor === "w") {
    currentCastlingRights = currentCastlingRights.replace("K", "").replace("Q", "");
  } else { 
    currentCastlingRights = currentCastlingRights.replace("k", "").replace("q", "");
  }
  if (currentCastlingRights === "") currentCastlingRights = "-";
  fenParts[2] = currentCastlingRights;
  fenParts[3] = "-"; 
  fenParts[4] = "0"; 
  const currentFullMove = parseInt(fenParts[5], 10);
  if (castlingPlayerChessJsColor === "b") {
    fenParts[5] = (currentFullMove + 1).toString();
  }
  
  // This is the FEN *after* piece manipulation but *before* game.load validates it.
  const constructedFenAfterMove = fenParts.join(" ");

  try {
    // game.load() updates the game state, including turn, move number, etc.
    game.load(constructedFenAfterMove); 
    
    if (game.fen() !== constructedFenAfterMove) {
      console.warn(`[handleCastleMaster] FEN mismatch after Castle Master: Server game FEN "${game.fen()}" vs constructed FEN "${constructedFenAfterMove}". Using loaded FEN.`);
    }
    
    const finalFenAfterMove = game.fen(); // FEN after move is validated and loaded

    const isKingside = clientMoveData.to === 'g1' || clientMoveData.to === 'g8';
    const isQueenside = clientMoveData.to === 'c1' || clientMoveData.to === 'c8';

    const moveResult: Move = {
      color: castlingPlayerChessJsColor,
      from: clientMoveData.from as Square,
      to: clientMoveData.to as Square,
      flags: isKingside ? 'k' : 'q', // 'k' kingside, 'q' queenside
      piece: 'k', // King is the piece that moves in castling from user's perspective
      san: isKingside ? 'O-O' : 'O-O-O',

      lan: `${clientMoveData.from}${clientMoveData.to}`, // Simple LAN for castling
      before: fenBeforeThisMove, // FEN before this Castle Master operation started
      after: finalFenAfterMove, // FEN after this Castle Master operation

      captured: undefined, // No piece is captured in castling
      promotion: undefined, // No promotion in castling


      // Boolean flags as functions
      isCapture: () => false,
      isPromotion: () => false,
      isEnPassant: () => false, // Castling is not en passant
      isKingsideCastle: () => isKingside,
      isQueensideCastle: () => isQueenside,
      isBigPawn: function (): boolean {
        throw new Error('Function not implemented.');
      }
    };
    
    return {
      moveResult,
      nextFen: finalFenAfterMove,
    };

  } catch (e) {
    console.error(`[handleCastleMaster] Error loading FEN for Castle Master:`, e, `Constructed FEN: ${constructedFenAfterMove}`);
    // If FEN loading fails, revert game instance to the state before this function was called
    game.load(fenBeforeThisMove); 
    return {
      moveResult: null,
      nextFen: fenBeforeThisMove, 
    };
  }
}
