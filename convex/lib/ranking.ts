// Feed ranking. The Hacker News "hot" score: a poll's pull decays with age, so a fresh
// poll with a handful of votes outranks a stale poll with many. Pure — the home feed
// (and later the Explore feed) rank their candidate sets with it server-side.

/** Higher gravity = stronger recency bias (older polls fall off faster). HN uses 1.8. */
export const HOT_GRAVITY = 1.8;

/**
 * Multiplier applied to a poll's hot score once the viewer has already voted on its
 * current edition. <1 sinks voted polls below comparable unvoted ones, but because it
 * scales (not zeroes) the score, a much hotter voted poll still outranks lukewarm
 * unvoted ones — so voted polls sprinkle in rather than all collapsing to the bottom.
 * Lower = more aggressive deprioritization.
 */
export const VOTED_HOT_PENALTY = 0.18;

/**
 * HN "hot": votes damped by age. `creationTime` is a Convex `_creationTime` (ms epoch),
 * `now` is passed in (captured once per ranking pass) so a single sort stays stable.
 */
export function hotScore(votes: number, creationTime: number, now: number): number {
  const ageHours = (now - creationTime) / 3_600_000;
  return votes / Math.pow(ageHours + 2, HOT_GRAVITY);
}
