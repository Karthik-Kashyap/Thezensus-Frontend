// Server-side Convex access for the auth route handlers: a per-request ConvexHttpClient
// plus the bridge secret the authBridge functions require (lib/bridge.ts on the Convex
// side). One-shot HTTP calls — no live subscriptions on the server.

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { convexUrl, bridgeSecret } from "./env";

const client = () => new ConvexHttpClient(convexUrl());

export type LoginResolution = { status: "new" } | { status: "returning"; linkId: string };

export async function resolveLogin(subject: string): Promise<LoginResolution> {
  return await client().query(api.authBridge.resolveLogin, { secret: bridgeSecret(), subject });
}

export interface CreateAccountInput {
  subject: string;
  email: string;
  legalName?: string;
  displayName?: string;
  birthDate: string;
  consent: { demographics: boolean; marketingEmail: boolean };
}

export type SignupOutcome =
  | { status: "created"; linkId: string }
  | { status: "exists"; linkId: string }
  | { status: "underage" };

export async function createAccount(input: CreateAccountInput): Promise<SignupOutcome> {
  return await client().mutation(api.authBridge.createAccount, { secret: bridgeSecret(), ...input });
}
