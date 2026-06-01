import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Finish signing up — Thezensus" };

// First-time Google sign-in lands here (the OAuth callback redirects new identities to /signup with
// a short-lived signup-pending cookie). The form completes the account via /auth/signup/complete.
export default function SignupPage() {
  return (
    <div className="mx-auto max-w-md py-8">
      <SignupForm />
    </div>
  );
}
