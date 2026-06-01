// auth-service consent client (ADR-009). The consent ledger is append-only server-side; these
// read the latest state per purpose and submit toggles. Toggling `demographics` also syncs the
// flag the vote path reads (handled in the backend).

import { api } from "./api";
import type { ConsentView, UpdateConsentInput } from "./types";

export const getConsent = () => api.get<ConsentView>("/users/me/consent");

export const updateConsent = (input: UpdateConsentInput) =>
  api.put<ConsentView>("/users/me/consent", input);
