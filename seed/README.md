# Dev seeder

Fills the **dev** Convex deployment (`calculating-hawk-816`) with fake users, communities,
polls, votes, and comments so the app feels alive. Dev-only — gated behind `ALLOW_SEED`.

## Files
- `data/*.json` — the fake data (users pool, communities, polls, comment pool). Edit these.
- `seed.mjs` — the runner. Expands the JSON and calls the mutations in `convex/seed.ts`.
- `../convex/seed.ts` — dev-only Convex mutations (`seedUsers`, `seedCommunities`, `seedPoll`, `wipe`).

## Run (from the `frontend/` folder)
```powershell
# 1. one-time: make sure the seed functions are pushed + enabled on DEV
npx convex env set ALLOW_SEED true     # never set this on prod
#    (with `npx convex dev` running, convex/seed.ts is auto-pushed)

# 2. seed (additive — safe to run more than once; adds more content each time)
node seed/seed.mjs

# optional: clean slate first (also clears any account you made by logging in)
node seed/seed.mjs --wipe
```

Then log in with your real Google accounts and browse. Vote tallies finish publishing a few
seconds after seeding (the tally cron). To turn seeding back off: `npx convex env remove ALLOW_SEED`.

## Notes
- **Additive** by default: each run creates new personas/polls; communities are reused by name.
- **Standard** polls = attributable votes with demographic breakdowns (capped at a community's
  member count). **Anonymous** polls = guest votes → bigger numbers, no breakdown.
- Personas use fake Google subjects, so they never collide with your real logins.
