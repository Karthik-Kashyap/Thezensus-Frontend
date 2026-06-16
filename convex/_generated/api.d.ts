/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as authBridge from "../authBridge.js";
import type * as comments from "../comments.js";
import type * as communities from "../communities.js";
import type * as consent from "../consent.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_actor from "../lib/actor.js";
import type * as lib_bridge from "../lib/bridge.js";
import type * as lib_constants_community from "../lib/constants/community.js";
import type * as lib_constants_consent from "../lib/constants/consent.js";
import type * as lib_constants_media from "../lib/constants/media.js";
import type * as lib_constants_moderation from "../lib/constants/moderation.js";
import type * as lib_constants_poll from "../lib/constants/poll.js";
import type * as lib_constants_profile from "../lib/constants/profile.js";
import type * as lib_constants_signup from "../lib/constants/signup.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_ranking from "../lib/ranking.js";
import type * as media from "../media.js";
import type * as mediaActions from "../mediaActions.js";
import type * as moderation from "../moderation.js";
import type * as polls from "../polls.js";
import type * as retention from "../retention.js";
import type * as seed from "../seed.js";
import type * as tally from "../tally.js";
import type * as users from "../users.js";
import type * as votes from "../votes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  authBridge: typeof authBridge;
  comments: typeof comments;
  communities: typeof communities;
  consent: typeof consent;
  crons: typeof crons;
  http: typeof http;
  "lib/actor": typeof lib_actor;
  "lib/bridge": typeof lib_bridge;
  "lib/constants/community": typeof lib_constants_community;
  "lib/constants/consent": typeof lib_constants_consent;
  "lib/constants/media": typeof lib_constants_media;
  "lib/constants/moderation": typeof lib_constants_moderation;
  "lib/constants/poll": typeof lib_constants_poll;
  "lib/constants/profile": typeof lib_constants_profile;
  "lib/constants/signup": typeof lib_constants_signup;
  "lib/errors": typeof lib_errors;
  "lib/ids": typeof lib_ids;
  "lib/ranking": typeof lib_ranking;
  media: typeof media;
  mediaActions: typeof mediaActions;
  moderation: typeof moderation;
  polls: typeof polls;
  retention: typeof retention;
  seed: typeof seed;
  tally: typeof tally;
  users: typeof users;
  votes: typeof votes;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
