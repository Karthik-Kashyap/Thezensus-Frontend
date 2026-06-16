"use client";

import Link from "next/link";
import { ArrowRight, Globe, Building2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { routes } from "@/lib/constants";

/**
 * Logged-out landing: states the value prop and routes to sign-in / browse. `compact` trims it
 * to ~a third of the full height (tighter padding, smaller heading, no feature grid) so the live
 * poll feed beneath it gets screen time the moment a visitor lands.
 */
export function Hero({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`grain relative overflow-hidden rounded-3xl border bg-card px-6 text-center shadow-sm sm:px-12 ${
        compact ? "py-8 sm:py-10" : "py-16 sm:py-24"
      }`}
    >
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10" />
      <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
        <Sparkles className="h-3.5 w-3.5 text-primary" /> The world’s opinion, counted
      </div>
      <h1
        className={`mx-auto max-w-3xl font-display font-semibold leading-[1.05] tracking-tight ${
          compact ? "mt-4 text-3xl sm:text-4xl" : "mt-6 text-4xl sm:text-6xl"
        }`}
      >
        Settle anything. <span className="text-primary">Ask everyone.</span>
      </h1>
      <p
        className={`mx-auto max-w-xl text-muted-foreground ${
          compact ? "mt-3 text-base" : "mt-5 text-lg"
        }`}
      >
        Create a poll on anything and get a real answer — from a global audience, your campus, or
        your company. Live results, the moment people vote.
      </p>
      <div className={`flex flex-col items-center justify-center gap-3 sm:flex-row ${compact ? "mt-5" : "mt-8"}`}>
        <LoginDialog
          trigger={
            <Button size="lg" className="w-full sm:w-auto">
              Get started <ArrowRight className="h-4 w-4" />
            </Button>
          }
        />
        <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
          <Link href={routes.newCommunity}>Start a community</Link>
        </Button>
      </div>

      {!compact && (
        <div className="mx-auto mt-14 grid max-w-2xl gap-4 sm:grid-cols-2">
          <Feature
            icon={Globe}
            title="For everyone"
            body="Public polls anyone can find, vote on, and discuss in seconds."
          />
          <Feature
            icon={Building2}
            title="For organizations"
            body="Private communities for universities and companies — results stay with your members."
          />
        </div>
      )}
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: typeof Globe; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-xl border bg-background/50 p-4 text-left backdrop-blur">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-semibold">{title}</div>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
