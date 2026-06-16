// ID generation — ported from backend/shared/src/ids. All internal entity IDs are
// app-generated prefixed ULIDs (time-sortable), independent of Convex `_id` so URLs
// don't couple to storage. Exceptions: shareToken (a CSPRNG secret, never an id) and
// the ADR-006 linkId pseudonym, which since 2026-06-11 IS the `users` doc `_id`
// (created in signup — see users.model insertUserItems; ULIDs leak signup time).

import { ulid } from "ulid";

/** Entity id prefixes — the leading tag on each ULID. */
export const ID_PREFIX = {
  user: "u_",
  poll: "p_",
  community: "c_",
  comment: "cmt_",
  report: "r_",
  media: "m_",
} as const;

type EntityPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

function newId(prefix: EntityPrefix): string {
  return `${prefix}${ulid()}`;
}

export const newUserId = () => newId(ID_PREFIX.user);
export const newPollId = () => newId(ID_PREFIX.poll);
export const newCommunityId = () => newId(ID_PREFIX.community);
export const newCommentId = () => newId(ID_PREFIX.comment);
export const newReportId = () => newId(ID_PREFIX.report);
export const newMediaId = () => newId(ID_PREFIX.media);

/** A bare (unprefixed) ULID — used for ModAction actionIds and the like. */
export const newUlid = () => ulid();

const randomHex = (byteLength: number) => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * A share token for unlisted polls. NOT a ULID — it gates access, so it's a 128-bit
 * CSPRNG secret (Web Crypto; node:crypto isn't available in the Convex runtime).
 * Hex rather than the backend's base64url — opaque either way, and hex needs no
 * encoding helpers the runtime might lack.
 */
export function newShareToken(): string {
  return randomHex(16);
}

/** SK-style prefix for an anonymous (link-poll) guest voter. */
export const GUEST_PREFIX = "GUEST#";

/** A voter id for an anonymous guest: `GUEST#<random>`. Not dedup-able by design. */
export function newGuestVoter(): string {
  return `${GUEST_PREFIX}${randomHex(9)}`;
}
