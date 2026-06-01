// moderation-service client — the user-facing slice only (report + appeal). The admin console
// (queue, suspend/ban, takedown, holds) is a separate later surface.

import { api } from "./api";
import type { CreateReportInput } from "./types";

/** POST /moderation/reports — file a report on a poll/comment/user/community. */
export const createReport = (input: CreateReportInput) =>
  api.post<{ reportId: string }>("/moderation/reports", input);

/** POST /moderation/appeals — contest one's own suspended/banned status (one open at a time). */
export const fileAppeal = (reason?: string) =>
  api.post<{ reportId: string }>("/moderation/appeals", { reason });
