// Age-gate + account creation (ADR-008/009) — ported from the auth-service. The 13+
// check is a SERVER-SIDE rule computed from the full DOB, never a client-sent age. On
// pass, ONE Convex mutation creates the whole account — identity claim + vault row +
// PII-free user docs + baseline consent ledger — which is exactly the DDB TransactWrite,
// only simpler: a mutation IS a serializable transaction.
//
// First-login race: both calls read the identities index for (GOOGLE, sub); the insert
// gives them overlapping read/write sets, so OCC retries the loser, which then sees the
// winner's identity and resolves to the SAME account (idempotent signup).

import type { MutationCtx } from "../_generated/server";
import { CONSENT_PURPOSE, CONSENT_SOURCE } from "./constants/consent";
import { AGE, CURRENT_POLICY_VERSION, DOB_LIMITS } from "./constants/signup";
import { newUserId } from "./ids";
import { badRequest } from "./errors";
import { getIdentity, insertIdentity, PROVIDER } from "./identities.model";
import { getPiiByUserId, insertPii } from "./pii.model";
import { insertUserItems } from "./users.model";
import { appendConsent } from "./consent.model";
import { ageInYears } from "./users.logic";

/**
 * Consent decisions optionally passed from the client (the 13+ affirmation is implicit + recorded).
 * Demographic analytics is internal/anonymized, so when the client doesn't specify it we default it
 * to granted server-side (see completeSignup). Marketing email isn't collected at signup right now —
 * it derives to not-granted until the email system (and its opt-in UI) is built.
 */
export interface ConsentChoices {
  demographics?: boolean;
}

export interface CompleteSignupInput {
  subject: string; // the verified Google `sub` (from the signup-pending token)
  email: string;
  legalName?: string; // PII-vault only (legal hold); never the public identity
  birthDate: string; // YYYY-MM-DD
  consent?: ConsentChoices;
}

export type SignupOutcome =
  | { status: "created"; linkId: string }
  | { status: "exists"; linkId: string } // lost a first-login race or replayed token
  | { status: "underage" }; // COPPA: nothing created, nothing stored (ADR-008)

export async function completeSignup(ctx: MutationCtx, input: CompleteSignupInput): Promise<SignupOutcome> {
  const now = new Date();
  const age = ageInYears(input.birthDate, now);
  if (Number.isNaN(age) || input.birthDate < DOB_LIMITS.earliest) {
    throw badRequest("Invalid date of birth");
  }
  if (age < AGE.minAgeYears) return { status: "underage" };

  // Idempotency / race: if this identity already has an account, resolve to it.
  const existing = await getIdentity(ctx, PROVIDER.GOOGLE, input.subject);
  if (existing) {
    const pii = await getPiiByUserId(ctx, existing.userId);
    if (!pii) throw new Error(`Identity ${input.subject} resolved to userId with no vault row`);
    return { status: "exists", linkId: pii.linkId };
  }

  const userId = newUserId();
  const birthYear = Number(input.birthDate.slice(0, 4));

  // Demographic analytics consent: granted unless the client explicitly opts out. Internal,
  // anonymized aggregate use — so "not specified" defaults to granted (the sensible default
  // lives here in the business logic, not in any client form).
  const demographicsGranted = input.consent?.demographics ?? true;

  // The users doc goes in first: its _id IS the new linkId (all one transaction, so
  // ordering is about data flow, not atomicity). A unique cosmos handle is assigned inside
  // insertUserItems — the public identity, derived from nothing the user typed.
  const linkId = await insertUserItems(ctx, {
    demographicsConsent: demographicsGranted,
    birthYear,
  });
  await insertIdentity(ctx, PROVIDER.GOOGLE, input.subject, userId);
  await insertPii(ctx, {
    userId,
    linkId,
    email: input.email,
    legalName: input.legalName ?? "",
    birthDate: input.birthDate,
    googleSub: input.subject,
  });

  // Baseline consent ledger: the 13+ affirmation + the demographics default. Marketing email is
  // intentionally not recorded here — it derives to not-granted until the email system + its
  // opt-in flow exist (the ledger purpose stays available for that day).
  const base = { userId, policyVersion: CURRENT_POLICY_VERSION, source: CONSENT_SOURCE.SIGNUP } as const;
  await appendConsent(ctx, { ...base, purpose: CONSENT_PURPOSE.AGE_13PLUS, granted: true });
  await appendConsent(ctx, { ...base, purpose: CONSENT_PURPOSE.DEMOGRAPHICS, granted: demographicsGranted });

  return { status: "created", linkId };
}
