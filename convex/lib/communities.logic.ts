// Communities-domain behavior: input validation (the old Zod schemas), the owner-vs-
// moderator update field rules, segment-answer validation, and DTO mapping. DTO shapes
// mirror src/lib/types.ts Community / Subscription / RoleView / BanView.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { COMMUNITY_LIMITS } from "./constants/community";
import { badRequest } from "./errors";
import { getRole, listPins } from "./communities.model";

type Ctx = QueryCtx | MutationCtx;

// ── Validation ───────────────────────────────────────────────────────────────

export function validateName(name: string): string {
  const n = name.trim();
  if (n.length < COMMUNITY_LIMITS.nameMin || n.length > COMMUNITY_LIMITS.nameMax) {
    throw badRequest(`Name must be ${COMMUNITY_LIMITS.nameMin}–${COMMUNITY_LIMITS.nameMax} characters`);
  }
  return n;
}

export function validateDescription(description: string): string {
  const d = description.trim();
  if (d.length > COMMUNITY_LIMITS.descriptionMax) throw badRequest("Description too long");
  return d;
}

export function validateRules(rules: string): string {
  // NOT trimmed — rules preserve the owner's whitespace/formatting.
  if (rules.length > COMMUNITY_LIMITS.rulesMax) throw badRequest("Rules too long");
  return rules;
}

export function validateCommunityTagsCategory(tags?: string[], category?: string): void {
  if (tags) {
    if (tags.length > COMMUNITY_LIMITS.tagsMax) throw badRequest(`At most ${COMMUNITY_LIMITS.tagsMax} tags`);
    if (tags.some((t) => t.length === 0 || t.length > COMMUNITY_LIMITS.tagMax)) throw badRequest("Invalid tag");
  }
  if (category !== undefined && category.length > COMMUNITY_LIMITS.categoryMax) {
    throw badRequest("Invalid category");
  }
}

/**
 * What the owner SENDS: option *label strings* only. The positional `pos` and option
 * `i` indices that make a segKey stable forever (DESIGN-008) are assigned by the
 * backend in `validateSegments` — clients never choose them.
 */
export interface SegmentDefInput {
  id: string;
  label: string;
  options: string[];
  version?: number;
}

/** The stored, positional, append-only segment shape (schema `segmentDef`; mirrors
 *  SegmentSchemaEntry in slicing.logic.ts). `pos` and option `i` are append-only and
 *  never reused; retired segments stay with `archived: true`. */
export interface StoredSegmentDef {
  id: string;
  label: string;
  pos: number;
  options: { i: number; label: string }[];
  version?: number;
  archived?: boolean;
}

/**
 * Validate + MERGE owner-defined member questions into the stored, append-only shape
 * (DESIGN-008 §A). APPEND-ONLY: a segment keeps its `pos` for life and option `i`s are
 * never reordered/renumbered, so a positional segKey like "2.1.0.0.0" means the same
 * thing forever. The merge is against `prior` (the community's current segments):
 *   - id in BOTH  → preserve `pos`; reuse each prior option's `i` for labels that still
 *                   appear (match by label), append genuinely-new labels at max(i)+1;
 *                   update label text if changed.
 *   - NEW id      → assign pos = max(prior pos)+1 (1-based, never a retired slot); i = 1..n.
 *   - prior id MISSING from incoming → keep it as `archived: true` (retain pos+options) so
 *                   old polls' frozen schemas can still resolve labels — never dropped.
 * Limits (lib/constants/community.ts): ≤5 ACTIVE segments, ≤4 options each (DESIGN-008); the
 * dimension cap counts incoming (non-archived) segments only — archived/retired don't count.
 */
export function validateSegments(
  incoming: SegmentDefInput[],
  prior?: StoredSegmentDef[],
): StoredSegmentDef[] {
  // Count the dimension cap against ACTIVE incoming segments only (archived don't count).
  if (incoming.length > COMMUNITY_LIMITS.segmentDimensionsMax) {
    throw badRequest(`At most ${COMMUNITY_LIMITS.segmentDimensionsMax} member questions`);
  }

  const priorById = new Map((prior ?? []).map((p) => [p.id, p]));
  // Highest pos ever used (incl. archived) — new positions only ever go up from here.
  let maxPos = (prior ?? []).reduce((m, p) => Math.max(m, p.pos), 0);

  const ids = new Set<string>();
  const merged: StoredSegmentDef[] = [];

  for (const s of incoming) {
    const id = s.id.trim();
    const label = s.label.trim();
    if (id.length < 1 || id.length > COMMUNITY_LIMITS.segmentIdMax) throw badRequest("Invalid segment id");
    if (label.length < 1 || label.length > COMMUNITY_LIMITS.segmentLabelMax) throw badRequest("Invalid segment label");
    if (ids.has(id)) throw badRequest("Segment ids must be unique");
    ids.add(id);
    if (
      s.options.length < COMMUNITY_LIMITS.segmentOptionsMin ||
      s.options.length > COMMUNITY_LIMITS.segmentOptionsMax
    ) {
      throw badRequest(
        `Segments need ${COMMUNITY_LIMITS.segmentOptionsMin}–${COMMUNITY_LIMITS.segmentOptionsMax} options`,
      );
    }
    const optionLabels = s.options.map((o) => {
      const t = o.trim();
      if (t.length < 1 || t.length > COMMUNITY_LIMITS.segmentOptionMax) throw badRequest("Invalid segment option");
      return t;
    });
    // Option labels must be unique within a segment — they're how we match prior `i`s.
    if (new Set(optionLabels).size !== optionLabels.length) {
      throw badRequest("Segment options must be unique");
    }

    const existing = priorById.get(id);
    if (existing) {
      // Preserve the segment's pos. Reuse prior option `i`s by label; append new labels
      // at the next unused index (max prior i + 1), never reusing a retired `i`.
      const priorByLabel = new Map(existing.options.map((o) => [o.label, o]));
      let nextI = existing.options.reduce((m, o) => Math.max(m, o.i), 0) + 1;
      const options = optionLabels.map((lbl) => {
        const po = priorByLabel.get(lbl);
        return po ? { i: po.i, label: lbl } : { i: nextI++, label: lbl };
      });
      merged.push({
        id,
        label, // label text may change (cosmetic; the `i` is what's stored on votes)
        pos: existing.pos,
        options,
        version: s.version ?? existing.version,
      });
    } else {
      // Brand-new segment: next free position, fresh 1-based option indices.
      merged.push({
        id,
        label,
        pos: ++maxPos,
        options: optionLabels.map((lbl, idx) => ({ i: idx + 1, label: lbl })),
        version: s.version ?? 1,
      });
    }
  }

  // Retire (don't drop) any prior segment the owner left out, retaining pos + options so
  // old polls can still resolve their frozen segKeys back to labels.
  for (const p of prior ?? []) {
    if (!ids.has(p.id)) merged.push({ ...p, archived: true });
  }

  return merged;
}

/**
 * Validate a member's segment answers against the community's CURRENT (non-archived)
 * definitions. Answers are option *label* strings (subscriptions store
 * `Record<segmentId, answerLabel>`). Reject answers for archived or unknown segments.
 */
export function validateSegmentAnswers(
  community: Doc<"communities">,
  answers: Record<string, string>,
): void {
  const defs = new Map((community.segments ?? []).map((s) => [s.id, s]));
  for (const [id, answer] of Object.entries(answers)) {
    const def = defs.get(id);
    if (!def || def.archived) throw badRequest(`Unknown segment '${id}'`);
    if (!def.options.some((o) => o.label === answer)) {
      throw badRequest(`Invalid option '${answer}' for segment '${id}'`);
    }
  }
}

// ── DTO mapping ──────────────────────────────────────────────────────────────

/** Full Community DTO: profile + pinnedPollIds + the viewer's own role (if any). */
export async function toCommunityDetail(
  ctx: Ctx,
  community: Doc<"communities">,
  viewerLinkId: string | null,
): Promise<Record<string, unknown>> {
  const [pins, role] = await Promise.all([
    listPins(ctx, community.communityId),
    viewerLinkId ? getRole(ctx, viewerLinkId, community.communityId) : Promise.resolve(null),
  ]);
  return {
    communityId: community.communityId,
    name: community.name,
    ...(community.description !== undefined ? { description: community.description } : {}),
    ...(community.iconMediaId !== undefined ? { iconMediaId: community.iconMediaId } : {}),
    ...(community.iconKey !== undefined ? { iconKey: community.iconKey } : {}),
    createdAt: new Date(community._creationTime).toISOString(),
    subscriberCount: community.subscriberCount,
    visibility: community.visibility,
    ...(community.tags !== undefined ? { tags: community.tags } : {}),
    ...(community.category !== undefined ? { category: community.category } : {}),
    ...(community.rules !== undefined ? { rules: community.rules } : {}),
    // Expose only ACTIVE segments to clients (the editor + answer UI); archived defs stay
    // in storage so old polls' frozen schemas can still resolve labels (DESIGN-008 §A).
    // Map the stored positional shape (options: {i, label}[]) back to the client contract
    // (options: string[] labels) — the `i`/`pos` indices are backend-internal (DESIGN-008).
    segments: (community.segments ?? [])
      .filter((s) => !s.archived)
      .map((s) => ({
        id: s.id,
        label: s.label,
        options: s.options.map((o) => o.label),
        ...(s.version !== undefined ? { version: s.version } : {}),
      })),
    pinnedPollIds: pins.map((p) => p.pollId),
    ...(role ? { myRole: role.role } : {}),
  };
}

/** Lightweight community card for list views (discover sidebar) — no pin/role reads. */
export function toCommunitySummary(c: Doc<"communities">): Record<string, unknown> {
  return {
    communityId: c.communityId,
    name: c.name,
    subscriberCount: c.subscriberCount,
    ...(c.description !== undefined ? { description: c.description } : {}),
    ...(c.iconKey !== undefined ? { iconKey: c.iconKey } : {}),
  };
}

export function toSubscriptionView(sub: Doc<"subscriptions">): Record<string, unknown> {
  return {
    communityId: sub.communityId,
    subscribedAt: new Date(sub._creationTime).toISOString(),
    segments: sub.segments ?? {},
  };
}

export function toRoleView(role: Doc<"communityRoles">): Record<string, unknown> {
  return {
    linkId: role.linkId,
    role: role.role,
    at: new Date(role._creationTime).toISOString(),
    ...(role.grantedBy !== undefined ? { actor: role.grantedBy } : {}),
  };
}

export function toBanView(ban: Doc<"communityBans">): Record<string, unknown> {
  return {
    linkId: ban.linkId,
    ...(ban.reason !== undefined ? { reason: ban.reason } : {}),
    bannedBy: ban.bannedBy,
    createdAt: new Date(ban._creationTime).toISOString(),
  };
}
