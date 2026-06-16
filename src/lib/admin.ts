// Moderation ADMIN client — the platform Trust & Safety surface, now Convex
// (api.moderation.*). The UI gates the console on `MeProfile.isAdmin`; every Convex
// function re-checks the admin grant per call (a 403 means it was revoked). The
// user-facing report/appeal slice lives in lib/moderation.

import { convex } from "./convexClient";
import { api } from "../../convex/_generated/api";
import { withApiError } from "./convexErrors";
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

export interface QueueParams {
  category?: ReportCategory;
  order?: "newest" | "oldest";
  limit?: number;
}

/** The open queue (optionally filtered to one category). */
export async function listReports(params: QueueParams = {}): Promise<{ reports: Report[] }> {
  const reports = (await withApiError(
    convex.query(api.moderation.listReports, params),
  )) as unknown as Report[];
  return { reports };
}

/** One report + every report on the same target. */
export const getReport = (reportId: string) =>
  withApiError(
    convex.query(api.moderation.getReportDetail, { reportId }),
  ) as unknown as Promise<ReportDetail>;

/** Close a report with an outcome. */
export const resolveReport = (reportId: string, input: ResolveReportInput) =>
  withApiError(
    convex.mutation(api.moderation.resolveReport, { reportId, ...input }),
  ) as unknown as Promise<Report>;

/** Temporary SUSPENDED (with `until`) or permanent BANNED. */
export const suspendUser = (linkId: string, input: SuspendInput) =>
  withApiError(
    convex.mutation(api.moderation.suspendUser, { linkId, ...input }),
  ) as unknown as Promise<UserModStatus>;

/** Lift a suspension/ban. */
export const reinstateUser = (linkId: string) =>
  withApiError(
    convex.mutation(api.moderation.reinstateUser, { linkId }),
  ) as unknown as Promise<void>;

/** Exclude a poll from every read path. */
export const takedownPoll = (pollId: string, input: TakedownInput = {}) =>
  withApiError(
    convex.mutation(api.moderation.takedownPoll, { pollId, ...input }),
  ) as unknown as Promise<void>;

/** Clear a poll takedown. */
export const restorePoll = (pollId: string) =>
  withApiError(
    convex.mutation(api.moderation.restorePoll, { pollId }),
  ) as unknown as Promise<void>;

/** Hide a comment from everyone. (pollId was the old DDB PK; no longer needed.) */
export const takedownComment = (commentId: string, input: CommentTakedownInput) =>
  withApiError(
    convex.mutation(api.moderation.takedownComment, {
      commentId,
      reason: input.reason,
      reportId: input.reportId,
    }),
  ) as unknown as Promise<void>;

/** Move media off serving + lock it as evidence. */
export const preserveMedia = (mediaId: string, input: PreserveMediaInput) =>
  withApiError(
    convex.mutation(api.moderation.preserveMedia, { mediaId, ...input }),
  ) as unknown as Promise<void>;

/** Open a preservation hold (suspends deletion + retention sweeps while ACTIVE). */
export const openHold = (input: OpenHoldInput) =>
  withApiError(convex.mutation(api.moderation.openLegalHold, input)) as unknown as Promise<LegalHold>;

/** Release every active hold on a subject. */
export const releaseHold = (input: ReleaseHoldInput) =>
  withApiError(
    convex.mutation(api.moderation.releaseLegalHold, input),
  ) as unknown as Promise<{ released: number }>;

/** The audit log for one target (newest first). */
export async function listActions(
  targetType: SubjectType,
  targetId: string,
): Promise<{ actions: ModAction[] }> {
  const actions = (await withApiError(
    convex.query(api.moderation.listActions, { targetType, targetId }),
  )) as unknown as ModAction[];
  return { actions };
}
