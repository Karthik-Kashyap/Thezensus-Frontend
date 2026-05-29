"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PollDetailView } from "@/components/poll/PollDetailView";
import { Skeleton } from "@/components/ui/skeleton";

function PollContent() {
  const params = useParams<{ pollId: string }>();
  const token = useSearchParams().get("token") ?? undefined;
  return <PollDetailView pollId={params.pollId} token={token} />;
}

export default function PollPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 max-w-2xl rounded-xl" />}>
      <PollContent />
    </Suspense>
  );
}
