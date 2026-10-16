// Review dates. A right answer moves a question one step up the ladder. A miss sends it back to 1 day.
export const GAPS = [1, 3, 7, 14, 30];
export const DAILY_CAP = 20;

export function nextGap(currentGap: number | null, correct: boolean): number {
  if (!correct || currentGap === null) return GAPS[0];
  const step = GAPS.findIndex((g) => g >= currentGap);
  if (step === -1) return GAPS[GAPS.length - 1];
  return GAPS[Math.min(step + 1, GAPS.length - 1)];
}
