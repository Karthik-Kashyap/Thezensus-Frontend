// Moderation client — the user-facing slice (report + appeal), now Convex. The admin
// console surface lives in lib/admin.

import { convex } from "./convexClient";
import { api } from "../../convex/_generated/api";
import { withApiError } from "./convexErrors";
import type { CreateReportInput } from "./types";

/** File a report on a poll/comment/user/community. */
export const createReport = (input: CreateReportInput) =>
  withApiError(
    convex.mutation(api.moderation.createReport, input),
  ) as unknown as Promise<{ reportId: string }>;

/** Contest one's own suspended/banned status (one open appeal at a time). */
export const fileAppeal = (reason?: string) =>
  withApiError(
    convex.mutation(api.moderation.fileAppeal, { reason }),
  ) as unknown as Promise<{ reportId: string }>;
