// One-off data migrations. Internal-only (never on the public API) — run from the Convex
// dashboard or `npx convex run`. Each is paged + idempotent so it's safe to re-run.
//
// DESIGN-008 region split: `region` ("US-CA") → two flat marginals `country` ("US") +
// `state` ("US-CA"), then the deprecated `region` field is cleared. This is the MIGRATE step
// of widen-migrate-narrow; run it before removing `region` from schema.ts (the NARROW).

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { isValidCountry } from "./lib/constants/geo";

const PAGE = 200;

/** Parse a legacy region string into ISO country + ISO-3166-2 state. Unparseable / unknown
 *  country → both undefined (the value is dropped; the row's region is still cleared). */
function splitRegion(region: string): { country?: string; state?: string } {
  const m = /^([A-Z]{2})(?:-([A-Z0-9]{1,3}))?$/.exec(region.trim().toUpperCase());
  if (!m || !isValidCountry(m[1])) return {};
  const country = m[1];
  return { country, state: m[2] ? `${country}-${m[2]}` : undefined };
}

/**
 * userDemographics: region → country/state, then clear region. Patching `region: undefined`
 * removes the field, so once every page is done the table satisfies the narrowed schema.
 */
export const backfillRegionToCountryState = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("userDemographics")
      .paginate({ cursor: cursor ?? null, numItems: PAGE });

    let migrated = 0;
    for (const doc of page) {
      if (doc.region === undefined) continue;
      const { country, state } = splitRegion(doc.region);
      await ctx.db.patch(doc._id, {
        ...(country !== undefined ? { country } : {}),
        ...(state !== undefined ? { state } : {}),
        region: undefined, // clear the deprecated field
      });
      migrated++;
    }
    return { isDone, continueCursor, migrated };
  },
});

/**
 * votes: same region → country/state conversion inside the demographics snapshot, dropping the
 * legacy region key. Historical/immutable otherwise; this only reshapes the geo fields so the
 * narrowed votes.demographics validator accepts them. Re-run with continueCursor until isDone.
 */
export const clearVoteRegion = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const { page, isDone, continueCursor } = await ctx.db
      .query("votes")
      .paginate({ cursor: cursor ?? null, numItems: PAGE });

    let migrated = 0;
    for (const doc of page) {
      const demo = doc.demographics;
      if (!demo || demo.region === undefined) continue;
      const next = { ...demo };
      delete next.region; // drop the legacy key from the snapshot
      const { country, state } = splitRegion(demo.region);
      if (country !== undefined) next.country = country;
      if (state !== undefined) next.state = state;
      await ctx.db.patch(doc._id, { demographics: next });
      migrated++;
    }
    return { isDone, continueCursor, migrated };
  },
});
