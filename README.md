# Pollzens — Frontend (Next.js 16, App Router)

The web client for Pollzens. Talks to the backend **gateway** under `/api/*` with a cookie
session (Google OAuth). Built with Tailwind + a small set of
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
  `comments`, `media`, `profile`, `signup`, `consent`, `moderation`, `admin`), plus `api.ts` (fetch
  wrapper), `types.ts`, `constants.ts`, `session.ts`, `media-url.ts`, `format.ts`. Components call
  these — never `fetch` directly.

> **Identity (ADR-006):** the API identifies a user by **`linkId`** (a pseudonym), never the real
> `userId`. Profile DTOs carry `linkId`; the `/profile/[userId]` route segment is a linkId value.

## Pages
| Route | Purpose | Auth |
|---|---|---|
| `/` | Logged-out hero / logged-in community feed | none |
| `/signup` | First-time age-gate (DOB) + consent step | post-OAuth, pending-cookie |
| `/me` | Own profile + consent settings + avatar + delete account | required |
| `/profile/[userId]` | Public profile + their polls (segment is a linkId) | none |
| `/c/new` | Create a community (incl. optional member questions) | required |
| `/c/[communityId]` | Community page (poll feed + join with member questions) | visibility-gated |
| `/c/[communityId]/manage` | Community moderation — moderators / bans / pinned polls | owner/mod |
| `/poll/new` | Create a poll (incl. standard/anonymous ballot) | required |
| `/poll/[pollId]` | Poll detail — vote (live results) + comments | none to view |
| `/admin` | Moderation queue (open reports) | admin |
| `/admin/reports/[reportId]` | Report detail — resolve + enforce + holds + audit log | admin |

Suspended/banned accounts are gated app-wide by `AccountGate` → a suspended screen with an appeal
form (the gateway keeps `GET /users/me`, logout, and appeals reachable). Polls, comments, and users
can be reported to platform moderators via the report dialog. Platform admins (those holding the
`ADMIN` item — surfaced as `isAdmin` on `GET /users/me`) get a **Moderation** entry in the user menu
that opens the `/admin` console; `AdminGate` gates the area and `moderation-service` enforces per call.

## Develop
```bash
cp .env.example .env.local   # defaults point at the local gateway (:8080)
npm install
npm run dev                  # http://localhost:3000
```
The backend stack (LocalStack + 6 services + gateway) must be running first — see
`../backend/docs/LOCAL_DEV.md`. Sign in with **Continue with Google** in the login dialog
(Google OAuth is the only sign-in path; the backend needs `GOOGLE_CLIENT_ID/SECRET` configured).

## Media / images
Image fields are stored as serving **keys**. `src/lib/media-url.ts` resolves them: with
`NEXT_PUBLIC_MEDIA_BASE` (CloudFront) set it builds a public URL; locally it presigns the
**current user's own** media via media-service and falls back to initials for everyone else
(other users' media is owner-gated — an expected local-dev limitation).

## Not yet built (deferred to a later frontend slice)
- Stubbed "coming soon" (await backend): global trending feed, topics, user-following,
  notifications inbox, comment up/down-vote + threading, creator analytics dashboards.

> Community moderation (roles/bans/pins, `/c/[id]/manage`) and member questions (authored at
> community creation, answered optionally at join) shipped 2026-05-31. Questions and answers are
> set once and not editable afterward (delete/leave + recreate/rejoin to change).
