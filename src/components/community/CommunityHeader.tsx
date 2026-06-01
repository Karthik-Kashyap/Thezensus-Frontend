"use client";

import Link from "next/link";
import { Globe, Lock, Shield, Plus, Settings, Users } from "lucide-react";
import type { Community, Visibility } from "@/lib/types";
import { routes } from "@/lib/constants";
import { compactNumber } from "@/lib/format";
import { useMediaUrl } from "@/lib/media-url";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubscribeButton } from "./SubscribeButton";

const VIS_META: Record<Visibility, { icon: typeof Globe; label: string }> = {
  public: { icon: Globe, label: "Public" },
  protected: { icon: Shield, label: "Protected" },
  private: { icon: Lock, label: "Private" },
};

export function CommunityHeader({ community }: { community: Community }) {
  const iconUrl = useMediaUrl({
    mediaId: community.iconMediaId,
    ownerId: community.communityId,
    key: community.iconKey,
  });
  const vis = VIS_META[community.visibility];

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="grain relative h-24 bg-gradient-to-br from-primary/25 via-secondary/15 to-primary/10" />
      <div className="-mt-10 px-5 pb-5">
        <div className="flex items-end justify-between gap-4">
          <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border-4 border-card bg-primary/12 text-2xl font-semibold text-primary shadow-md">
            {iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={iconUrl} alt={community.name} className="h-full w-full object-cover" />
            ) : (
              community.name[0]?.toUpperCase()
            )}
          </div>
          <div className="flex items-center gap-2 pb-1">
            {community.myRole && (
              <Button asChild variant="outline" size="icon" title="Manage community">
                <Link href={routes.communityManage(community.communityId)} aria-label="Manage community">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={routes.newPoll(community.communityId)}>
                <Plus className="h-4 w-4" /> New poll
              </Link>
            </Button>
            <SubscribeButton
              communityId={community.communityId}
              communityName={community.name}
              segments={community.segments}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{community.name}</h1>
          <Badge variant="outline" className="gap-1">
            <vis.icon className="h-3 w-3" /> {vis.label}
          </Badge>
        </div>
        {community.description && (
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {community.description}
          </p>
        )}
        <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          {compactNumber(community.subscriberCount)} member
          {community.subscriberCount === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}
