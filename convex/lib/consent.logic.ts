// Consent ledger read/write (ADR-009) — ported from the auth-service. The authoritative
// record is the append-only consents table (keyed by userId); callers arrive with a
// linkId, resolved via the vault. Toggling `demographics` ALSO syncs the denormalized
// `demographicsConsent` flag (+ birthYear) on userDemographics — that flag is what the
// hot vote path checks; it never reads the vault. Withdrawal stops future use only.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import { CONSENT_PURPOSE, CONSENT_SOURCE } from "./constants/consent";
import { CURRENT_POLICY_VERSION } from "./constants/signup";
import { notFound } from "./errors";
import { getPiiByLinkId } from "./pii.model";
import { appendConsent, getLatestConsentMap } from "./consent.model";
import { updateDemographics } from "./users.model";

export interface ConsentView {
  policyVersion: string;
  purposes: { demographics: boolean; marketing_email: boolean; age_13plus: boolean };
}

/** The caller's current consent state (latest event per purpose). */
export async function getConsentView(ctx: QueryCtx | MutationCtx, linkId: string): Promise<ConsentView> {
  const pii = await getPiiByLinkId(ctx, linkId);
  if (!pii) throw notFound("User not found");
  const latest = await getLatestConsentMap(ctx, pii.userId);
  return {
    policyVersion: CURRENT_POLICY_VERSION,
    purposes: {
      demographics: latest.get(CONSENT_PURPOSE.DEMOGRAPHICS)?.granted ?? false,
      marketing_email: latest.get(CONSENT_PURPOSE.MARKETING_EMAIL)?.granted ?? false,
      // The 13+ affirmation is captured at signup and is always true for an existing account.
      age_13plus: latest.get(CONSENT_PURPOSE.AGE_13PLUS)?.granted ?? true,
    },
  };
}

export interface UpdateConsentInput {
  demographics?: boolean;
  marketingEmail?: boolean;
}

/** Append consent events for the changed purposes; sync the vote-path demographics flag. */
export async function applyConsentUpdate(
  ctx: MutationCtx,
  linkId: string,
  input: UpdateConsentInput,
): Promise<ConsentView> {
  const pii = await getPiiByLinkId(ctx, linkId);
  if (!pii) throw notFound("User not found");
  const base = { userId: pii.userId, policyVersion: CURRENT_POLICY_VERSION, source: CONSENT_SOURCE.SETTINGS } as const;

  if (input.demographics !== undefined) {
    await appendConsent(ctx, { ...base, purpose: CONSENT_PURPOSE.DEMOGRAPHICS, granted: input.demographics });
    // On (re)grant, populate birthYear from the vault DOB so age-sliced tallies work. On
    // withdrawal, flipping the flag alone stops future snapshotting; birthYear is left
    // inert rather than removed — it's never used while consent is off.
    await updateDemographics(ctx, linkId, {
      demographicsConsent: input.demographics,
      birthYear: input.demographics ? Number(pii.birthDate.slice(0, 4)) : undefined,
    });
  }

  if (input.marketingEmail !== undefined) {
    await appendConsent(ctx, { ...base, purpose: CONSENT_PURPOSE.MARKETING_EMAIL, granted: input.marketingEmail });
  }

  return getConsentView(ctx, linkId);
}
