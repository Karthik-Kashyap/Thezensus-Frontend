// Adapter from Convex application errors to the error shape the components already
// handle. Convex functions throw ConvexError({ code, message }) where `code` mirrors the
// old HTTP status (convex/lib/errors.ts); existing UI keys off `err.status` — keep that
// contract so error handling survives the migration unchanged.

import { ConvexError } from "convex/values";

export interface ApiError extends Error {
  status?: number;
  detail?: unknown;
}

/** Run a Convex call, rethrowing application errors in the legacy { status, detail } shape. */
export async function withApiError<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (e) {
    if (e instanceof ConvexError) {
      const data = e.data as { code?: number; message?: string } | string;
      const code = typeof data === "object" ? data.code : undefined;
      const message = typeof data === "object" ? data.message : data;
      const err = new Error(message ?? "Request failed") as ApiError;
      err.status = code;
      err.detail = data;
      throw err;
    }
    throw e;
  }
}
