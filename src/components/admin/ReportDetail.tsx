"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getReport } from "@/lib/admin";
import { REPORT_TARGET_LABELS, routes } from "@/lib/constants";
import { dateTime, relativeTime } from "@/lib/format";
import type { ReportTarget, SubjectType } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CategoryBadge, ReportStatusBadge } from "./ReportBadges";
import { ReportActions } from "./ReportActions";
import { HoldTools } from "./HoldTools";
import { AuditLog } from "./AuditLog";

/** Map a report target to a hold/audit subject type (COMMUNITY has no subject-type equivalent). */
function holdSubject(targetType: ReportTarget): SubjectType | null {
  return targetType === "COMMUNITY" ? null : targetType;
}

/** A clickable destination for the reported entity, where one exists. */
function targetHref(targetType: ReportTarget, targetId: string): string | null {
  switch (targetType) {
    case "POLL":
      return routes.poll(targetId);
    case "USER":
      return routes.profile(targetId);
    case "COMMUNITY":
      return routes.community(targetId);
    default:
      return null; // COMMENT needs a pollId we don't carry on the report
  }
}

export function ReportDetail({ reportId }: { reportId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "report", reportId],
    queryFn: () => getReport(reportId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Couldn’t load this report. It may have been removed.
        </CardContent>
      </Card>
    );
  }

  const { report, related } = data;
  const subject = holdSubject(report.targetType);
  const othersOnTarget = related.filter((r) => r.reportId !== report.reportId);
  const href = targetHref(report.targetType, report.targetId);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
        <Link href={routes.admin}>
          <ArrowLeft className="h-4 w-4" /> Back to queue
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={report.category} />
            <ReportStatusBadge status={report.status} resolution={report.resolution} />
            <span className="ml-auto text-xs text-muted-foreground">
              {relativeTime(report.createdAt)}
            </span>
          </div>
          <CardTitle className="pt-1">{REPORT_TARGET_LABELS[report.targetType]} report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Field label="Target">
            {href ? (
              <Link href={href} className="text-primary hover:underline">
                <code>{report.targetId}</code>
              </Link>
            ) : (
              <code className="text-muted-foreground">{report.targetId}</code>
            )}
          </Field>
          <Field label="Reporter">
            <code className="text-muted-foreground">{report.reporterId}</code>
          </Field>
          {report.communityId && (
            <Field label="Community">
              <code>{report.communityId}</code>
            </Field>
          )}
          <Field label="Reason">
            {report.reason ? (
              <span className="whitespace-pre-wrap">{report.reason}</span>
            ) : (
              <span className="italic text-muted-foreground">None provided</span>
            )}
          </Field>
          <Field label="Filed">{dateTime(report.createdAt)}</Field>
          {report.status === "RESOLVED" && report.resolvedAt && (
            <Field label="Resolved">
              {dateTime(report.resolvedAt)}
              {report.resolvedBy && (
                <>
                  {" "}
                  · by <code>{report.resolvedBy}</code>
                </>
              )}
            </Field>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportActions report={report} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Other reports on this target</CardTitle>
          <p className="text-sm text-muted-foreground">
            {othersOnTarget.length === 0
              ? "This is the only report on this target."
              : `${othersOnTarget.length} other ${
                  othersOnTarget.length === 1 ? "report" : "reports"
                } on the same target.`}
          </p>
        </CardHeader>
        {othersOnTarget.length > 0 && (
          <CardContent className="space-y-2">
            {othersOnTarget.map((r) => (
              <Link
                key={r.reportId}
                href={routes.adminReport(r.reportId)}
                className="flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40"
              >
                <CategoryBadge category={r.category} />
                <ReportStatusBadge status={r.status} resolution={r.resolution} />
                <span className="ml-auto text-xs text-muted-foreground">
                  {relativeTime(r.createdAt)}
                </span>
              </Link>
            ))}
          </CardContent>
        )}
      </Card>

      <HoldTools
        defaultSubjectType={subject ?? "USER"}
        defaultSubjectId={subject ? report.targetId : ""}
        relatedReportId={report.reportId}
      />

      {subject && (
        <Card>
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
          </CardHeader>
          <CardContent>
            <AuditLog targetType={subject} targetId={report.targetId} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
