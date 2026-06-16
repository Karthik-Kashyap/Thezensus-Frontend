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

export interface SegmentDefInput {
  id: string;
  label: string;
  options: string[];
  version?: number;
}

/** Owner-defined member questions: 8 dims max, 2–12 options each, unique ids. */
export function validateSegments(segments: SegmentDefInput[]): SegmentDefInput[] {
  if (segments.length > COMMUNITY_LIMITS.segmentDimensionsMax) {
    throw badRequest(`At most ${COMMUNITY_LIMITS.segmentDimensionsMax} member questions`);
  }
  const ids = new Set<string>();
  return segments.map((s) => {
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
    const options = s.options.map((o) => {
      const t = o.trim();
      if (t.length < 1 || t.length > COMMUNITY_LIMITS.segmentOptionMax) throw badRequest("Invalid segment option");
      return t;
    });
    return { id, label, options, version: s.version ?? 1 };
  });
}

/** Validate a member's segment answers against the community's definitions. */
export function validateSegmentAnswers(
  community: Doc<"communities">,
  answers: Record<string, string>,
): void {
  const defs = new Map((community.segments ?? []).map((s) => [s.id, s]));
  for (const [id, answer] of Object.entries(answers)) {
    const def = defs.get(id);
    if (!def) throw badRequest(`Unknown segment '${id}'`);
    if (!def.options.includes(answer)) {
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
    segments: community.segments ?? [],
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
