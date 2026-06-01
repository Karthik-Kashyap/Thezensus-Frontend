"use client";

import { useQuery } from "@tanstack/react-query";
import { listActions } from "@/lib/admin";
import { MOD_ACTION_LABELS } from "@/lib/constants";
import { dateTime } from "@/lib/format";
import type { SubjectType } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

/** The immutable ModActions history for one target (newest first). */
export function AuditLog({ targetType, targetId }: { targetType: SubjectType; targetId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "actions", targetType, targetId],
    queryFn: () => listActions(targetType, targetId),
  });

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (isError) return <p className="text-sm text-muted-foreground">Couldn’t load the audit log.</p>;

  const actions = data?.actions ?? [];
  if (actions.length === 0) {
    return <p className="text-sm text-muted-foreground">No actions recorded for this target yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {actions.map((a) => (
        <li key={a.actionId} className="flex gap-3 text-sm">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
          <div className="min-w-0">
            <div className="font-medium">{MOD_ACTION_LABELS[a.action] ?? a.action}</div>
            {a.reason && <div className="text-muted-foreground">{a.reason}</div>}
            <div className="text-xs text-muted-foreground">
              {dateTime(a.at)} · by <code>{a.actorId}</code>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
