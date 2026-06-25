// Handle generation (pure): assemble a `<Word>-<number>` candidate. No DB access — the
// uniqueness check + retry loop lives in users.model `assignUniqueHandle`, which calls this
// with an increasing `attempt` so a contended word's discriminator widens (see constants).

import {
  HANDLE_ATTEMPTS_PER_WIDEN,
  HANDLE_BASE_DIGITS,
  HANDLE_SEPARATOR,
  HANDLE_WORDS,
} from "./constants/handles";

/** A uniform random integer in [0, maxExclusive) from the runtime CSPRNG (as in ids.ts). */
function randomInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  // Rejection-sample to strip modulo bias (the tail of 2^32 not divisible by maxExclusive).
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  while (buf[0] >= limit) crypto.getRandomValues(buf);
  return buf[0] % maxExclusive;
}

/** Digit width for a given attempt — widens by one every HANDLE_ATTEMPTS_PER_WIDEN misses. */
export function digitsForAttempt(attempt: number): number {
  return HANDLE_BASE_DIGITS + Math.floor(attempt / HANDLE_ATTEMPTS_PER_WIDEN);
}

/** One random handle candidate, e.g. `Pulsar-4821`. Higher `attempt` ⇒ wider number. */
export function generateHandleCandidate(attempt = 0): string {
  const word = HANDLE_WORDS[randomInt(HANDLE_WORDS.length)];
  const digits = digitsForAttempt(attempt);
  const number = randomInt(10 ** digits)
    .toString()
    .padStart(digits, "0");
  return `${word}${HANDLE_SEPARATOR}${number}`;
}
