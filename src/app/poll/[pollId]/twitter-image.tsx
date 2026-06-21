// Twitter uses the same card as Open Graph. Re-export the og image generator so Next emits an
// explicit twitter:image (rather than relying on its og:image fallback).
// `runtime` must be a statically-literal export (Turbopack can't follow a re-exported one), so
// it's declared here directly and kept in sync with opengraph-image.
export const runtime = "nodejs";
export { default, alt, size, contentType } from "./opengraph-image";
