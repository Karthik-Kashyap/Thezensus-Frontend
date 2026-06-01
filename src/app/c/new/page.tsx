"use client";

import { useSession } from "@/lib/session";
import { CreateCommunityForm } from "@/components/community/CreateCommunityForm";
import { SignInGate } from "@/components/auth/SignInGate";
import { Skeleton } from "@/components/ui/skeleton";

export default function NewCommunityPage() {
  const { user, isLoading } = useSession();

  if (isLoading) return <Skeleton className="mx-auto h-96 max-w-2xl" />;
  if (!user) {
    return (
      <SignInGate
        title="Create a community"
        message="Sign in to start a community."
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">New community</h1>
        <p className="mt-1 text-muted-foreground">
          A home for your polls — open to the world, or private for your org.
        </p>
      </div>
      <CreateCommunityForm />
    </div>
  );
}
