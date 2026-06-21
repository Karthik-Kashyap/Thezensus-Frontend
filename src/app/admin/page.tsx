import { ReportQueue } from "@/components/admin/ReportQueue";
import { PageContainer } from "@/components/layout/PageContainer";

/** /admin — the moderation queue (gated to platform admins by app/admin/layout.tsx). */
export default function AdminQueuePage() {
  return (
    <PageContainer className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Moderation queue</h1>
        <p className="text-muted-foreground">
          Open reports across the platform. Select one to review the target and take action.
        </p>
      </header>
      <ReportQueue />
    </PageContainer>
  );
}
