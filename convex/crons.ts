// Scheduled work registry. Phase 2: the tally tick (the single-writer publish loop —
// see convex/tally.ts). Phase 4 adds the retention sweep crons (the DynamoDB-TTL
// replacement, legal-hold aware).
//
// Cost note (REVIEW-002 §5): a 5s tick is ~17k function calls/day even when idle
// (~520k/mo — fine on Pro, roughly half the free tier). Lengthen TALLY_INTERVAL_SECONDS
// in lib/constants/poll.ts if dev-deployment quota ever matters; it only changes how
// often viewers see results move.

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
// import { TALLY_INTERVAL_SECONDS } from "./lib/constants/poll"; // re-add with the tally tick below

const crons = cronJobs();

// ⏸️ TEMPORARILY DISABLED (2026-06-15) — the 5s tick burns DB IO even when idle
// (~1.45 GB observed). Re-enable by uncommenting; vote results won't publish/update
// while it's off. See the cost note above.
// crons.interval(
//   "tally tick",
//   { seconds: TALLY_INTERVAL_SECONDS },
//   internal.tally.tick,
//   {},
// );

// Abandoned-upload cleanup (ADR-010; legal-hold aware). Daily is plenty — the
// deadline is 7 days, so the sweep lag is noise.
crons.interval(
  "media retention sweep",
  { hours: 24 },
  internal.retention.sweepMedia,
  {},
);

export default crons;
