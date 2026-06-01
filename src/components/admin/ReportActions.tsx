"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCheck } from "lucide-react";
import { reinstateUser } from "@/lib/admin";
import { REPORT_TARGET_LABELS } from "@/lib/constants";
import type { Report } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ResolveReportDialog } from "./ResolveReportDialog";
import { SuspendUserDialog } from "./SuspendUserDialog";
import { PollModerationButtons } from "./PollModerationButtons";
import { CommentTakedownDialog } from "./CommentTakedownDialog";

/** Resolve + the enforcement actions relevant to this report's target type. */
export function ReportActions({ report }: { report: Report }) {
  const queryClient = useQueryClient();
  const isResolved = report.status === "RESOLVED";

  const reinstate = useMutation({
    mutationFn: () => reinstateUser(report.targetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("User reinstated");
    },
    onError: () => toast.error("Couldn’t reinstate the user."),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {isResolved ? (
          <span className="text-sm text-muted-foreground">
            This report is resolved — it’s out of the queue. Enforcement actions below still apply.
          </span>
        ) : (
          <ResolveReportDialog reportId={report.reportId} />
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Enforce on the {REPORT_TARGET_LABELS[report.targetType].toLowerCase()}
        </p>
        {report.targetType === "USER" && (
          <div className="flex flex-wrap gap-2">
            <SuspendUserDialog linkId={report.targetId} relatedReportId={report.reportId} />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={reinstate.isPending}
              onClick={() => reinstate.mutate()}
            >
              <UserCheck className="h-4 w-4" /> {reinstate.isPending ? "Reinstating…" : "Reinstate"}
            </Button>
          </div>
        )}
        {report.targetType === "POLL" && (
          <PollModerationButtons pollId={report.targetId} relatedReportId={report.reportId} />
        )}
        {report.targetType === "COMMENT" && (
          <CommentTakedownDialog commentId={report.targetId} relatedReportId={report.reportId} />
        )}
        {report.targetType === "COMMUNITY" && (
          <p className="text-sm text-muted-foreground">
            No direct community takedown in v1 — handle it via the community’s own mod tools, then
            resolve this report.
          </p>
        )}
      </div>
    </div>
  );
}
