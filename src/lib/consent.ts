// Consent client (ADR-009), now Convex-backed. The ledger is append-only server-side;
// these read the latest state per purpose and submit toggles. Toggling `demographics`
// also syncs the flag the vote path reads (handled in convex/lib/consent.logic).

import { api } from "../../convex/_generated/api";
import { withApiError } from "./convexErrors";
import type { ConsentView, UpdateConsentInput } from "./types";

export const getConsent = async (): Promise<ConsentView> => {
  const { convex } = await import("./convexClient");
  return (await withApiError(convex.query(api.consent.get, {}))) as ConsentView;
};

export const updateConsent = async (input: UpdateConsentInput): Promise<ConsentView> => {
  const { convex } = await import("./convexClient");
  return (await withApiError(convex.mutation(api.consent.update, input))) as ConsentView;
};
