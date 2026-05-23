"use client";

// OAuth callback (DESIGN-001 §4.2 steps 11-12).
export default function AuthCallbackPage() {
  // TODO(DESIGN §4.2): Amplify exchanges the Cognito code for tokens, then redirect to
  //                    sessionStorage `returnTo` (default "/").
  return (
    <main>
      <p>Signing you in…</p>
    </main>
  );
}
