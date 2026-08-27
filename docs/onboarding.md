# Onboarding — new developer, day one

Goal (NFR-7/FR-8): a new developer can get this monorepo running locally and
understand where things are within a day, using only this document.

## 1. Accounts / access you need

Ask the project owner for access to:
- GitHub — this repo (once pushed to a remote)
- Vercel — the 4 project deployments (shell, pay, plans, flow)
- Neon — the production/dev Postgres project (once `packages/db` exists, Step 1.3)
- GoCardless — sandbox + live API keys (ElioPlans billing)
- Dentally — API key(s) for the practice(s) being synced
- Sentry — org/project access for error monitoring (see below)
- Uptime monitor (Better Stack / UptimeRobot) — dashboard access
- `.env.local` values for each app — get these from the project owner directly
  (never commit real secrets; see `.gitignore`)

## 2. Get the codebase running

```bash
git clone <repo-url>
cd elio
npm install
# copy the .env.local values you were given into apps/shell/.env.local,
# apps/pay/.env.local, apps/plans/.env.local, apps/flow/.env.local
npm run dev
```

This starts all 4 apps via Turborepo. Default ports: shell 3000, pay 3001,
plans 3002, flow 3003 — see `docs/README.md` if a port is already in use on
your machine.

Sanity checks:
```bash
npm run type-check   # should report 0 errors across all apps/packages
npm test             # runs Vitest where test suites exist
```

## 3. Where things are

See `docs/README.md` for the full folder structure. In short: `apps/*` are the
4 Next.js apps, `packages/*` are shared code consumed via npm workspaces.
Read `project-docs/MASTER_BUILD_GUIDE.md` to see which build step created (or
will create) each piece — every non-trivial package has a comment pointing at
its origin step.

## 4. Error tracking (Sentry)

All 4 apps are wired to `@sentry/nextjs` (`sentry.client.config.ts` /
`sentry.server.config.ts` per app). Set `NEXT_PUBLIC_SENTRY_DSN` (client) and
`SENTRY_DSN` (server) in each app's `.env.local` — get the DSN values from the
project owner's Sentry org. Without a DSN set, Sentry is a no-op locally.

## 5. Seeded test accounts

**Not available yet.** `packages/db` has no Prisma schema until Step 1.3, so
there is nothing to seed until then. `npm run seed` will be added in Step 1.3
and filled in with one account per role in Step 1.5 — see
`project-docs/MASTER_BUILD_GUIDE.md` Steps 1.3 and 1.5. Until then, there is no
local login — each original app (ElioPay/ElioPlans/ElioFlow, see
`docs/README.md`) still has its own separate auth.

## 6. If something's broken

Check `docs/runbooks/` first — it has step-by-step recovery notes for known
operational scenarios. If your situation isn't covered, add a new runbook once
you've solved it, so the next person doesn't have to re-derive it.

---
*Keep this file current as the monorepo structure evolves. A stale onboarding
doc is a bug, not a doc nit (NFR-7).*
