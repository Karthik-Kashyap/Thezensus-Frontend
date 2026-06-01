# Frontend Architecture

Deeper notes that complement the [README](../README.md) (stack, layering, page list, run steps).
This covers **how data flows, the auth/session lifecycle, and the moderation console**. The source
files are the truth — if this drifts, trust the code.

## Rendering & data flow
- The app is **client-rendered over a thin server shell**. Pages under `src/app/*` are mostly small
  Client Components that read route params (`useParams`) and delegate to a feature component which
  fetches with **React Query** against `lib/*`. The server render produces loading skeletons; the
  browser hydrates and fetches. (`lib/api.ts` keeps an SSR-origin branch for future server fetching,
  but no current page fetches during SSR.)
- **`lib/api.ts`** is the single `fetch` wrapper. It prefixes `/api`, sends `credentials: "include"`
  (the session cookie), uses `cache: "no-store"`, and on a non-2xx response throws an `Error`
  carrying `.status` + `.detail` (the parsed body) so callers can branch — e.g. `401` → signed-out,
  `409` → conflict, `403` → not permitted. Verbs: `get/post/put/patch/del`.
- **Query keys** are conventional: `["me"]` (session + own profile — shared by the profile editor),
  `["consent"]`, `["community", id]`, `["subscriptions"]`, `["communityPolls", id, …]`, and the
  admin console's `["admin", …]` family. Mutations invalidate the affected key(s); the admin
  mutations invalidate `["admin"]` wholesale (low volume, founder-only moderator).

## Auth & session (cookie-based — no Cognito, no client-side tokens)
- Sign-in is **Google OAuth handled by the backend** (`auth-service`) — the only sign-in path.
  `LoginDialog` navigates the top window to `GET /api/auth/google/start`; the callback either sets the
  session cookie and returns the user to `/me` (returning identity) or issues a signup-pending cookie
  and redirects to `/signup` (first-timer — the age gate, ADR-008).
- The session is an **httpOnly cookie** the browser's JS can't read, so "who am I" is answered by
  probing `GET /users/me`: `lib/session.ts#useSession` runs that query — a profile means signed in,
  a `401` means signed out. Logout = `POST /auth/logout` then invalidate `["me"]`.
- `MeProfile` carries `account.{status,reason,until}` and `isAdmin`. Two app-wide gates read them:
  - **`AccountGate`** (wired in `app/layout.tsx`) swaps the page for a `SuspendedScreen` + appeal form
    when the account isn't `ACTIVE`. The gateway keeps `/users/me`, logout, and appeals reachable
    while suspended, so this is the reliable signal.
  - **`isAdmin`** gates the moderation-console nav entry (in `UserMenu`) and the `/admin` area
    (`AdminGate`). It fails closed: a pre-rebuild backend omits the field → `undefined` → no console.

## Identity (ADR-006)
The API only ever exposes a user's **`linkId`** (a stable pseudonym), never the real `userId`.
Profile DTOs use `linkId`; the `/profile/[userId]` route segment is a linkId value (the folder name
is kept for URL stability). Reports, votes, comments, and moderation all key off `linkId`.

## Moderation console (`/admin`, admin-only)
The platform Trust & Safety surface over `moderation-service`. `app/admin/layout.tsx` wraps every
route in **`AdminGate`** (renders children only for a signed-in `isAdmin` user; everyone else — signed
out or non-admin — is redirected home, so the area is never revealed to exist). This is UX, not the
security boundary — the service re-checks `requireAdmin` on every call (a `403` means the grant was
revoked or its ~30s cache is stale).

- **`lib/admin.ts`** — one typed function per moderation endpoint (queue, report detail, resolve,
  suspend/reinstate, poll takedown/restore, comment takedown, media preserve, holds open/release,
  audit log).
- **Queue** (`/admin`) — `ReportQueue`: filter by category + order; rows link to the detail.
- **Detail** (`/admin/reports/[reportId]`) — `ReportDetail` shows the report, every other report on
  the same target ("reported N times"), the contextual `ReportActions` (resolve + enforcement keyed
  to the target type), `HoldTools` (legal hold open/release + media preserve), and the append-only
  `AuditLog`.
- Report categories: the admin types use the **full** `ReportCategory` set; the user-facing report
  dialog uses the `UserReportCategory` subset (no `APPEAL`/`USER_ESCALATION`). A comment takedown
  needs the parent `pollId` (the Comments table key, not carried on the report) — the one manual
  field in the console.

## Community moderation + member questions (`/c/[id]/manage`)
Per-community moderation, distinct from the platform admin console. The community DTO carries the
viewer's **`myRole`** (`OWNER`/`MODERATOR`, omitted otherwise) — the gear **Manage** entry on the
community header and the `/c/[id]/manage` route gate on it; anyone without a role is redirected to the
community page (the service re-checks the role per call). The manage page has three tabs:
- **Moderators** — owner-only: grant/remove `MODERATOR` (targeted by `linkId`); everyone with a role sees the list.
- **Bans** — owner+mod: ban (by `linkId`, optional reason) / unban.
- **Pinned polls** — owner+mod: pin/unpin the community's polls (the first page is listed; toggling invalidates `["community", id]`).

**Member questions (segments):** a community owner defines optional questions at **creation only**
(`SegmentEditor` in `CreateCommunityForm` — up to 8 questions, each a label + 2–12 options; not
editable afterward). When a community has questions, **Join** opens `SegmentAnswerDialog` and members
may answer them (every question is optional) before subscribing; communities with none keep one-click
join. Answers are set once at join (to change, leave and rejoin).

## Media / images
Image fields are serving **keys**, resolved by `lib/media-url.ts`: a public CloudFront URL when
`NEXT_PUBLIC_MEDIA_BASE` is set, otherwise a presigned URL for the **current user's own** media via
media-service, with an initials fallback for everyone else (other users' media is owner-gated — an
expected local-dev limitation).

## Live vote counts (not yet)
Real-time count push — subscribe to the local WS gateway (Redis pub/sub, the AppSync substitute) — is
deferred (DESIGN §9). Today counts come from the fetched poll scoreboard; the caller's own just-cast
vote is reflected locally (and re-read after casting on attributable polls).
