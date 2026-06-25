import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SignupForm } from "@/components/auth/SignupForm";
import { COOKIE, readSignupPending } from "@/lib/server/session";

export const metadata: Metadata = { title: "Finish signing up — Pollzens" };

// First-time Google sign-in lands here (the OAuth callback redirects new identities to /signup with
// a short-lived signup-pending cookie). The form completes the account via /auth/signup/complete.
// No name is collected — the public identity is an auto-generated handle. A missing/expired cookie
// still renders the form — submit returns 401/400 and the form shows its "start over" screen.
export default async function SignupPage() {
  const pending = await readSignupPending((await cookies()).get(COOKIE.SIGNUP_PENDING)?.value);
  return (
    <div className="mx-auto max-w-md py-8">
      <SignupForm returnTo={pending?.returnTo} />
    </div>
  );
}
