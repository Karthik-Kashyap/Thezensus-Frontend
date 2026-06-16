// Signup / age-gate / consent constants (ADR-008, ADR-009) — ported from the
// auth-service. The 13+ floor is a server-side BUSINESS RULE enforced in the logic
// layer (signup.logic), never a validation `min` — the DOB validator only checks
// "is a real past date".

/** COPPA age gate (ADR-008). Computed server-side from the full DOB; never trust a client age. */
export const AGE = {
  minAgeYears: 13,
} as const;

/**
 * The consent policy version stamped on every ledger event (ADR-009). A material policy
 * change bumps this, which triggers reconsent on next login. A date string is intentional.
 */
export const CURRENT_POLICY_VERSION = "2026-05-30";

/** DOB sanity bounds (a real, plausible past date). The age DECISION is logic, not validation. */
export const DOB_LIMITS = {
  earliest: "1900-01-01",
} as const;
