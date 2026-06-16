// Profile-domain constants: allowed values + field limits — ported from the
// auth-service. Referenced by argument validation and logic so the rules live in one place.

export const GENDER_OPTIONS = [
  "female",
  "male",
  "nonbinary",
  "other",
  "prefer_not_to_say",
] as const;

export const NOTIF_CHANNELS = ["email", "push"] as const;

export const PROFILE_LIMITS = {
  displayNameMin: 1,
  displayNameMax: 80,
  bioMax: 280,
  regionMax: 16,
} as const;
