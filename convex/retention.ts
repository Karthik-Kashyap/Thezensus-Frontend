// Retention sweeps — the DynamoDB-TTL replacement (ADR-010), legal-hold aware.
// Phase 4 ships the abandoned-media sweep; fraudSignals/notifications sweeps arrive
// with their domains. Every sweep checks holds before deleting (intent unchanged from
// the legal-hold TTL-strip design).

import { internalMutation } from "./_generated/server";
import { subjectKey, SUBJECT_TYPE } from "./lib/constants/moderation";
import { hasActiveHold } from "./lib/legalHolds.model";

const SWEEP_BATCH = 500;

/**
 * Abandoned uploads: PENDING media rows past their deadline. PRESERVED rows never
 * carry pendingExpiresAt (stripped on preserve), and a hold also blocks the delete.
 * S3 objects under staging/ are reaped by a bucket lifecycle rule, not from here.
 */
export const sweepMedia = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("media")
      // .gt(0) bounds the range so rows WITHOUT a deadline (undefined) stay out of it
      .withIndex("by_pending_expiry", (q) => q.gt("pendingExpiresAt", 0).lt("pendingExpiresAt", Date.now()))
      .take(SWEEP_BATCH);

    let deleted = 0;
    for (const media of expired) {
      if (await hasActiveHold(ctx, [subjectKey(SUBJECT_TYPE.MEDIA, media.mediaId)])) continue;
      await ctx.db.delete(media._id);
      deleted += 1;
    }
    return { deleted, scanned: expired.length };
  },
});
