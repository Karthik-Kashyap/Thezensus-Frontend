// Client-side session state. The session is an httpOnly cookie we can't read from JS,
// so "who am I" is answered by probing /users/me: a profile means signed in, 401 means out.

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { MeProfile } from "./types";

/** The current user's profile, or null if not signed in. */
export async function getCurrentUser(): Promise<MeProfile | null> {
  try {
    return await api.get<MeProfile>("/users/me");
  } catch (e) {
    if ((e as { status?: number }).status === 401) return null;
    throw e;
  }
}

/** React-query-backed session hook. The ["me"] key is shared with the profile editor. */
export function useSession() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["me"], queryFn: getCurrentUser });
  return { user: data ?? null, isLoading, refetch };
}
