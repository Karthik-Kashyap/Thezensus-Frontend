"use client";

// Create poll — CSR, auth-gated (DESIGN-001 §9).
export default function CreatePollPage() {
  // TODO(DESIGN §9): redirect to /auth/login?returnTo=/poll/create if unauthenticated.
  // TODO(DESIGN §9): <CreatePollForm /> — 3 steps; image upload via presigned S3 URL (§10.9).
  return (
    <main>
      <h1>Create a poll</h1>
    </main>
  );
}
