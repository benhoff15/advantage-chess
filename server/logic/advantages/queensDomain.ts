import { Chess, Move, Square, PieceSymbol } from 'chess.js';
import { PlayerAdvantageStates, ServerMovePayload } from '../../../shared/types';

interface QueensDomainState {
  isActive: boolean;
  hasUsed: boolean;
}

interface ValidateQueensDomainServerMoveParams {
  game: Chess; 
  clientMoveData: ServerMovePayload; 
  currentFen: string; 
  playerColor: 'w' | 'b'; 
  queensDomainState: QueensDomainState | undefined; 
}

interface ValidationResult {
  moveResult: Move | null;
  nextFen: string;
  error?: string | null;
}

export const validateQueensDomainServerMove = ({
  game, 
  clientMoveData,
  currentFen, 
  playerColor,
  queensDomainState,
}: ValidateQueensDomainServerMoveParams): ValidationResult => {

  console.log(`[validateQueensDomainServerMove V2] Validating. Player: ${playerColor}, FEN: ${game.fen()}`); 
  console.log(`[validateQueensDomainServerMove V2] Received QD State: ${JSON.stringify(queensDomainState)}, Client Special Flag: ${clientMoveData.special}`);

  if (game.turn() !== playerColor) {
    console.log("[validateQueensDomainServerMove V2] Returning error: Not player's turn.");
    return { moveResult: null, nextFen: game.fen(), error: "Not player's turn." };
  }

  const pieceMoving = game.get(clientMoveData.from as Square);

  const attemptQueensDomain =
    queensDomainState?.isActive === true &&
    !queensDomainState?.hasUsed &&
    pieceMoving?.type === 'q' &&
    pieceMoving?.color === playerColor &&
    clientMoveData.special === 'queens_domain_move';

  console.log(`[validateQueensDomainServerMove V2] attemptQueensDomain outcome: ${attemptQueensDomain}`);

  if (attemptQueensDomain) {
    const from = clientMoveData.from as Square;
    const to = clientMoveData.to as Square;

    const pieceOnTargetSquareOriginalGame = game.get(to); 
    if (pieceOnTargetSquareOriginalGame && pieceOnTargetSquareOriginalGame.color === playerColor) {
      console.log("[validateQueensDomainServerMove V2] QD Fail: Cannot land on friendly piece at", to);
      return { moveResult: null, nextFen: currentFen, error: "Cannot capture friendly piece." };
    }

    const fromCoord = { file: from.charCodeAt(0), rank: parseInt(from[1]) };
    const toCoord = { file: to.charCodeAt(0), rank: parseInt(to[1]) };
    const deltaFile = toCoord.file - fromCoord.file;
    const deltaRank = toCoord.rank - fromCoord.rank;

    if (!((deltaFile === 0 && deltaRank !== 0) ||      
          (deltaRank === 0 && deltaFile !== 0) ||      
          (Math.abs(deltaFile) === Math.abs(deltaRank) && deltaFile !== 0))) { 
      console.log("[validateQueensDomainServerMove V2] QD Fail: Invalid queen trajectory.");
      return { moveResult: null, nextFen: currentFen, error: "Invalid move path for queen (not straight or diagonal)." };
    }
    
    const stepFile = deltaFile === 0 ? 0 : deltaFile / Math.abs(deltaFile);
    const stepRank = deltaRank === 0 ? 0 : deltaRank / Math.abs(deltaRank);
    const steps = Math.max(Math.abs(deltaFile), Math.abs(deltaRank));

    for (let i = 1; i < steps; i++) { 
      const currentFileChar = String.fromCharCode(fromCoord.file + i * stepFile);
      const currentRankNum = fromCoord.rank + i * stepRank;
      const pathSq = (currentFileChar + currentRankNum) as Square;
      const pieceOnPath = game.get(pathSq); 
      if (pieceOnPath && pieceOnPath.color !== playerColor) { 
        console.log("[validateQueensDomainServerMove V2] QD Fail: Path blocked by enemy piece at", pathSq);
        return { moveResult: null, nextFen: currentFen, error: "Path is blocked by an enemy piece." };
      }
    }
    console.log("[validateQueensDomainServerMove V2] QD Path and Destination Checks Passed (no intermediate enemies, destination not friendly).");

    const tempGame = new Chess(currentFen); 
    
    const capturedPieceOnTo = tempGame.get(to); 

    const pieceToMove = tempGame.remove(from); 

    if (!pieceToMove || pieceToMove.type !== 'q') { 
        console.error("[validateQueensDomainServerMove V2] CRITICAL QD Error: Piece at 'from' was not a queen or was null during manual move.");
        return { moveResult: null, nextFen: currentFen, error: "Internal error: Original piece not found or incorrect." };
    }
    
    tempGame.put({ type: 'q', color: playerColor }, to); 

    if (tempGame.inCheck()) { 
      console.log("[validateQueensDomainServerMove V2] QD Fail: Move results in self-check (king is in check).");
      return { moveResult: null, nextFen: currentFen, error: "Move puts your king in check." };
    }

    const newFen = tempGame.fen();
    const opponentColor = playerColor === 'w' ? 'b' : 'w';
    const fenParts = newFen.split(' ');
    fenParts[1] = opponentColor; 
    const finalFenWithTurn = fenParts.join(' ');
    
    const finalValidationGame = new Chess(finalFenWithTurn);

    const moveResultObject: Move = {
      color: playerColor,
      from: from,
      to: to,
      flags: capturedPieceOnTo ? 'c' : 'n', 
      piece: 'q', 
      san: finalValidationGame.history({verbose:true}).length > 0 ? finalValidationGame.history({verbose:true})[0].san : `Q${to}`,
      lan: `${from}${to}`,
      before: currentFen,
      after: finalFenWithTurn,
      
      captured: capturedPieceOnTo ? capturedPieceOnTo.type : undefined,
      promotion: undefined, // Corrected from null to undefined

      // Boolean flags changed to methods returning boolean
      isCapture: () => !!capturedPieceOnTo,
      isPromotion: () => false,
      isEnPassant: () => false,
      isKingsideCastle: () => false,
      isQueensideCastle: () => false,
      isBigPawn: () => false,
    };

    console.log("[validateQueensDomainServerMove V2] QD Success. Move:", JSON.stringify(moveResultObject));
    return {
      moveResult: moveResultObject,
      nextFen: finalFenWithTurn,
      error: null,
    };

  } else {
    // Standard move or QD conditions not met
    console.log("[validateQueensDomainServerMove V2] Processing as standard move or non-applicable QD.");
    if (clientMoveData.special === 'queens_domain_move' && (!queensDomainState?.isActive || queensDomainState?.hasUsed)) {
        let reason = "Queen's Domain cannot be used.";
        if (queensDomainState?.hasUsed) reason = "Queen's Domain has already been used.";
        else if (!queensDomainState?.isActive) reason = "Queen's Domain is not active.";
        console.log("[validateQueensDomainServerMove V2] Returning error:", reason);
        return { moveResult: null, nextFen: currentFen, error: reason };
    }

    try {
      const moveResult = game.move({ 
        from: clientMoveData.from as Square,
        to: clientMoveData.to as Square,
        promotion: clientMoveData.promotion as PieceSymbol | undefined,
      });

      if (moveResult) {
        console.log("[validateQueensDomainServerMove V2] Standard move success.");
        return { moveResult, nextFen: game.fen(), error: null };
      } else {
        const history = game.history({verbose: true});
        const lastMove = history.pop();
        let attemptedSan = "";
        if (lastMove && lastMove.from === clientMoveData.from && lastMove.to === clientMoveData.to) {
            // This might not work as expected if move failed.
        } else {
            const tempSanGame = new Chess(currentFen);
            try {
                const tempMove = tempSanGame.move({from: clientMoveData.from as Square, to: clientMoveData.to as Square, promotion: clientMoveData.promotion as PieceSymbol | undefined});
                if (tempMove) attemptedSan = tempMove.san; else attemptedSan = `${clientMoveData.from}-${clientMoveData.to}`;
            } catch { attemptedSan = `${clientMoveData.from}-${clientMoveData.to} (SAN gen failed)`; }
        }
        console.log(`[validateQueensDomainServerMove V2] Standard move failed (chess.js). Attempted: ${attemptedSan}`);
        return { moveResult: null, nextFen: currentFen, error: `Invalid move: ${clientMoveData.from}-${clientMoveData.to}` };
      }
    } catch (e: any) { 
      console.log("[validateQueensDomainServerMove V2] Error during standard game.move():", e.message);
      return { moveResult: null, nextFen: currentFen, error: e.message || "Error making standard move." };
    }
  }
};
