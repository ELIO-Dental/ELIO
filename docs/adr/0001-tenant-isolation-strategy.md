# ADR-0001: Tenant isolation via a shared Prisma query-wrapper, not PostgreSQL RLS

Date: 2026-08-17
Status: Accepted

## Context

`00_SCOPE.md` FR-6 requires that no code may ever assume single tenant: a query
that forgets to filter by `practiceId` must still be incapable of returning
another practice's rows. `MASTER_BUILD_GUIDE.md` Step 1.3 offers two acceptable
mechanisms: PostgreSQL Row-Level Security (RLS) policies filtering on
`current_setting('app.current_practice_id')`, or an equivalent shared
query-wrapper in `packages/db` that every module must use.

Constraints specific to this stack:
- The app connects to Postgres through **Neon's pooled connection string**
  (`PERFORMANCE_SCALABILITY.md` §2), which is required for serverless Vercel
  functions to avoid exhausting Postgres's connection limit.
- Neon's pooler runs in **transaction pooling mode**. A session-level
  `SET app.current_practice_id = ...` does not reliably survive across
  statements in that mode — only `SET LOCAL` inside an explicit transaction is
  safe, which means RLS would require wrapping *every single Prisma call*
  (not just multi-statement operations) in `prisma.$transaction([...])` with a
  `SET LOCAL` issued first. Prisma does not offer a hook that runs before every
  query to inject that `SET LOCAL` automatically — it would have to be done by
  convention at every call site, which reintroduces exactly the "forgot to
  filter" risk RLS is meant to remove, just moved to a different forgettable
  step.
- Prisma Client Extensions (`$extends`), in contrast, give a single choke
  point — `packages/db/tenant.ts` — through which every query for a
  tenant-scoped model can be intercepted and have `practiceId` injected into
  its `where`/`data` regardless of what the calling module code does or
  forgets to do.

## Decision

Tenant isolation is enforced by **`scopedDb(practiceId)`** in
`packages/db/tenant.ts`: a Prisma Client Extension that wraps every
`findMany`, `findFirst`, `findUnique`, `count`, `update`, `updateMany`,
`delete`, `deleteMany`, and `create`/`createMany` operation for every
tenant-scoped model (any model with a `practiceId` field) and:
- on read/update/delete: merges `{ practiceId }` into the operation's `where`
  clause, even if the caller passed no `where` at all or a `where` that
  omitted `practiceId`.
- on create: injects `practiceId` into `data` if the caller omitted it, and
  throws if the caller supplied a *different* `practiceId` than the scope
  (defence against a copy-pasted cross-tenant payload).

Every module (`apps/pay`, `apps/plans`, `apps/flow`, `apps/shell`) must obtain
its Prisma client via `scopedDb(session.practiceId)`, never via the raw
`prisma` export, for any request handling tenant data. The raw `prisma` export
remains available only for: the seed script, migrations tooling, and
`apps/admin`'s cross-tenant Super Admin views (which legitimately need to see
every practice and scope explicitly per call instead).

RLS is not ruled out forever — if Neon's pooler configuration changes, or the
team moves to a session-pooling-safe connection strategy, RLS can be
layered on top as defence-in-depth without changing the extension's public
API (`scopedDb` could become a thin wrapper that also sets the RLS session
variable). This ADR only rejects RLS as the *sole* mechanism for Phase 1.

## Alternatives considered

- **RLS only.** Rejected: the Neon pooler transaction-mode session-variable
  problem above makes it unreliable to guarantee the filter is actually
  applied on every request without the same per-call-site discipline the
  wrapper needs anyway — so RLS alone doesn't actually remove the "forgot to
  scope" risk, it just moves it into a query-time `SET LOCAL` line that's
  equally easy to omit, and is much harder to unit test deterministically
  (requires a real Postgres connection with session state, not just an
  in-memory/mocked Prisma extension).
- **RLS + wrapper together.** Considered as the most defence-in-depth option,
  but deferred to a later ADR/step — building and correctly testing both at
  once was more than Step 1.3's scope justified when the wrapper alone
  already satisfies FR-6's actual requirement ("no code may assume single
  tenant"). Flagged above as a valid future addition.
- **Manual `where: { practiceId }` discipline + code review only.** Rejected
  outright — this is exactly the "no exceptions, no just this once" pattern
  FR-6 explicitly warns against; a code-review-only guarantee is not a real
  guarantee, and the integration test required by Step 1.3 (a query with NO
  explicit filter must still be scoped) would be impossible to make pass
  reliably under this approach.

## Consequences

- Every module MUST call `scopedDb(practiceId)` — using the raw `prisma`
  client directly against a tenant-scoped model outside `packages/db`'s own
  seed/migration scripts and `apps/admin` is a code-review-blocking bug, not a
  style nit. Should be lint-enforced in a later step (e.g. an ESLint rule
  banning `@elio/db`'s raw `prisma` import outside an allowlist) — not built
  in Step 1.3, noted here as follow-up.
- Isolation is testable in-process with a real (but disposable) database
  connection and no special Postgres session-state setup — this is what
  `packages/db/tenant.isolation.test.ts` exercises.
- If a future model needs cross-tenant querying by design (e.g. Super Admin
  aggregate views), it must go through the raw `prisma` client explicitly and
  be reviewed as such, not accidentally inherit scoping from `scopedDb`.
