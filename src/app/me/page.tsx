"use client";

import { useSession } from "@/lib/session";
import { relativeTime } from "@/lib/format";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { ConsentSettings } from "@/components/profile/ConsentSettings";
import { DangerZone } from "@/components/profile/DangerZone";
import { AvatarUploader } from "@/components/profile/AvatarUploader";
import { SignInGate } from "@/components/auth/SignInGate";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/layout/PageContainer";

export default function MyProfilePage() {
  const { user, isLoading } = useSession();

  if (isLoading) {
    return (
      <PageContainer className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  if (!user) {
    return (
      <SignInGate
        title="Your profile"
        message="Sign in to view and edit your profile."
      />
    );
  }

  const stats = [
    { label: "Polls", value: user.stats.pollsCreated },
    { label: "Votes cast", value: user.stats.votesCast },
    { label: "Votes received", value: user.stats.totalVotesReceived },
  ];

  return (
    <PageContainer className="space-y-6">
      <Card className="overflow-hidden">
        <div className="grain relative h-20 bg-gradient-to-r from-primary/20 via-secondary/15 to-primary/10" />
        <CardContent className="-mt-10 space-y-4">
          <div className="flex items-end justify-between">
            <AvatarUploader user={user} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{user.displayName}</h1>
            <p className="text-sm text-muted-foreground">
              {user.settings.email} · joined {relativeTime(user.createdAt)}
            </p>
          </div>
          <div className="flex gap-6 border-t pt-4">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="font-display text-xl font-semibold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <ProfileEditor user={user} />
      <ConsentSettings />
      <DangerZone />
    </PageContainer>
  );
}
