// The authorizer — what the gateway used to be (DESIGN-006 §6.4). Convex validates the
// RS256 JWT minted by the Next.js token route (auth.config.ts); the JWT subject is the
// caller's linkId (ADR-006 — never the userId). On top of that, requireActor applies the
// platform ban gate: an indexed point read of userModeration replaces the gateway's
// in-process 30s enforcement cache — always fresh, no cache invalidation problem.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import { ACCOUNT_STATUS } from "./constants/moderation";
import { unauthenticated, forbidden } from "./errors";
import { getModeration } from "./users.model";

type Ctx = QueryCtx | MutationCtx;

export interface Actor {
  linkId: string;
}

/** The caller's linkId if authenticated, else null. No ban gate — for optional-auth reads. */
export async function optionalActor(ctx: Ctx): Promise<Actor | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return { linkId: identity.subject };
}

/**
 * Authenticated + not banned/suspended. The allowlist exceptions the gateway carved out
 * (view own profile, log out, file an appeal) are functions that deliberately call
 * optionalActor/requireActorEvenIfBanned instead of this.
 */
export async function requireActor(ctx: Ctx): Promise<Actor> {
  const actor = await optionalActor(ctx);
  if (!actor) throw unauthenticated();

  const moderation = await getModeration(ctx, actor.linkId);
  const status = moderation?.accountStatus ?? ACCOUNT_STATUS.ACTIVE;
  if (status === ACCOUNT_STATUS.BANNED) throw forbidden("Account banned");
  if (status === ACCOUNT_STATUS.SUSPENDED) {
    // A lapsed suspension reads as active; the doc is cleaned up on the next admin pass.
    const until = moderation?.until;
    if (!until || new Date(until).getTime() > Date.now()) throw forbidden("Account suspended");
  }
  return actor;
}

/** Authenticated, ban gate NOT applied — the gateway-allowlist equivalent
 *  (own profile, consent state, logout, appeals). */
export async function requireActorEvenIfBanned(ctx: Ctx): Promise<Actor> {
  const actor = await optionalActor(ctx);
  if (!actor) throw unauthenticated();
  return actor;
}

/** Platform admin (the ADMIN grant on userModeration). Gates Phase-4 moderation functions. */
export async function requireAdmin(ctx: Ctx): Promise<Actor> {
  const actor = await requireActor(ctx);
  const moderation = await getModeration(ctx, actor.linkId);
  if (!moderation?.admin?.active) throw forbidden("Admin only");
  return actor;
}

export async function isAdmin(ctx: Ctx, linkId: string): Promise<boolean> {
  const moderation = await getModeration(ctx, linkId);
  return moderation?.admin?.active === true;
}
