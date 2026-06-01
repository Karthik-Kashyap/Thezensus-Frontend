// moderation-service ADMIN client — the platform Trust & Safety surface. Every call here requires
// the platform `ADMIN` item: the UI gates the whole console on `MeProfile.isAdmin`, and the
// moderation-service re-checks `requireAdmin` per request (a 403 means the cache is stale or the
// grant was revoked). The user-facing report/appeal slice lives in lib/moderation.

import { api } from "./api";
import type {
  CommentTakedownInput,
  LegalHold,
  ModAction,
  OpenHoldInput,
  PreserveMediaInput,
  ReleaseHoldInput,
  Report,
  ReportCategory,
  ReportDetail,
  ResolveReportInput,
  SubjectType,
  SuspendInput,
  TakedownInput,
  UserModStatus,
} from "./types";

const enc = encodeURIComponent;

export interface QueueParams {
  category?: ReportCategory;
  order?: "newest" | "oldest";
  limit?: number;
}

/** GET /moderation/reports — the open queue (optionally filtered to one category). */
export function listReports(params: QueueParams = {}) {
  const q = new URLSearchParams();
  if (params.category) q.set("category", params.category);
  if (params.order) q.set("order", params.order);
  if (params.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return api.get<{ reports: Report[] }>(`/moderation/reports${qs ? `?${qs}` : ""}`);
}

/** GET /moderation/reports/:id — the report + every report on the same target. */
export const getReport = (reportId: string) =>
  api.get<ReportDetail>(`/moderation/reports/${enc(reportId)}`);

/** POST /moderation/reports/:id/resolve — close a report with an outcome. */
export const resolveReport = (reportId: string, input: ResolveReportInput) =>
  api.post<Report>(`/moderation/reports/${enc(reportId)}/resolve`, input);

/** POST /moderation/users/:linkId/suspend — temporary SUSPENDED (with `until`) or permanent BANNED. */
export const suspendUser = (linkId: string, input: SuspendInput) =>
  api.post<UserModStatus>(`/moderation/users/${enc(linkId)}/suspend`, input);

/** POST /moderation/users/:linkId/reinstate — lift a suspension/ban (204). */
export const reinstateUser = (linkId: string) =>
  api.post<void>(`/moderation/users/${enc(linkId)}/reinstate`);

/** POST /moderation/polls/:id/takedown — exclude a poll from every read path (204). */
export const takedownPoll = (pollId: string, input: TakedownInput = {}) =>
  api.post<void>(`/moderation/polls/${enc(pollId)}/takedown`, input);

/** POST /moderation/polls/:id/restore — clear a poll takedown (204). */
export const restorePoll = (pollId: string) =>
  api.post<void>(`/moderation/polls/${enc(pollId)}/restore`);

/** POST /moderation/comments/:id/takedown — hide a comment (204). Needs the comment's pollId (PK). */
export const takedownComment = (commentId: string, input: CommentTakedownInput) =>
  api.post<void>(`/moderation/comments/${enc(commentId)}/takedown`, input);

/** POST /moderation/media/:id/preserve — move media off serving + lock it as evidence (204). */
export const preserveMedia = (mediaId: string, input: PreserveMediaInput) =>
  api.post<void>(`/moderation/media/${enc(mediaId)}/preserve`, input);

/** POST /moderation/holds — open a preservation hold (suspends deletion + TTL while ACTIVE) (201). */
export const openHold = (input: OpenHoldInput) => api.post<LegalHold>("/moderation/holds", input);

/** POST /moderation/holds/release — release every active hold on a subject. */
export const releaseHold = (input: ReleaseHoldInput) =>
  api.post<{ released: number }>("/moderation/holds/release", input);

/** GET /moderation/actions — the audit log for one target (newest first). */
export const listActions = (targetType: SubjectType, targetId: string) =>
  api.get<{ actions: ModAction[] }>(
    `/moderation/actions?targetType=${enc(targetType)}&targetId=${enc(targetId)}`,
  );
