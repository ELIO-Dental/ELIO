# ELIO Monorepo

ELIO unifies three existing dental-practice apps — ElioPay (payroll), ElioPlans
(membership billing/GoCardless), ElioFlow (patient flow/comms) — into one
Turborepo-managed platform, built out across Phase 0 (foundations + the two
critical production bugs), Phase 1 (internal MVP), Phase 2 (commercialisation),
Phase 3 (growth). Full plan: `project-docs/` in the repo root above this one
(`d:\WEB DEV\Hish\project-docs\`).

## Structure

```
elio/
├── apps/
│   ├── shell/   — main app shell + app launcher (port 3000)
│   ├── pay/     — payroll module, was ElioPay        (port 3001)
│   ├── plans/   — membership billing module, was ElioPlans (port 3002)
│   └── flow/    — patient flow module, was ElioFlow  (port 3003)
├── packages/
│   ├── config/    — shared strict TypeScript config
│   ├── types/     — shared TypeScript types
│   ├── ui/        — shared design system (THEME_GUIDELINE.md), built in Step 1.1
│   ├── auth/       — shared NextAuth setup, built in Step 1.2
│   ├── db/         — shared Prisma schema/client, built in Step 1.3
│   └── dentally/   — shared Dentally API client, built in Step 1.4
└── docs/          — this folder
```

Each app is a normal Next.js 16 (App Router) app. Packages are consumed via npm
workspaces (`apps/*`, `packages/*`) — no publishing step, just `import` across
the workspace. `packages/ui`, `auth`, `db`, `dentally` are placeholder shells
until their respective Phase 1 build steps (see `project-docs/MASTER_BUILD_GUIDE.md`).

## Running locally

```bash
npm install          # once, from the elio/ root
npm run dev           # starts all 4 apps via Turborepo (turbo.json)
npm run type-check    # strict TS across every app/package
npm run build         # production build, all apps
npm test              # Vitest, where test suites exist
```

Default ports: shell 3000, pay 3001, plans 3002, flow 3003. If another project
on your machine already holds one of these ports, override with
`next dev --turbopack -p <port>` inside the relevant `apps/*` folder — do not
change the committed default ports without updating this doc and any Vercel
project settings that reference them.

## Where things actually live right now

Until each module is migrated in Phase 1 (Steps 1.6–1.8), the real production
code for the three original apps still lives in their own separate repos:
- `D:\WEB DEV\Hish\ElioPay\aurapay`
- `D:\WEB DEV\Hish\ElioPlans`
- `D:\WEB DEV\Hish\ElioFlow`

`elio/` is the new unified monorepo those get migrated INTO — it is not yet
running any real practice traffic. Treat the original repos as the source of
truth for existing business logic until a given module's migration step says
otherwise.

## Full plan and current status

- `project-docs/00_SCOPE.md` — what ELIO is, phase-by-phase scope
- `project-docs/MASTER_BUILD_GUIDE.md` — the step-by-step build plan this repo follows
- `project-docs/THEME_GUIDELINE.md` — the design system `packages/ui` implements
- `project-docs/PROJECT_STATE.md` — the current build step / resume point
