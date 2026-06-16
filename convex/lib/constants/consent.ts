// Consent ledger constants (ADR-009) — ported from backend/shared/src/constants/consent.ts.
// The consents table is append-only, keyed by userId (consent is about the legal person):
// a new event per change, never overwritten. Current state for a purpose = its latest event.

/**
 * Processing purposes a user consents to. `demographics` is hard-gated by the vote path
 * (snapshots are written only with it); `age_13plus` is the 13+ affirmation captured at
 * signup (ADR-008). Login / recording a vote / security are NOT consent-gated (different
 * legal basis) and have no purpose here.
 */
export const CONSENT_PURPOSE = {
  DEMOGRAPHICS: "demographics",
  MARKETING_EMAIL: "marketing_email",
  COOKIES_ANALYTICS: "cookies_analytics",
  AGE_13PLUS: "age_13plus",
} as const;

export type ConsentPurpose = (typeof CONSENT_PURPOSE)[keyof typeof CONSENT_PURPOSE];

/** Where a consent event originated. */
export const CONSENT_SOURCE = {
  SIGNUP: "signup",
  SETTINGS: "settings",
  RECONSENT: "reconsent", // re-prompted after a policy-version bump
} as const;

export type ConsentSource = (typeof CONSENT_SOURCE)[keyof typeof CONSENT_SOURCE];
