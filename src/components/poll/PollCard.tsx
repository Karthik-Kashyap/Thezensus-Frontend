"use client";

import Link from "next/link";
import { MessageSquare, Repeat } from "lucide-react";
import type { PollListItem } from "@/lib/types";
import { routes } from "@/lib/constants";
import { relativeTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** A poll preview in a feed. Links through to the votable detail page. */
export function PollCard({ poll }: { poll: PollListItem }) {
  return (
    <Card className="group animate-fade-up p-5 transition hover:border-primary/40 hover:shadow-md">
      <Link href={routes.poll(poll.pollId)} className="block">
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={poll.type === "binary" ? "primary" : "secondary"}>
            {poll.type === "binary" ? "Yes / No" : `${poll.options.length} options`}
          </Badge>
          {poll.recurrence !== "NONE" && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3 w-3" /> {poll.recurrence.toLowerCase()}
            </span>
          )}
          {poll.status === "CLOSED" && <Badge variant="outline">Closed</Badge>}
          <span className="ml-auto">{relativeTime(poll.createdAt)}</span>
        </div>

        <h3 className="font-display text-lg font-semibold leading-snug tracking-tight transition group-hover:text-primary">
          {poll.question}
        </h3>

        <div className="mt-4 flex flex-wrap gap-2">
          {poll.options.slice(0, 4).map((o) => (
            <span
              key={o.id}
              className="rounded-md border border-border bg-muted/50 px-2.5 py-1 text-sm text-muted-foreground"
            >
              {o.label}
            </span>
          ))}
          {poll.options.length > 4 && (
            <span className="px-1 py-1 text-sm text-muted-foreground">
              +{poll.options.length - 4} more
            </span>
          )}
        </div>
      </Link>

      <div className="mt-4 flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
        {poll.tags?.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}
        <Link
          href={routes.poll(poll.pollId)}
          className="ml-auto inline-flex items-center gap-1 transition hover:text-foreground"
        >
          <MessageSquare className="h-3.5 w-3.5" /> Discuss
        </Link>
      </div>
    </Card>
  );
}
