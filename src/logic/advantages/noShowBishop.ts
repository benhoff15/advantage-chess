/**
 * Checks if the No-Show Bishop summon action is available.
 *
 * @param historyLength The current length of the game's history (number of half-moves).
 * @param noShowBishopUsed Indicates whether the No-Show Bishop advantage has already been used.
 * @returns True if the summon is available, false otherwise.
 */
export const isSummonAvailable = (
  historyLength: number,
  noShowBishopUsed?: boolean
): boolean => {
  const available = historyLength < 20 && (noShowBishopUsed === false || noShowBishopUsed === undefined);

  console.log(
    `isSummonAvailable called with: historyLength=${historyLength}, noShowBishopUsed=${noShowBishopUsed}. Result: ${available}`
  );

  return available;
};
