// Community + comment domain constants — ported from backend community-service /
// comment-service constants and shared/src/constants/items.ts. Enum string values are
// wire contracts with src/lib/types.ts.

export const COMMUNITY_ROLE = {
  OWNER: "OWNER",
  MODERATOR: "MODERATOR",
} as const;
export type CommunityRole = (typeof COMMUNITY_ROLE)[keyof typeof COMMUNITY_ROLE];

export const COMMENT_STATUS = {
  ACTIVE: "ACTIVE",
  REMOVED: "REMOVED",
} as const;
export type CommentStatus = (typeof COMMENT_STATUS)[keyof typeof COMMENT_STATUS];

export const COMMUNITY_LIMITS = {
  nameMin: 2,
  nameMax: 60,
  descriptionMax: 500,
  rulesMax: 4000,
  tagsMax: 10,
  tagMax: 40,
  categoryMax: 40,
  segmentDimensionsMax: 5, // DESIGN-008: ≤5 ACTIVE segments (5×4 = 1024-row cross-tab budget)
  segmentOptionsMin: 2,
  segmentOptionsMax: 4, // DESIGN-008: ≤4 options each (keeps ∏ options ≤ CROSSTAB_ROW_BUDGET)
  segmentIdMax: 40,
  segmentLabelMax: 120,
  segmentOptionMax: 60,
  banReasonMax: 500,
} as const;

export const COMMENT_LIMITS = {
  textMin: 1,
  textMax: 2000,
  shareTokenMax: 64,
} as const;

export const COMMENT_PAGE = {
  defaultLimit: 20,
  maxLimit: 100,
} as const;

export const DEFAULT_COMMUNITY_VISIBILITY = "public" as const;
