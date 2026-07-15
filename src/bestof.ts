/** Hard ceiling on best-of-N: caps live concurrency, upstream spend, and array allocation. */
export const MAX_BEST_OF = 16;

/** Coerce any input to a valid candidate count in [1, MAX_BEST_OF]; NaN/Infinity/≤0 → 1. */
export function normalizeBestOf(n: unknown): number {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1) return 1;
  return Math.min(v, MAX_BEST_OF);
}

/** Coerce a judge's winner index to a valid candidate index; anything invalid → 0 (fail closed). */
export function normalizeWinner(winner: number, count: number): number {
  return Number.isInteger(winner) && winner >= 0 && winner < count ? winner : 0;
}
