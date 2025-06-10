import { Chess, Square } from 'chess.js';
import { PlayerAdvantageStates } from '../../../shared/types';

export interface VoidStepClientState {
  isActive: boolean;
  hasUsed: boolean;
}

export function isVoidStepAvailable(state: PlayerAdvantageStates): boolean {
  //console.log("[Void Step Debug] Checking availability:", { state });
  const isAvailable = state.voidStep !== undefined && state.voidStep.hasUsed === false;
  //console.log("[Void Step Debug] Is available:", isAvailable);
  return isAvailable;
}

export function canPieceUseVoidStep(
  game: Chess,
  from: Square,
  to: Square,
  playerColor: 'w' | 'b',
  voidStepState: VoidStepClientState | undefined
): boolean {
  console.log("[Void Step Debug] Checking if piece can use void step:", {
    from,
    to,
    playerColor,
    voidStepState,
    piece: game.get(from)
  });

  if (!voidStepState?.isActive) {
    //console.log("[Void Step Debug] Void step not active");
    return false;
  }
  
  const piece = game.get(from);
  if (!piece || piece.color !== playerColor) {
    //console.log("[Void Step Debug] Invalid piece or color");
    return false;
  }
  
  if (piece.type === 'k') {
    //console.log("[Void Step Debug] King cannot use void step");
    return false;
  }
  
  // Get valid moves for the piece
  const validMoves = getValidVoidStepMoves(game, from, playerColor, voidStepState);
  const canMove = validMoves.includes(to);
  //console.log("[Void Step Debug] Can move:", canMove, "Valid moves:", validMoves);
  return canMove;
}

export function getVoidStepPath(
  from: Square,
  to: Square,
  pieceType: string
): Square[] {
  // Only sliding pieces need a path
  if (!['r', 'b', 'q'].includes(pieceType)) return [];

  const path: Square[] = [];
  const fromRank = parseInt(from[1]);
  const fromFile = from[0].charCodeAt(0);
  const toRank = parseInt(to[1]);
  const toFile = to[0].charCodeAt(0);

  const rankDir = fromRank === toRank ? 0 : fromRank < toRank ? 1 : -1;
  const fileDir = fromFile === toFile ? 0 : fromFile < toFile ? 1 : -1;

  let currentRank = fromRank + rankDir;
  let currentFile = fromFile + fileDir;

  while (currentRank !== toRank || currentFile !== toFile) {
    const square = `${String.fromCharCode(currentFile)}${currentRank}` as Square;
    path.push(square);
    currentRank += rankDir;
    currentFile += fileDir;
    if (currentRank === toRank && currentFile === toFile) break;
  }

  // Remove the destination square if present (we only want the path between)
  if (path.length && path[path.length - 1] === to) path.pop();

  return path;
}

export function getValidVoidStepMoves(
  game: Chess,
  from: Square,
  playerColor: 'w' | 'b',
  voidStepState: VoidStepClientState | undefined
): Square[] {
  console.log("[Void Step Debug] Getting valid moves:", {
    from,
    playerColor,
    voidStepState,
    piece: game.get(from)
  });

  if (!voidStepState?.isActive) {
    //console.log("[Void Step Debug] Void step not active");
    return [];
  }
  
  const piece = game.get(from);
  if (!piece || piece.color !== playerColor) return [];
  if (piece.type === 'k') return [];

  const possibleMoves: Square[] = [];
  const fromRank = parseInt(from[1]);
  const fromFile = from[0].charCodeAt(0);

  // Sliding pieces: rook, bishop, queen
  if (['b', 'r', 'q'].includes(piece.type)) {
    const directions =
      piece.type === 'b'
        ? [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]
        : piece.type === 'r'
        ? [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
          ]
        : [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
          ];

    for (const [dr, df] of directions) {
      let r = fromRank;
      let f = fromFile;
      while (true) {
        r += dr;
        f += df;
        if (r < 1 || r > 8 || f < 97 || f > 104) break;
        const sq = `${String.fromCharCode(f)}${r}` as Square;
        const target = game.get(sq);
        if (!target) {
          possibleMoves.push(sq);
        } else if (target.color !== playerColor) {
          possibleMoves.push(sq); // Can capture enemy
          break; // Stop after enemy
        } else {
          // Friendly piece: skip, but keep going (void step ignores friendly blockers)
          continue;
        }
      }
    }
    return possibleMoves;
  }

  // Knight logic (standard, as knights jump)
  if (piece.type === 'n') {
    const knightMoves = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];
    for (const [dr, df] of knightMoves) {
      const r = fromRank + dr;
      const f = fromFile + df;
      if (r < 1 || r > 8 || f < 97 || f > 104) continue;
      const sq = `${String.fromCharCode(f)}${r}` as Square;
      const target = game.get(sq);
      if (!target || target.color !== playerColor) {
        possibleMoves.push(sq);
      }
    }
    return possibleMoves;
  }

  // Pawn logic (allow forward moves even if blocked)
  if (piece.type === 'p') {
    const dir = playerColor === 'w' ? 1 : -1;
    // Forward one
    let r = fromRank + dir;
    if (r >= 1 && r <= 8) {
      const sq = `${from[0]}${r}` as Square;
      const target = game.get(sq);
      if (!target) possibleMoves.push(sq);
      // Double move from starting position
      if ((playerColor === 'w' && fromRank === 2) || (playerColor === 'b' && fromRank === 7)) {
        let r2 = fromRank + 2 * dir;
        const sq2 = `${from[0]}${r2}` as Square;
        if (!game.get(sq2)) possibleMoves.push(sq2);
      }
    }
    // Captures (only if enemy present)
    for (const df of [-1, 1]) {
      const f = fromFile + df;
      if (f < 97 || f > 104) continue;
      const sq = `${String.fromCharCode(f)}${fromRank + dir}` as Square;
      const target = game.get(sq);
      if (target && target.color !== playerColor) possibleMoves.push(sq);
    }
    return possibleMoves;
  }

  return [];
}
