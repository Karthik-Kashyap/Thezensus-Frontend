// Client-side session state, now Convex-live. The session is an httpOnly cookie the
// browser can't read; "who am I" is the live `users.me` query — null when signed out
// (the old "401 from /users/me" contract). Components keep the same { user, isLoading,
// refetch } shape as the React-Query era; profile edits now propagate INSTANTLY to every
// subscriber (no ["me"] cache invalidation needed).

"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { convex } from "./convexClient";
import type { MeProfile } from "./types";

/** One-shot read of the current user (for non-hook call sites). Null = signed out. */
export async function getCurrentUser(): Promise<MeProfile | null> {
  return (await convex.query(api.users.me, {})) as MeProfile | null;
}

/** Live session hook. `isLoading` covers the initial connect + auth handshake. */
export function useSession() {
  const me = useQuery(api.users.me);
  return {
    user: (me ?? null) as MeProfile | null,
    isLoading: me === undefined,
    // Convex queries are live — there is nothing to manually refetch. Kept for API
    // compatibility with existing call sites; safe no-op.
    refetch: async () => {},
  };
}
