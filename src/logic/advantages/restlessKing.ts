import { toast } from "react-toastify";

/**
 * Displays a toast notification related to the Restless King advantage.
 * @param isYou True if the notice is for the player who activated Restless King, 
 *              false if it's for the player affected by it.
 * @param remaining The number of uses left for the player who activated the advantage. 
 *                  Only relevant if isYou is true.
 */
export function showRestlessKingNotice(isYou: boolean, remaining: number) {
  if (isYou) {
    toast(`Restless King: Opponent cannot check. ${remaining} uses left.`);
  } else {
    toast(`You cannot check this turn due to Restless King.`);
  }
}
