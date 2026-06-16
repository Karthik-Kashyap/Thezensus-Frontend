// Twitter uses the same card as Open Graph. Re-export the og image generator so Next emits an
// explicit twitter:image (rather than relying on its og:image fallback).
export { default, runtime, alt, size, contentType } from "./opengraph-image";
