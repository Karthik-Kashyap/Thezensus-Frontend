// Scheduled work registry. The tally is now WAKE-ON-VOTE (DESIGN-009): votes self-schedule
// the drain, so there is no scan-on-timer tick anymore. The only tally cron is the liveness
// backstop — an O(shards) sweep that re-arms a shard if its self-scheduled drain was dropped
// (dead action). Idle cost is W=TALLY_SHARDS point reads per SAFETY_SWEEP_SECONDS, NOT the
// old whole-registry .collect() every 5s. Phase 4 adds the retention sweep crons.

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { SAFETY_SWEEP_SECONDS } from "./lib/constants/poll";

const crons = cronJobs();

// Tally liveness backstop (DESIGN-009 §4b.8). The drain itself runs on demand; this only
// recovers shards whose drain action died mid-pass. Folds are idempotent, so re-arming a
// maybe-alive shard is harmless.
crons.interval(
  "tally safety sweep",
  { seconds: SAFETY_SWEEP_SECONDS },
  internal.tally.safetySweep,
  {},
);

// Abandoned-upload cleanup (ADR-010; legal-hold aware). Daily is plenty — the
// deadline is 7 days, so the sweep lag is noise.
crons.interval(
  "media retention sweep",
  { hours: 24 },
  internal.retention.sweepMedia,
  {},
);

export default crons;
