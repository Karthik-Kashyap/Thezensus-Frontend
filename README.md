# VoteAnything — Frontend (Next.js 14)

The `web-service` from `DESIGN-001` §6.1 / §9. Next.js 14 App Router; SSR/ISR per page;
React Query for server state; AppSync WebSocket for live vote counts; acts as a BFF proxy
to the backend services.

## Pages (DESIGN-001 §9)

| Route | File | Rendering | Auth |
|---|---|---|---|
| `/` | `app/page.tsx` | ISR 30s | none |
| `/poll/create` | `app/poll/create/page.tsx` | CSR | required |
| `/poll/[id]` | `app/poll/[id]/page.tsx` | SSR | none to view |
| `/topic/[slug]` | `app/topic/[slug]/page.tsx` | ISR 60s | none |
| `/profile/[userId]` | `app/profile/[userId]/page.tsx` | SSR | none |
| `/me` | `app/me/page.tsx` | CSR | required |
| `/auth/callback` | `app/auth/callback/page.tsx` | CSR | n/a |

## Develop

```bash
cp .env.example .env.local   # fill in API + Cognito + AppSync values
npm install
npm run dev
```

> **Scaffold status:** pages and components render placeholders and are wired to the API
> client / Amplify config. Data fetching and interactivity are marked `TODO(DESIGN §...)`.
> Cognito/AppSync env values stay blank until the corresponding infra + Google OAuth
> prerequisites are in place.
