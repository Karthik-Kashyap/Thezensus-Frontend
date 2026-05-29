"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useSession } from "@/lib/session";
import { routes } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationsBell } from "./NotificationsBell";
import { UserMenu } from "./UserMenu";
import { LoginDialog } from "@/components/auth/LoginDialog";

export function Nav() {
  const { user, isLoading } = useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center gap-4 px-4 sm:px-8">
        <Link href={routes.home} className="group flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm transition group-hover:rotate-[-6deg]">
            <span className="font-display text-lg font-semibold leading-none">T</span>
          </span>
          <span className="font-display text-xl font-semibold tracking-tight">
            Thezensus
          </span>
        </Link>

        <div className="flex-1" />

        <nav className="flex items-center gap-1.5">
          {user && (
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href={routes.newPoll()}>
                <Plus className="h-4 w-4" /> Create
              </Link>
            </Button>
          )}
          <ThemeToggle />
          {isLoading ? (
            <Skeleton className="h-9 w-9 rounded-full" />
          ) : user ? (
            <>
              <NotificationsBell />
              <UserMenu user={user} />
            </>
          ) : (
            <LoginDialog trigger={<Button size="sm">Sign in</Button>} />
          )}
        </nav>
      </div>
    </header>
  );
}
