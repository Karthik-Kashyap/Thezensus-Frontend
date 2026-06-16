// Media registry access — Phase 1 needs only the avatar-attach read (users.updateMe).
// The full upload/processing/sweep surface arrives in Phase 5.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/** Owner-scoped read (DDB PK=ownerId, SK=mediaId): media owned by anyone else is simply not found. */
export async function getMedia(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  mediaId: string,
): Promise<Doc<"media"> | null> {
  return await ctx.db
    .query("media")
    .withIndex("by_owner_media", (q) => q.eq("ownerId", ownerId).eq("mediaId", mediaId))
    .unique();
}
