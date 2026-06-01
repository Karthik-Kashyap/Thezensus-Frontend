"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Crown, Shield } from "lucide-react";
import { getCommunity } from "@/lib/communities";
import { routes } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManageModerators } from "@/components/community/ManageModerators";
import { ManageBans } from "@/components/community/ManageBans";
import { ManagePins } from "@/components/community/ManagePins";

/**
 * Community management console (roles / bans / pins). Gated to the community's owner + moderators
 * via the viewer's `myRole` on the community DTO; anyone else is redirected to the community page
 * (fail-closed, same pattern as the platform AdminGate). UX only — the service re-checks the role.
 */
export default function CommunityManagePage() {
  const { communityId } = useParams<{ communityId: string }>();
  const router = useRouter();

  const { data: community, isLoading } = useQuery({
    queryKey: ["community", communityId],
    queryFn: () => getCommunity(communityId),
  });

  const role = community?.myRole;
  const allowed = role === "OWNER" || role === "MODERATOR";

  useEffect(() => {
    if (!isLoading && !allowed) router.replace(routes.community(communityId));
  }, [isLoading, allowed, communityId, router]);

  if (isLoading || !allowed || !community) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isOwner = role === "OWNER";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Link
          href={routes.community(communityId)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {community.name}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Manage community</h1>
          <Badge variant={isOwner ? "primary" : "outline"} className="gap-1">
            {isOwner ? <Crown className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
            {isOwner ? "Owner" : "Moderator"}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="moderators">
        <TabsList>
          <TabsTrigger value="moderators">Moderators</TabsTrigger>
          <TabsTrigger value="bans">Bans</TabsTrigger>
          <TabsTrigger value="pins">Pinned polls</TabsTrigger>
        </TabsList>
        <TabsContent value="moderators">
          <ManageModerators communityId={communityId} isOwner={isOwner} />
        </TabsContent>
        <TabsContent value="bans">
          <ManageBans communityId={communityId} />
        </TabsContent>
        <TabsContent value="pins">
          <ManagePins communityId={communityId} pinnedPollIds={community.pinnedPollIds ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
