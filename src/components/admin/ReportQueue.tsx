"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { listReports } from "@/lib/admin";
import { ADMIN_QUEUE_CATEGORIES, QUEUE_ORDER_OPTIONS, REPORT_TARGET_LABELS, routes } from "@/lib/constants";
import { relativeTime } from "@/lib/format";
import type { Report, ReportCategory } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryBadge } from "./ReportBadges";

/** The open-report queue with category + order filters. Rows link to the report detail. */
export function ReportQueue() {
  const [category, setCategory] = useState<ReportCategory | "">("");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "reports", { category, order }],
    queryFn: () => listReports({ category: category || undefined, order }),
  });

  const reports = data?.reports ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-60 space-y-1.5">
          <Label htmlFor="queue-category">Category</Label>
          <Select
            id="queue-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ReportCategory | "")}
          >
            <option value="">All categories</option>
            {ADMIN_QUEUE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44 space-y-1.5">
          <Label htmlFor="queue-order">Order</Label>
          <Select
            id="queue-order"
            value={order}
            onChange={(e) => setOrder(e.target.value as "newest" | "oldest")}
          >
            {QUEUE_ORDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        {!isLoading && !isError && (
          <div className="ml-auto self-center text-sm text-muted-foreground">
            {reports.length} open {reports.length === 1 ? "report" : "reports"}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Couldn’t load the queue. Refresh to try again.
          </CardContent>
        </Card>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Queue is clear</p>
            <p className="text-sm text-muted-foreground">
              No open reports{category ? " in this category" : ""}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <QueueRow key={r.reportId} report={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({ report }: { report: Report }) {
  return (
    <Link
      href={routes.adminReport(report.reportId)}
      className="block rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={report.category} />
            <span className="text-xs font-medium text-muted-foreground">
              {REPORT_TARGET_LABELS[report.targetType]}
            </span>
            <code className="max-w-[40ch] truncate text-xs text-muted-foreground">{report.targetId}</code>
          </div>
          {report.reason ? (
            <p className="line-clamp-2 text-sm text-foreground/80">{report.reason}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">No details provided</p>
          )}
        </div>
        <time className="shrink-0 text-xs text-muted-foreground">{relativeTime(report.createdAt)}</time>
      </div>
    </Link>
  );
}
