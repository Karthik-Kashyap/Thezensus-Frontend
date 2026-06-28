# Dev seeder

Fills the **dev** Convex deployment (`calculating-hawk-816`) with fake users, communities,
polls, votes, and comments so the app feels alive. Dev-only — gated behind `ALLOW_SEED`.

## Files
- `../convex/seed_data/*.json` — the fake data (users pool, communities, polls, comment pool). Edit these.
- `../convex/seed.ts` — the dev-only **internal** functions: the `seedUsers` / `seedCommunities` /
  `seedPoll` / `wipe` `internalMutation`s, plus the `run` `internalAction` that orchestrates them.

Everything is `internalMutation` / `internalAction`, so none of it is on the public client API —
it can only be run from the admin-authed Convex CLI (or dashboard), never from a browser/SDK client.

## Run (from the `frontend/` folder)
```powershell
# 1. one-time: enable seeding on DEV (never set this on prod)
npx convex env set ALLOW_SEED true
#    (with `npx convex dev` running, convex/seed.ts is auto-pushed)

# 2. seed (additive — safe to run more than once; adds more content each time)
npx convex run seed:run

# optional: clean slate first (also clears any account you made by logging in)
npx convex run seed:run '{ "wipe": true }'
```

Then log in with your real Google accounts and browse. Vote tallies finish publishing a few
seconds after seeding (the tally cron). To turn seeding back off: `npx convex env remove ALLOW_SEED`.

## Notes
- **Additive** by default: each run creates new personas/polls; communities are reused by name.
- **Standard** polls = attributable votes with demographic breakdowns (capped at a community's
  member count). **Anonymous** polls = guest votes → bigger numbers, no breakdown.
- Personas use fake Google subjects, so they never collide with your real logins.
- The orchestration (RNG expansion + chaining) runs server-side inside `seed:run`; there is no
  longer a client-side `seed.mjs` (it used to reach these mutations over the public API).
