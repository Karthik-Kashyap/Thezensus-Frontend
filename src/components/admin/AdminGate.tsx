"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { routes } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Gates the admin / moderation console. Renders children only for a signed-in platform admin.
 * `MeProfile.isAdmin` is the surface signal; the moderation-service still enforces `requireAdmin`
 * on every call, so this is UX convenience, not the security boundary. Anyone without access — a
 * signed-out visitor or a signed-in non-admin — is sent home; the area is never revealed to exist.
 * A pre-rebuild backend omits `isAdmin` (undefined → falsy), which fails closed.
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useSession();
  const router = useRouter();

  const allowed = !!user?.isAdmin;

  useEffect(() => {
    if (!isLoading && !allowed) {
      router.replace(routes.home);
    }
  }, [isLoading, allowed, router]);

  if (isLoading || !allowed) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}
