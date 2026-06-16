// Typed application errors. ConvexError data crosses the wire to the client (a plain
// throw becomes an opaque server error), so every expected failure uses one of these.
// The `code` mirrors the HTTP status the old gateway returned — the frontend's error
// handling keys off it the same way it keyed off res.status.

import { ConvexError } from "convex/values";

// `type` (not `interface`) — interfaces lack the implicit index signature
// ConvexError's `Value` constraint requires.
export type AppErrorData = {
  code: number;
  message: string;
};

const appError = (code: number, message: string) =>
  new ConvexError<AppErrorData>({ code, message });

export const badRequest = (message: string) => appError(400, message);
export const unauthenticated = (message = "Not authenticated") => appError(401, message);
export const forbidden = (message = "Forbidden") => appError(403, message);
export const notFound = (message = "Not found") => appError(404, message);
export const conflict = (message: string) => appError(409, message);
