import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SignupForm } from "@/components/auth/SignupForm";
import { COOKIE, readSignupPending } from "@/lib/server/session";

export const metadata: Metadata = { title: "Finish signing up — Thezensus" };

// First-time Google sign-in lands here (the OAuth callback redirects new identities to /signup with
// a short-lived signup-pending cookie). The form completes the account via /auth/signup/complete.
// The pending cookie's Google profile name seeds the display-name field; a missing/expired cookie
// still renders the form — submit returns 400 and the form shows its "start over" screen.
export default async function SignupPage() {
  const pending = await readSignupPending((await cookies()).get(COOKIE.SIGNUP_PENDING)?.value);
  return (
    <div className="mx-auto max-w-md py-8">
      <SignupForm defaultDisplayName={pending?.name} returnTo={pending?.returnTo} />
    </div>
  );
}
