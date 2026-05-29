# Frontend Architecture

Next.js 14/15 App Router app — the `web-service` from `DESIGN-001` §6.1 / §9. Renders pages,
and (in prod) acts as a BFF; in local dev it talks to the `local-gateway` at `:8080`.

## Rendering & data flow

- **Server Components** (`/`, `/poll/[id]`, `/topic/[slug]`, `/profile/[userId]`) fetch data
  during SSR via `lib/api.ts` and render. They're `force-dynamic` in dev so they always reflect
  current data (prod uses ISR/SSR per DESIGN §9).
- **Client Components** (`/poll/create`, `/me`, `VoteWidget`, `AuthButton`, `Nav`) handle
  interactivity and call the API from the browser.
- `params` is awaited (`const { id } = await params`) — Next 15 makes route params a Promise.

## API client (`lib/api.ts`)
Wraps `fetch` against `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8080`), prefixes
`/api`, uses `cache: "no-store"`. On non-2xx it throws an error carrying `.status` and `.detail`
(parsed body) so pages can show precise diagnostics. In the browser it attaches the dev identity
header (see Auth).

## Auth (local dev)
There is **no Cognito locally**. `lib/devAuth.ts` stores a fake `{ userId, name }` in
`localStorage`; `lib/api.ts` forwards it as `x-dev-user-id`, which the gateway promotes to the
authoritative `X-User-Id`. `AuthButton` provides dev sign-in/out. This is the stand-in for the
real flow in `lib/amplify.ts` (Amplify + Cognito + Google OIDC, DESIGN §4.2), which stays
dormant until the Cognito/Google prerequisites exist.

## Pages (DESIGN §9)
| Route | File | Type | Status |
|---|---|---|---|
| `/` | `app/page.tsx` | server | ✅ trending feed |
| `/poll/create` | `app/poll/create/page.tsx` | client | ✅ create form (text options; image upload TODO) |
| `/poll/[id]` | `app/poll/[id]/page.tsx` | server | ✅ detail + VoteWidget |
| `/topic/[slug]` | `app/topic/[slug]/page.tsx` | server | ✅ topic listing |
| `/profile/[userId]` | `app/profile/[userId]/page.tsx` | server | 🚧 stub |
| `/me` | `app/me/page.tsx` | client | 🚧 stub |
| `/auth/callback` | `app/auth/callback/page.tsx` | client | 🚧 stub (awaits Cognito) |

## Components
| Component | Status | Notes |
|---|---|---|
| `Nav`, `AuthButton` | ✅ | dev auth control |
| `PollCard` | ✅ | feed item |
| `VoteWidget` | ✅ | vote/results; fetches vote status; refetches counts after voting |
| `Providers` | ✅ | React Query (staleTime 30s); Amplify.configure TODO |
| `LiveVoteCount`, `CommentThread`, `CreatePollForm` (extracted), `TopicBadge`, `PollFeed` | ❌ | per DESIGN §9, not yet built |

## Live counts (not yet)
`VoteWidget` currently refetches counts ~1.2s after a vote. The next step subscribes to live
updates from the local WS gateway (Redis pub/sub backed) — the AppSync substitute — replacing
the refetch with a push (`LiveVoteCount`, DESIGN §9).

## Run
```powershell
cd C:\website\frontend
npm install
npm run dev   # http://localhost:3000  (backend must be running on :8080)
```
Config: copy `.env.example` → `.env.local` to override `NEXT_PUBLIC_API_BASE_URL` or set the
(currently unused) Cognito/AppSync values.
