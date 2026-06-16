// Profile client, now Convex-backed. (Reading the current user lives in lib/session.)
//
// getPublicProfile is isomorphic — the profile page reads it during SSR — so it uses a
// one-shot ConvexHttpClient. The authed mutations run in the browser on the shared live
// client (lazy import: lib/convexClient is a "use client" module and must never load in
// a server component).

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { withApiError } from "./convexErrors";
import type { DeletionResult, MeProfile, PublicProfile, UpdateProfileInput } from "./types";

export const updateMe = async (input: UpdateProfileInput): Promise<MeProfile> => {
  const { convex } = await import("./convexClient");
  return (await withApiError(convex.mutation(api.users.updateMe, input))) as MeProfile;
};

/** Public profile addressed by linkId (the value in /profile/[userId] is a linkId — ADR-006). */
export const getPublicProfile = async (linkId: string): Promise<PublicProfile> => {
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  return (await withApiError(client.query(api.users.getPublic, { linkId }))) as PublicProfile;
};

/** Irreversible account erasure (FOUNDATION-02, Phase A for now). 409 if a legal hold is active. */
export const deleteMe = async (): Promise<DeletionResult> => {
  const { convex } = await import("./convexClient");
  return (await withApiError(convex.mutation(api.users.deleteMe, {}))) as DeletionResult;
};
