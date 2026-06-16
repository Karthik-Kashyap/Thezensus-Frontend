"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Home, Flame, Hash, Plus, Users } from "lucide-react";
import { useSession } from "@/lib/session";
import { listMySubscriptions, listDiscoverableCommunities, getCommunity } from "@/lib/communities";
import { routes } from "@/lib/constants";
import { compactNumber } from "@/lib/format";
import type { CommunitySummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ComingSoon } from "@/components/common/ComingSoon";
import { Skeleton } from "@/components/ui/skeleton";

function NavLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: typeof Home;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

/** One subscribed community — fetches its name/icon lazily. */
function CommunityLink({ communityId, active }: { communityId: string; active: boolean }) {
  const { data } = useQuery({
    queryKey: ["community", communityId],
    queryFn: () => getCommunity(communityId),
  });
  return (
    <Link
      href={routes.community(communityId)}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
        {(data?.name ?? "·")[0]?.toUpperCase()}
      </span>
      <span className="truncate">{data?.name ?? "…"}</span>
    </Link>
  );
}

/** One community the user hasn't joined yet — name + subscriber count, links to its page to join. */
function DiscoverCommunityLink({ community, active }: { community: CommunitySummary; active: boolean }) {
  return (
    <Link
      href={routes.community(community.communityId)}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold">
        {community.name[0]?.toUpperCase() ?? "·"}
      </span>
      <span className="truncate">{community.name}</span>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground/70">
        {compactNumber(community.subscriberCount)}
      </span>
    </Link>
  );
}

/** The sidebar's content — shared by the desktop rail (`Sidebar`) and the mobile drawer. */
export function SidebarNav() {
  const pathname = usePathname();
  const { user } = useSession();
  const { data: subs, isLoading } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: listMySubscriptions,
    enabled: !!user,
  });
  const { data: discover } = useQuery({
    queryKey: ["discoverCommunities"],
    queryFn: () => listDiscoverableCommunities(8),
    // Runs signed-out too — the backend just returns the most popular public communities.
  });

  return (
    <>
      <nav className="space-y-1">
        <NavLink href={routes.home} icon={Home} label="Home" active={pathname === routes.home} />
        <ComingSoon label="Trending feed — coming soon">
          <NavLink href="#" icon={Flame} label="Trending" active={false} />
        </ComingSoon>
        <ComingSoon label="Topics — coming soon">
          <NavLink href="#" icon={Hash} label="Topics" active={false} />
        </ComingSoon>
      </nav>

      {user && (
        <div className="mt-8">
          <div className="flex items-center justify-between px-3 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Your communities
            </span>
            <Link
              href={routes.newCommunity}
              className="text-muted-foreground transition hover:text-primary"
              aria-label="New community"
            >
              <Plus className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-1">
            {isLoading ? (
              <div className="space-y-2 px-3">
                <Skeleton className="h-7 w-full" />
                <Skeleton className="h-7 w-full" />
              </div>
            ) : subs && subs.length > 0 ? (
              subs.map((s) => (
                <CommunityLink
                  key={s.communityId}
                  communityId={s.communityId}
                  active={pathname === routes.community(s.communityId)}
                />
              ))
            ) : (
              <Link
                href={routes.newCommunity}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <Users className="h-4 w-4" /> Create your first
              </Link>
            )}
          </div>
        </div>
      )}

      {discover && discover.length > 0 && (
        <div className="mt-8">
          <div className="px-3 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Discover communities
            </span>
          </div>
          <div className="space-y-1">
            {discover.map((c) => (
              <DiscoverCommunityLink
                key={c.communityId}
                community={c}
                active={pathname === routes.community(c.communityId)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Desktop rail — sticky left column, hidden on mobile (use the nav hamburger there). */
export function Sidebar() {
  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 overflow-y-auto border-r border-border/70 px-3 py-6 md:block">
      <SidebarNav />
    </aside>
  );
}
