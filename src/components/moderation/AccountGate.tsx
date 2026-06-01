"use client";

import { useSession } from "@/lib/session";
import { SuspendedScreen } from "./SuspendedScreen";

/**
 * Wraps the page content. When the signed-in account is not ACTIVE (suspended/banned), it replaces
 * the page with the SuspendedScreen instead of letting the user reach normal surfaces. This is the
 * reliable signal because the gateway keeps GET /users/me reachable while suspended and that
 * response carries `account.status`; the Nav/Sidebar stay mounted so sign-out still works.
 *
 * Signed-out and ACTIVE users pass straight through. We render children while the session is still
 * loading (so the app never blanks for the common logged-out/active case); once /users/me resolves
 * to a non-active account we swap in the SuspendedScreen. A suspended user can't act regardless —
 * the gateway 403s every mutation — so the brief pre-resolve window is harmless.
 */
export function AccountGate({ children }: { children: React.ReactNode }) {
  const { user } = useSession();

  if (user && user.account.status !== "ACTIVE") {
    return <SuspendedScreen account={user.account} />;
  }
  return <>{children}</>;
}
