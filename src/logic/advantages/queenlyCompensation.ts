import { ServerMovePayload } from '../../../shared/types'; // Adjust path as needed

interface ToastCheckParams {
  move: ServerMovePayload;
  myColor: 'white' | 'black';
  myAdvantageId?: string;
  // Potentially add opponentAdvantageId if the toast should show for the opponent too
}

export function shouldShowQueenlyCompensationToast({
  move,
  myColor,
  myAdvantageId,
}: ToastCheckParams): boolean {
  console.log(`[QC Client Toast Check] Move effect: ${move.specialServerEffect}, MyAdv: ${myAdvantageId}, Move color: ${move.color}, MyColor: ${myColor}`);

  // The toast should appear for the player whose queen was compensated.
  // The `move.color` in ServerMovePayload is the color of the player who made the move.
  // The Queenly Compensation effect applies to the *other* player.
  const playerWhoseQueenWasCompensated = move.color === 'white' ? 'black' : 'white';

  if (
    move.specialServerEffect === 'queenly_compensation_triggered' &&
    myAdvantageId === 'queenly_compensation' &&
    playerWhoseQueenWasCompensated === myColor
  ) {
    console.log('[QC Client Toast Check] Conditions met for owner. Show toast.');
    return true;
  }
  
  // The ChessGame.tsx can decide on a generic toast for the opponent if 
  // `move.specialServerEffect === 'queenly_compensation_triggered'`
  // and `playerWhoseQueenWasCompensated !== myColor`.
  // This function is specifically for the advantage owner's unique toast.

  console.log('[QC Client Toast Check] Conditions not met for owner toast.');
  return false;
}
