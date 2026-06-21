"use client";

import { useParams } from "next/navigation";
import { ReportDetail } from "@/components/admin/ReportDetail";
import { PageContainer } from "@/components/layout/PageContainer";

/** /admin/reports/[reportId] — review one report and act (gated by app/admin/layout.tsx). */
export default function AdminReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  return (
    <PageContainer>
      <ReportDetail reportId={reportId} />
    </PageContainer>
  );
}
