"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session";
import { CreatePollForm } from "@/components/poll/CreatePollForm";
import { SignInGate } from "@/components/auth/SignInGate";
import { Skeleton } from "@/components/ui/skeleton";

function NewPollContent() {
  const community = useSearchParams().get("community") ?? undefined;
  const { user, isLoading } = useSession();

  if (isLoading) return <Skeleton className="mx-auto h-96 max-w-2xl" />;
  if (!user) {
    return (
      <SignInGate
        title="Create a poll"
        message="Sign in to ask the world a question."
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Create a poll</h1>
        <p className="mt-1 text-muted-foreground">Ask anything. Get the world’s answer.</p>
      </div>
      <CreatePollForm initialCommunityId={community} />
    </div>
  );
}

export default function NewPollPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-2xl" />}>
      <NewPollContent />
    </Suspense>
  );
}
