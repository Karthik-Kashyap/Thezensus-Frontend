import { Badge } from "@/components/ui/badge";
import { REPORT_CATEGORY_LABELS } from "@/lib/constants";
import type { ReportCategory, ReportResolution, ReportStatus } from "@/lib/types";

/** Categories flagged visually as severe (illegal content / safety-of-life). */
const SEVERE: ReportCategory[] = ["CSAM", "VIOLENCE_THREAT", "SELF_HARM", "ILLEGAL_OTHER"];

/** Colored pill for a report's category — severe ones read as destructive. */
export function CategoryBadge({ category }: { category: ReportCategory }) {
  const severe = SEVERE.includes(category);
  return (
    <Badge
      variant="outline"
      className={severe ? "border-destructive/30 bg-destructive/10 text-destructive" : ""}
    >
      {REPORT_CATEGORY_LABELS[category]}
    </Badge>
  );
}

const RESOLUTION_LABEL: Record<ReportResolution, string> = {
  ACTION_TAKEN: "Action taken",
  DISMISSED: "Dismissed",
  DUPLICATE: "Duplicate",
};

/** Lifecycle pill — open vs resolved (with the resolution when known). */
export function ReportStatusBadge({
  status,
  resolution,
}: {
  status: ReportStatus;
  resolution?: ReportResolution;
}) {
  if (status === "RESOLVED") {
    return (
      <Badge variant="default">
        Resolved{resolution ? ` · ${RESOLUTION_LABEL[resolution]}` : ""}
      </Badge>
    );
  }
  if (status === "UNDER_REVIEW") return <Badge variant="secondary">Under review</Badge>;
  return <Badge variant="primary">Open</Badge>;
}
