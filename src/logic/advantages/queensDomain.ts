import { Chess, Square, Piece, Move } from 'chess.js'; // Ensure Move is imported

export interface QueensDomainClientState {
  isActive: boolean;
  hasUsed: boolean;
}

// Helper to check if the queen can use the domain for a specific move
export const canQueenUseDomain = (
  game: Chess, // Game instance
  from: Square,
  to: Square,
  playerColor: 'w' | 'b',
  queensDomainState: QueensDomainClientState | undefined
): boolean => {
  console.log("[canQueenUseDomain] Validating. From:", from, "To:", to, "PlayerColor:", playerColor, "State:", JSON.stringify(queensDomainState));
  if (!queensDomainState || !queensDomainState.isActive || queensDomainState.hasUsed) {
    console.log("[canQueenUseDomain] Fail: QD state not active, already used, or undefined.");
    return false;
  }

  const piece = game.get(from);
  if (!piece || piece.type !== 'q' || piece.color !== playerColor) {
    console.log("[canQueenUseDomain] Fail: Not player's queen or piece missing.");
    return false; // Not the player's queen
  }

  // Check if 'to' square is occupied by a friendly piece (illegal for QD)
  const pieceOnTarget = game.get(to);
  if (pieceOnTarget && pieceOnTarget.color === playerColor) {
    console.log("[canQueenUseDomain] Fail: Target is friendly piece.");
    return false;
  }
  
  // Validate path: can only be blocked by friendly pieces, not enemy pieces.
  const fromCoord = { file: from.charCodeAt(0), rank: parseInt(from[1]) };
  const toCoord = { file: to.charCodeAt(0), rank: parseInt(to[1]) };
  const deltaFile = toCoord.file - fromCoord.file;
  const deltaRank = toCoord.rank - fromCoord.rank;

  if (!((deltaFile === 0 && deltaRank !== 0) ||      // File move
        (deltaRank === 0 && deltaFile !== 0) ||      // Rank move
        (Math.abs(deltaFile) === Math.abs(deltaRank) && deltaFile !== 0))) { // Diagonal move
    console.log("[canQueenUseDomain] Fail: Invalid queen trajectory.");
    return false; // Not a valid queen trajectory
  }
  
  const stepFile = deltaFile === 0 ? 0 : deltaFile / Math.abs(deltaFile);
  const stepRank = deltaRank === 0 ? 0 : deltaRank / Math.abs(deltaRank);
  const steps = Math.max(Math.abs(deltaFile), Math.abs(deltaRank));

  for (let i = 1; i < steps; i++) {
    const currentFileChar = String.fromCharCode(fromCoord.file + i * stepFile);
    const currentRankNum = fromCoord.rank + i * stepRank;
    const pathSq = (currentFileChar + currentRankNum) as Square;
    const pieceOnPath = game.get(pathSq);

    if (pieceOnPath && pieceOnPath.color !== playerColor) { // Enemy piece on path
      console.log("[canQueenUseDomain] Fail: Path blocked by enemy piece at:", pathSq);
      return false; // Blocked by enemy
    }
  }
  
  // Additionally, the move must be pseudo-legal if we ignore friendly blockers.
  // chess.js .move() will check for self-check, so we don't need to fully replicate that here.
  // The main thing is path clearance of enemies.
  
  // Create a temporary game where friendly pieces (not king) are removed from the path
  // to see if chess.js would allow the move in principle.
  // This is complex. A simpler check might be to just rely on server validation for "puts king in check".
  // For client-side indication, clearing enemy pieces from path is primary.
  
  // Let's assume if path is clear of enemies, it's a candidate for QD.
  // The server will do the final validation (including checks).
  console.log("[canQueenUseDomain] Success: Path clear for QD.");
  return true;
};

export const getQueenGhostPath = (
  game: Chess,
  from: Square,
  playerColor: 'w' | 'b',
  queensDomainState: QueensDomainClientState | undefined
): Square[] => {
  console.log("[getQueenGhostPath V3] Calculating. From:", from, "PlayerColor:", playerColor, "State:", JSON.stringify(queensDomainState));
  const ghostSquares: Square[] = [];
  if (!queensDomainState || !queensDomainState.isActive || queensDomainState.hasUsed) {
    console.log("[getQueenGhostPath V3] Returning early: QD not active or used.");
    return ghostSquares;
  }

  const piece = game.get(from);
  if (!piece || piece.type !== 'q' || piece.color !== playerColor) {
    console.log("[getQueenGhostPath V3] Returning early: Not player's queen.");
    return ghostSquares;
  }

  const directions = [
    { dr: 0, df: 1 }, { dr: 0, df: -1 }, // Right, Left
    { dr: 1, df: 0 }, { dr: -1, df: 0 }, // Up, Down (rank increase, rank decrease)
    { dr: 1, df: 1 }, { dr: 1, df: -1 }, // Up-Right, Up-Left
    { dr: -1, df: 1 }, { dr: -1, df: -1 }, // Down-Right, Down-Left
  ];

  const fromRank = parseInt(from[1]);
  const fromFileCharCode = from.charCodeAt(0);

  for (const dir of directions) {
    // console.log(`[getQueenGhostPath V3] New Direction: dr=${dir.dr}, df=${dir.df}`);
    for (let i = 1; i < 8; i++) { // Max 7 steps in any direction
      const nextRankNum = fromRank + i * dir.dr;
      const nextFileCharCode = fromFileCharCode + i * dir.df;

      if (nextRankNum < 1 || nextRankNum > 8 || nextFileCharCode < 'a'.charCodeAt(0) || nextFileCharCode > 'h'.charCodeAt(0)) {
        // console.log(`[getQueenGhostPath V3] Off board: ${String.fromCharCode(nextFileCharCode)}${nextRankNum}. Stop direction.`);
        break; // Off board, stop this direction
      }

      const toSq = String.fromCharCode(nextFileCharCode) + nextRankNum as Square;
      // console.log(`[getQueenGhostPath V3] Checking toSq: ${toSq}`);
      const pieceOnToSq = game.get(toSq);

      if (pieceOnToSq) {
        if (pieceOnToSq.color === playerColor) { // Friendly piece at this square
          console.log(`[getQueenGhostPath V3 - Corrected] Square ${toSq} has friendly piece. Not a landing spot. Continuing ray to check further.`);
          continue; // THIS IS THE KEY CHANGE: Do not add to ghostSquares, but check next square in this direction.
        } else { // Enemy piece at this square
          console.log(`[getQueenGhostPath V3] Square ${toSq} has enemy piece. Add as capture. Stop ray.`);
          ghostSquares.push(toSq); // Valid capture
          break; // Stop this direction after capture
        }
      } else { // Empty square at this square
        console.log(`[getQueenGhostPath V3] Square ${toSq} is empty. Add.`);
        ghostSquares.push(toSq); // Valid empty square
        // Continue loop for 'i' to check further in this direction (implicitly done)
      }
    }
  }
  console.log("[getQueenGhostPath V3] Returning ghostSquares:", JSON.stringify(ghostSquares));
  return ghostSquares;
};
