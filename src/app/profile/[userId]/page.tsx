// Public profile — SSR (DESIGN-001 §9).
export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: { userId: string } }) {
  // TODO(DESIGN §9): fetch GET /users/:id + that user's polls (GSI2). Public fields only.
  return (
    <main>
      <h1>Profile {params.userId}</h1>
    </main>
  );
}
