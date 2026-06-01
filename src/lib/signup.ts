// auth-service signup client (ADR-008/009). The first-time Google identity is handed a signed
// signup-pending cookie by the OAuth callback; this completes the account with a DOB + consent.
// The server enforces the 13+ age gate (a 403 means under-13 — nothing was stored).

import { api } from "./api";
import type { CompleteSignupInput } from "./types";

/** POST /auth/signup/complete → { linkId } (201). Sets the session cookie on success. */
export const completeSignup = (input: CompleteSignupInput) =>
  api.post<{ linkId: string }>("/auth/signup/complete", input);
