"use client";

import { useParams } from "next/navigation";
import { ReportDetail } from "@/components/admin/ReportDetail";

/** /admin/reports/[reportId] — review one report and act (gated by app/admin/layout.tsx). */
export default function AdminReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  return (
    <div className="mx-auto max-w-3xl">
      <ReportDetail reportId={reportId} />
    </div>
  );
}
