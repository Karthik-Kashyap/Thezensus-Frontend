"use client";

import { useQuery } from "@tanstack/react-query";
import type { PublicProfile } from "@/lib/types";
import { listCreatorPolls } from "@/lib/polls";
import { relativeTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { UserAvatar } from "@/components/common/UserAvatar";
import { FollowButton } from "./FollowButton";
import { ReportButton } from "@/components/moderation/ReportDialog";
import { PollFeed } from "@/components/poll/PollFeed";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComingSoon } from "@/components/common/ComingSoon";
import { PageContainer } from "@/components/layout/PageContainer";

export function ProfileView({ profile }: { profile: PublicProfile }) {
  const { user } = useSession();
  const isSelf = user?.linkId === profile.linkId;
  const demo = profile.demographics;
  const demoLine =
    demo && (demo.gender || demo.region)
      ? [demo.gender?.replace(/_/g, " "), demo.region].filter(Boolean).join(" · ")
      : null;

  return (
    <PageContainer className="space-y-6">
      <Card className="overflow-hidden">
        <div className="grain relative h-20 bg-gradient-to-r from-primary/20 via-secondary/15 to-primary/10" />
        <CardContent className="-mt-10 space-y-4">
          <div className="flex items-end justify-between">
            <UserAvatar
              name={profile.displayName}
              mediaId={profile.avatarMediaId}
              ownerId={profile.linkId}
              mediaKey={profile.avatarKey}
              isSelf={isSelf}
              className="h-20 w-20 ring-4 ring-card shadow-md"
            />
            {!isSelf && (
              <div className="flex items-center gap-2">
                <FollowButton />
                {user && (
                  <ReportButton targetType="USER" targetId={profile.linkId} label="Report user" />
                )}
              </div>
            )}
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {profile.displayName}
            </h1>
            <p className="text-sm text-muted-foreground">joined {relativeTime(profile.createdAt)}</p>
          </div>
          {profile.bio && <p className="text-[15px] leading-relaxed">{profile.bio}</p>}
          <div className="flex gap-6 border-t pt-4">
            <Stat label="Polls" value={profile.stats.pollsCreated} />
            <Stat label="Votes received" value={profile.stats.totalVotesReceived} />
            {demoLine && <div className="text-sm text-muted-foreground">{demoLine}</div>}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="polls">
        <TabsList>
          <TabsTrigger value="polls">Polls</TabsTrigger>
          <ComingSoon label="Voting history — coming soon">
            <TabsTrigger value="voted" disabled>
              Voted on
            </TabsTrigger>
          </ComingSoon>
        </TabsList>
        <TabsContent value="polls">
          <PollFeed
            queryKey={["creatorPolls", profile.linkId]}
            fetchPage={(cursor) => listCreatorPolls(profile.linkId, { cursor })}
            emptyTitle="No polls yet"
            emptyMessage={isSelf ? "Create your first poll to see it here." : "This user hasn’t posted any public polls."}
          />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-display text-xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
