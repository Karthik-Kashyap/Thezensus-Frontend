# Thezensus — Frontend (Next.js 16, App Router)

The web client for Thezensus. Talks to the backend **gateway** under `/api/*` with a cookie
session (Google OAuth + a local dev-login stand-in). Built with Tailwind + a small set of
shadcn-style primitives (copied into `src/components/ui`), `next-themes` (light/dark), and
React Query for server state.

## Stack
- **Next.js 16** App Router, **React 19**
- **Tailwind CSS** with CSS-variable theme tokens (`src/app/globals.css`)
- **Radix UI** primitives wrapped in `src/components/ui` · **lucide-react** icons · **sonner** toasts
- **@tanstack/react-query** for fetching/caching
- Fonts via `next/font`: **Fraunces** (display) + **Plus Jakarta Sans** (UI)

## Architecture (strict layering)
- `src/app/*` — routes only; thin, compose components + call `lib`.
- `src/components/ui/*` — generic primitives. `src/components/<feature>/*` — feature components.
- `src/lib/*` — one typed client per backend service (`polls`, `votes`, `communities`,
  `comments`, `media`, `profile`), plus `api.ts` (fetch wrapper), `types.ts`, `constants.ts`,
  `session.ts`, `media-url.ts`, `format.ts`. Components call these — never `fetch` directly.

## Pages
| Route | Purpose | Auth |
|---|---|---|
| `/` | Logged-out hero / logged-in community feed | none |
| `/me` | Own profile + settings + avatar upload | required |
| `/profile/[userId]` | Public profile + their polls | none |
| `/c/new` | Create a community | required |
| `/c/[communityId]` | Community page (poll feed + join) | visibility-gated |
| `/poll/new` | Create a poll | required |
| `/poll/[pollId]` | Poll detail — vote (live results) + comments | none to view |

## Develop
```bash
cp .env.example .env.local   # defaults point at the local gateway (:8080)
npm install
npm run dev                  # http://localhost:3000
```
The backend stack (LocalStack + 6 services + gateway) must be running first — see
`../backend/docs/LOCAL_DEV.md`. Use the **Dev sign-in** in the login dialog for offline auth.

## Media / images
Image fields are stored as serving **keys**. `src/lib/media-url.ts` resolves them: with
`NEXT_PUBLIC_MEDIA_BASE` (CloudFront) set it builds a public URL; locally it presigns the
**current user's own** media via media-service and falls back to initials for everyone else
(other users' media is owner-gated — an expected local-dev limitation).

## Not yet built (backend pending — shown as "coming soon" stubs)
Global trending feed, topics, user-following, notifications inbox, comment up/down-vote +
threading, creator analytics dashboards. Community moderation (roles/bans/pins/reports) and
subscribe-time segment questions are deferred to a later frontend slice.
