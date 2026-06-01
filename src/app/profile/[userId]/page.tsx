import { getPublicProfile } from "@/lib/profile";
import type { PublicProfile } from "@/lib/types";
import { ProfileView } from "@/components/profile/ProfileView";

// Public profile — SSR. Public fields only: never settings; demographics only when the
// owner set demographicsPublic (the backend enforces this).
export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  // The `[userId]` path segment is a linkId (ADR-006 pseudonym); the folder name is kept for URL stability.
  const { userId: linkId } = await params;

  let profile: PublicProfile | null = null;
  let notFound = false;
  try {
    profile = await getPublicProfile(linkId);
  } catch (e) {
    if ((e as { status?: number }).status === 404) notFound = true;
    else throw e;
  }

  if (notFound || !profile) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-display text-2xl font-semibold">User not found</h1>
        <p className="mt-2 text-muted-foreground">This profile doesn’t exist.</p>
      </div>
    );
  }

  return <ProfileView profile={profile} />;
}
