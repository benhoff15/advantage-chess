import { Chess, Move, Square, Piece } from 'chess.js'; // Ensure Piece is imported

export function isEligibleCoordinatedPushPair(game: Chess, firstMove: Move): Square[] {
    // Ensure firstMove itself is valid before using its properties extensively
    if (!firstMove || typeof firstMove.from !== 'string' || typeof firstMove.to !== 'string' || typeof firstMove.piece !== 'string' || typeof firstMove.color !== 'string') {
        return [];
    }
    
    const fromRankNum = parseInt(firstMove.from[1]);
    const toRankNum = parseInt(firstMove.to[1]);

    // 1. Check if the first move was a one-square pawn push
    // Also check if from and to files are the same (not a capture)
    if (firstMove.piece !== 'p' || 
        firstMove.flags.includes('c') || // Check for capture flag
        firstMove.flags.includes('e') || // Check for en-passant flag
        firstMove.from[0] !== firstMove.to[0] || // Must be in the same file
        Math.abs(toRankNum - fromRankNum) !== 1) {
        return [];
    }
    
    // Further check correct direction for color (already in original logic, good to keep)
    if (firstMove.color === 'w' && toRankNum <= fromRankNum) {
        return [];
    }
    if (firstMove.color === 'b' && toRankNum >= fromRankNum) {
        return [];
    }


    const eligiblePawns: Square[] = [];
    const playerColor = firstMove.color;
    const fromSquare = firstMove.from;
    // fromRank and fromFile already calculated using fromRankNum for fromRank
    const fromFile = fromSquare.charCodeAt(0);

    const adjacentFiles = [fromFile - 1, fromFile + 1];

    for (const adjFileCharCode of adjacentFiles) {
        const adjFile = String.fromCharCode(adjFileCharCode);
        if (adjFileCharCode < 'a'.charCodeAt(0) || adjFileCharCode > 'h'.charCodeAt(0)) { // Check if file is out of bounds
            continue;
        }

        const adjacentSquare = `${adjFile}${fromRankNum}` as Square;

        const pieceOnAdjacentSquare = game.get(adjacentSquare);

        if (pieceOnAdjacentSquare && pieceOnAdjacentSquare.type === 'p' && pieceOnAdjacentSquare.color === playerColor) {
            const targetRank = fromRankNum + (playerColor === 'w' ? 1 : -1);
            // Rank check (1-8)
            if (targetRank < 1 || targetRank > 8) { 
                 continue;
            }
            const targetSquare = `${adjFile}${targetRank}` as Square;

            const pieceOnTargetSquare = game.get(targetSquare);

            if (pieceOnTargetSquare === null || typeof pieceOnTargetSquare === 'undefined') {
                eligiblePawns.push(adjacentSquare);
            }
        }
    }

    return eligiblePawns;
}

/**
 * Validates if the client's proposed coordinated push move (two pawn moves) is valid.
 * This is a lighter validation compared to server-side, mainly for UI feedback.
 * @param firstMove The first pawn's move.
 * @param secondMove The second pawn's move.
 * @returns True if the moves appear to be a valid coordinated push, false otherwise.
 */
export function validateCoordinatedPushClientMove(firstMove: Move, secondMove: Move): boolean {
  // Check if both pieces are pawns
  if (firstMove.piece !== 'p' || secondMove.piece !== 'p') {
    return false;
  }

  // Check if both pawns are of the same color
  if (firstMove.color !== secondMove.color) {
    return false;
  }

  // Check if pawns are on the same rank
  if (firstMove.from[1] !== secondMove.from[1]) {
    return false;
  }

  // Check if pawns are on adjacent files
  if (Math.abs(firstMove.from.charCodeAt(0) - secondMove.from.charCodeAt(0)) !== 1) {
    return false;
  }

  const playerColor = firstMove.color;
  const expectedFirstToRank = parseInt(firstMove.from[1]) + (playerColor === 'w' ? 1 : -1);
  const expectedSecondToRank = parseInt(secondMove.from[1]) + (playerColor === 'w' ? 1 : -1);

  // Check if the first pawn moved one square forward
  if (parseInt(firstMove.to[1]) !== expectedFirstToRank || firstMove.from[0] !== firstMove.to[0]) {
    return false;
  }

  // Check if the second pawn moved one square forward
  if (parseInt(secondMove.to[1]) !== expectedSecondToRank || secondMove.from[0] !== secondMove.to[0]) {
    return false;
  }
  
  // Check that moves are not captures
  if (firstMove.flags.includes('c') || firstMove.flags.includes('e') ||
      secondMove.flags.includes('c') || secondMove.flags.includes('e')) {
    return false;
  }

  return true;
}
