// Vote-path behavior: who may vote on what (port of voteAccess.logic), the voting
// edition gate, and the demographics snapshot + flattened tally dims. The write rules
// themselves live in votes.model (read its header before changing anything).

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import {
  POLL_AUDIENCE,
  POLL_VISIBILITY,
  POLL_STATUS,
  EDITION_STATUS,
  TALLY_DIMENSION,
  dimKey,
} from "./constants/poll";
import { bucketAge, buildSegKey } from "./slicing.logic";
import { currentEditionLabel, windowState } from "./editions.logic";
import { badRequest, notFound, forbidden, conflict } from "./errors";
import { isMember, isOwnerOrMod, isBannedFromCommunity, getSubscription } from "./communities.model";
import { getEdition } from "./polls.model";
import { getDemographics } from "./users.model";

type Ctx = QueryCtx | MutationCtx;

/**
 * Assert the caller may vote on this poll (visibility + token + ban + login rules).
 * `linkId` null = anonymous guest. Throws notFound on access failure for LINK polls
 * (existence is never leaked); forbidden/unauthenticated for community gates.
 */
export async function assertCanVote(
  ctx: Ctx,
  poll: Doc<"polls">,
  linkId: string | null,
  token?: string,
): Promise<void> {
  if (poll.audienceType === POLL_AUDIENCE.LINK) {
    const isCreator = linkId !== null && poll.creatorId === linkId;
    if (!isCreator && token !== poll.shareToken) throw notFound("Poll not found");
    if (poll.requireLoginToVote && !linkId) throw forbidden("Sign in to vote on this poll");
    return;
  }

  // COMMUNITY polls: login always required; visibility gates voting.
  if (!linkId) throw forbidden("Sign in to vote");
  const communityId = poll.communityId;
  if (!communityId) return; // defensive — community polls always carry one
  if (await isBannedFromCommunity(ctx, linkId, communityId)) {
    throw forbidden("You are banned from this community");
  }
  const visibility = poll.visibility ?? POLL_VISIBILITY.PUBLIC;
  if (visibility === POLL_VISIBILITY.PUBLIC) return;
  if (poll.creatorId === linkId) return;
  if (await isMember(ctx, linkId, communityId)) return;
  if (await isOwnerOrMod(ctx, linkId, communityId)) return;
  throw forbidden("Membership required to vote on this poll");
}

export interface VotingEdition {
  label: string;
  status: "OPEN" | "CLOSED";
  windowState: "PENDING" | "ACTIVE" | "ENDED";
}

/** The edition votes land on right now, or throws the legacy 409s when voting is shut. */
export async function resolveVotingEdition(
  ctx: Ctx,
  poll: Doc<"polls">,
  { assertOpen }: { assertOpen: boolean },
): Promise<VotingEdition> {
  if (assertOpen && poll.status === POLL_STATUS.CLOSED) throw conflict("This poll is closed");

  const label = currentEditionLabel(poll);
  const state = windowState(label, poll.recurrenceStart, poll.recurrenceEnd);
  if (assertOpen) {
    if (state === "PENDING") throw conflict("Voting has not started");
    if (state === "ENDED") throw conflict("Voting has ended");
  }
  const edition = await getEdition(ctx, poll.pollId, label);
  const status = edition?.status ?? EDITION_STATUS.OPEN;
  if (assertOpen && status === EDITION_STATUS.CLOSED) {
    throw conflict("This edition is closed for voting");
  }
  return { label, status, windowState: state };
}

export function assertValidOption(poll: Doc<"polls">, optionId: string): void {
  if (!poll.options.some((o) => o.id === optionId)) throw badRequest("Unknown option");
}

export interface DemographicsSnapshot {
  gender?: string;
  ageAtVote?: number;
  country?: string; // ISO-3166-1 alpha-2, e.g. "US"
  state?: string; // ISO-3166-2, e.g. "US-CA"
  segments?: Record<string, string>;
}

/**
 * The voter's demographics, frozen at vote time — captured ONLY with `demographics`
 * consent (ADR-009); later edits never rewrite history. Segments snapshot from the
 * voter's subscription to the poll's community.
 */
export async function demographicsSnapshot(
  ctx: Ctx,
  linkId: string,
  poll: Doc<"polls">,
): Promise<DemographicsSnapshot | undefined> {
  const demo = await getDemographics(ctx, linkId);
  if (!demo?.demographicsConsent) return undefined;

  const snapshot: DemographicsSnapshot = {};
  if (demo.gender !== undefined) snapshot.gender = demo.gender;
  if (demo.country !== undefined) snapshot.country = demo.country;
  if (demo.state !== undefined) snapshot.state = demo.state;
  if (demo.birthYear !== undefined) {
    snapshot.ageAtVote = new Date().getUTCFullYear() - demo.birthYear;
  }
  if (poll.communityId) {
    const sub = await getSubscription(ctx, linkId, poll.communityId);
    if (sub?.segments && Object.keys(sub.segments).length > 0) snapshot.segments = sub.segments;
  }
  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

/**
 * Flatten a snapshot to the voteEvents demographic MARGINAL dim keys the tally folds
 * ("gender#female", "age#25-34", "country#US", "state#US-CA"). Age is BUCKETED (DESIGN-008)
 * so the marginal stays low-cardinality; country/state are two SEPARATE flat marginals (never
 * crossed). Segments are NOT mixed in here — they live in segKey (see `voteSegKey`); keeping
 * them out keeps `dims` identity-free demographic buckets only.
 */
export function toDims(snapshot: DemographicsSnapshot | undefined): string[] | undefined {
  if (!snapshot) return undefined;
  const dims: string[] = [];
  if (snapshot.gender !== undefined) dims.push(dimKey(TALLY_DIMENSION.GENDER, snapshot.gender));
  if (snapshot.ageAtVote !== undefined) {
    dims.push(dimKey(TALLY_DIMENSION.AGE, bucketAge(snapshot.ageAtVote)));
  }
  if (snapshot.country !== undefined) dims.push(dimKey(TALLY_DIMENSION.COUNTRY, snapshot.country));
  if (snapshot.state !== undefined) dims.push(dimKey(TALLY_DIMENSION.STATE, snapshot.state));
  return dims.length > 0 ? dims : undefined;
}

/**
 * Build the positional, identity-free segment key for a vote from the voter's snapshotted
 * segment answers and the poll's frozen segmentSchema. Returns undefined when there's no
 * snapshot, no answers, or the poll carries no schema (LINK / pre-DESIGN-008 polls).
 */
export function voteSegKey(
  snapshot: DemographicsSnapshot | undefined,
  poll: Doc<"polls">,
): string | undefined {
  return buildSegKey(snapshot?.segments ?? {}, poll.segmentSchema ?? []);
}
