// Users-domain pure logic: age derivation and the DTO composition that the old
// auth-service userProfile.logic did — composing PII-free docs with the vault (email +
// DOB-derived age, own-view only) and enforcing visibility: settings/email/age never
// leave the server for other users; gender/region show only when demographicsPublic.
// DTO shapes mirror src/lib/types.ts (MeProfile / PublicProfile) exactly.

import type { Doc } from "../_generated/dataModel";
import { ACCOUNT_STATUS } from "./constants/moderation";
import type { UserAggregate } from "./users.model";

/** Whole years between `birthDate` (YYYY-MM-DD) and `now`, in UTC. NaN if invalid. */
export function ageInYears(birthDate: string, now: Date): number {
  const dob = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return NaN;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

const EMPTY_STATS = { pollsCreated: 0, totalVotesReceived: 0, votesCast: 0 };

function toStats(stats: Doc<"userStats"> | null) {
  return stats
    ? {
        pollsCreated: stats.pollsCreated,
        totalVotesReceived: stats.totalVotesReceived,
        votesCast: stats.votesCast,
      }
    : { ...EMPTY_STATS };
}

/** The signed-in user's own full profile (joins the vault for email + exact age). */
export function toMe(
  linkId: string,
  user: UserAggregate,
  email: string,
  age: number | undefined,
  admin: boolean,
) {
  const { profile, demographics, settings, moderation } = user;
  return {
    linkId,
    handle: profile?.handle ?? "",
    bio: profile?.bio,
    avatarMediaId: profile?.avatarMediaId,
    avatarKey: profile?.avatarKey,
    createdAt: profile ? new Date(profile._creationTime).toISOString() : "",
    stats: toStats(user.stats),
    demographics: {
      gender: demographics?.gender,
      region: demographics?.region,
      age,
      demographicsPublic: demographics?.demographicsPublic ?? false,
      demographicsConsent: demographics?.demographicsConsent ?? false,
    },
    settings: {
      email,
      notifPrefs: settings?.notifPrefs ?? [],
    },
    account: {
      status: moderation?.accountStatus ?? ACCOUNT_STATUS.ACTIVE,
      reason: moderation?.reason,
      until: moderation?.until,
    },
    isAdmin: admin,
    // Slicing paywall tier (DESIGN-008): gates how many segments can be combined. Absent ⇒ free.
    ...(profile?.tier ? { tier: profile.tier } : {}),
  };
}

/** Another user's public profile: no settings/email/age; demographics only if public. */
export function toPublic(linkId: string, user: UserAggregate) {
  const { profile, demographics } = user;
  return {
    linkId,
    handle: profile?.handle ?? "",
    bio: profile?.bio,
    avatarMediaId: profile?.avatarMediaId,
    avatarKey: profile?.avatarKey,
    createdAt: profile ? new Date(profile._creationTime).toISOString() : "",
    stats: toStats(user.stats),
    ...(demographics?.demographicsPublic
      ? { demographics: { gender: demographics.gender, region: demographics.region } }
      : {}),
  };
}
