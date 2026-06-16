// HTTP actions — endpoints reachable at the deployment's .convex.site URL.
//
// POST /media/processed — the S3-event moderation Lambda (DESIGN-007) reports its
// verdict here, authenticated with the shared AUTH_BRIDGE_SECRET. The Lambda is the
// only caller. Dispatch by `verdict`:
//   clean → markProcessed (READY + serving-bucket servingKey)
//   nsfw  → markRejected   (REJECTED; bytes already discarded by the Lambda)
//   error → markFailed     (FAILED; fail-closed on any scanner/copy error)

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/media/processed",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.AUTH_BRIDGE_SECRET;
    if (!secret || request.headers.get("x-bridge-secret") !== secret) {
      return new Response("Forbidden", { status: 403 });
    }
    const body = (await request.json()) as {
      ownerId: string;
      mediaId: string;
      verdict?: "clean" | "nsfw" | "error";
      servingKey?: string;
      contentType?: string;
      width?: number;
      height?: number;
      bytes?: number;
    };
    const { ownerId, mediaId } = body;

    if (body.verdict === "nsfw") {
      await ctx.runMutation(internal.media.markRejected, { ownerId, mediaId });
    } else if (body.verdict === "error") {
      await ctx.runMutation(internal.media.markFailed, { ownerId, mediaId });
    } else {
      // clean (default — also keeps back-compat with a verdict-less caller)
      await ctx.runMutation(internal.media.markProcessed, {
        ownerId,
        mediaId,
        servingKey: body.servingKey!,
        contentType: body.contentType,
        width: body.width,
        height: body.height,
        bytes: body.bytes,
      });
    }
    return Response.json({ ok: true });
  }),
});

export default http;
