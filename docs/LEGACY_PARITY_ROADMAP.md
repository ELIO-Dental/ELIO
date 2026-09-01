# ELIO Legacy Parity Roadmap

**Purpose:** Restore full functional parity with the three legacy root apps (`ElioFlow`, `ElioPlans`, `ElioPay`) inside the new ELIO monorepo — same workflows, dashboards, sync behaviour, and data visibility — while keeping the **unified login**, **multi-tenant architecture**, and **new ELIO design theme**.

**Audience:** Developers, project lead, client handoff  
**Last updated:** 2026-08-31 (fourth pass — **final confirmed** + implementation reference guide)  
**Status:** Planning document — not yet implemented  
**Audit coverage:** Every legacy page (Flow 8, Plans 18, Pay 12), every legacy API route (Flow 17, Plans 54, Pay 38), Prisma/schema fields, cron schedules, deploy env vars, and admin console features cross-checked against new ELIO codebase.

> **Final confirmation (fourth pass):** All legacy routes and APIs are accounted for in Parts 10–11. Schema gaps are in Part 9. When implementing any step, use **Part 16** to find the exact original file to port from — do not guess behaviour from memory.

---

## How to read this document

| Symbol | Meaning |
|--------|---------|
| ✅ | Exists in new ELIO today (functional parity or acceptable equivalent) |
| 🟡 | Partially implemented — works but missing behaviour or UI |
| ❌ | Missing — client will notice regression vs legacy |
| 🔒 | Keep as-is (unified infra — do not revert to legacy per-app login) |

Each module section follows the same structure:

1. **Legacy inventory** — what the old app had (screens, metrics, sync, flows)
2. **New ELIO today** — what exists now
3. **Gap matrix** — feature-by-feature comparison
4. **Implementation steps** — ordered work to reach parity in new theme
5. **Part 16 reference guide** — for each step ID (e.g. `F1.1`, `P2.3`), the **original legacy file(s)** to read first and the **new ELIO file(s)** to create or extend

### Repo layout (where old vs new code lives)

| | Path (from `D:\WEB DEV\Hish\`) |
|--|--------------------------------|
| Legacy Flow | `ElioFlow/` |
| Legacy Plans | `ElioPlans/` |
| Legacy Pay | `ElioPay/aurapay/` |
| New ELIO monorepo | `elio/` |
| Deploy env samples | `elio-deploy-env/` (`shell.env`, `plans.env`, `pay.env`, `flow.env`) |
| Migration scripts (already run) | `elio/scripts/migrations/` |
| Client requirements PDF | `Refrence/ELIO-Developer-Requirements-v1.1 (1).pdf` (scope context only — **code is source of truth**) |

---

## Executive summary

The client complaint — *“data not syncing, dashboards empty, not working like before”* — is accurate. The new platform has **correct architecture** (one login, shared Postgres, licensed modules) but **incomplete parity** with legacy behaviour:

| Root cause | Impact |
|------------|--------|
| Central Dentally sync does not replicate **module-specific** sync logic (Flow cosmetic pipeline, Plans payment-plan mapping, Pay live period fetch) | New data never appears where staff expect it |
| Per-tenant `Practice.dentallyApiKey` is **stored but never used** at sync time | Multi-clinic / wrong-key risk |
| **No “Sync now” UI** in portal or modules | Staff cannot trigger sync like before |
| **Dashboard layouts changed** (Flow kanban vs stats home; Pay ops dashboard vs payslip analytics) | “Missing dashboard” perception even when migrated data exists |
| **Pay has zero Dentally integration** in new code | “Fetch from Dentally” is gone |
| **Plans Dentally mappings + sync button** removed | Patients don’t auto-import on correct plans |
| **Flow uses invoices not payments** for financials | Deposit/conversion numbers differ from legacy |
| **Legacy payslip archive** not surfaced in Pay UI | Historical payroll detail invisible |
| **`DentallyPlanMapping` never migrated** — model does not exist in new schema | Plans sync cannot work until schema + UI rebuilt |
| **Plans patient detail page missing entirely** — list rows not clickable | No payment trail, appointments, DD actions, notes |
| **Pay lab bills / bulk payments simplified** — no paid flag, file upload, bank details, Starling CSV | Finance workflow broken vs AuraPay |
| **Production Inngest + cron may not be running** | Central sync never fires even if code exists |

**What to keep (client likes this):**

- 🔒 Single sign-on via `apps/shell` (portal launcher, one session across Flow / Plans / Pay)
- 🔒 Module licensing and tenant isolation
- 🔒 New ELIO UI components (`@elio/ui`, design tokens, light/dark theme)
- 🔒 Migrated historical data (819 Flow consults, 76 Plans patients, Pay dentists/periods — already in Neon)

**Goal:** Same **function and sequence** as legacy, new **look and infrastructure**.

### Third audit — completeness scorecard

| Area | Legacy items audited | ✅ Parity / keep | 🟡 Partial | ❌ Missing |
|------|---------------------|------------------|------------|-----------|
| ElioFlow pages + APIs | 25 | 6 | 10 | 9 |
| ElioPlans pages + APIs | 72 | 14 | 28 | 30 |
| ElioPay pages + APIs | 50 | 8 | 18 | 24 |
| Cross-cutting (sync, portal, admin) | 20 | 7 | 6 | 7 |
| **Total tracked gaps** | **167** | **35** | **62** | **70** |

**Critical path (client-visible blockers):** central sync + per-tenant keys (A), Pay Fetch from Dentally (Y1), Flow legacy dashboard + cosmetic import (F1/F2), Plans mappings + patient detail + Dentally sync (P1/P2).

**Intentional design differences (document, do not “fix” unless client insists):**

- Flow **touch points** — legacy manual counter → new `Reminder` records (count = touch points); UI must show count, not re-add a manual bump button unless UAT rejects reminders model.
- Flow **appointment state** — legacy column → new `Appointment.dentallyState` join (DNA/Cancelled/Confirmed); not denormalized on `Consult`.
- Pay **Turso/SQLite** — retired; Neon + `PrivateRevenueLineItem` is the target store.
- Pay **Python `payslip_generator_v4.py`** — retired; web calculate + PDF is the target (keep archive note for historical payslips only).

---

## Part 0 — Cross-cutting infrastructure

### 0.1 Dentally API key — legacy vs new

| App | Legacy env var | New ELIO env var | Notes |
|-----|----------------|------------------|-------|
| ElioFlow | `DENTALLY_API_KEY` | `DENTALLY_API_KEY` (shell) | Same name |
| ElioPlans | `DENTALLY_API_KEY` or DB `dentally.api_key` | `DENTALLY_API_KEY` (shell) | Plans-specific sync logic **not ported** |
| ElioPay | **`DENTALLY_API_TOKEN`** + `DENTALLY_SITE_ID` | `DENTALLY_API_KEY` + `DENTALLY_SITE_ID` in deploy env | **Pay app code reads neither today** |

### 0.2 Sync architecture comparison

```
LEGACY (three independent sync models)
─────────────────────────────────────
ElioFlow:  Dentally → Google Sheets → Dashboard reads Sheets
           Cron: every 10 min, 06:00–08:59 UTC
           Manual: Full sync + Payment-only sync

ElioPlans: Dentally payment-plan patients → PostgreSQL Patient/PatientPlan
           Cron: daily 06:00 UTC + "Sync from Dentally" button
           Requires: DentallyPlanMapping config

ElioPay:   On-demand POST /api/dentally per pay period (no cron)
           Live invoices + appointments → Turso payslip_entries

NEW ELIO (one central sync — incomplete)
────────────────────────────────────────
Shell cron 03:00 UTC → Inngest → syncPracticeDentallyData()
  Syncs: patients, appointments, invoices, treatments, payments, accounts, payment plans
  Does NOT sync: users
  Uses: Practice.dentallyApiKey (encrypted) with DENTALLY_API_KEY env fallback
  Manual: Portal Integrations → Sync now
```

### 0.3 Cross-cutting gap matrix

| Feature | Legacy | New ELIO | Status |
|---------|--------|----------|--------|
| Unified login | 3 separate logins | One portal session | ✅ Keep |
| Per-practice Dentally key | Env or per-clinic (Pay) | Encrypted on `Practice`, unused at sync | ❌ |
| Manual “Sync now” button | Flow, Plans, Pay (period) | API only, no UI | ❌ |
| Sync status / last synced | Flow dashboard banner | Not shown anywhere | ❌ |
| Connection test / debug | Pay dentists page, Plans implicit | No UI | ❌ |
| Scheduled sync | Flow (frequent), Plans (daily), Pay (none) | Shell daily 03:00 only | 🟡 |
| Module-specific sync jobs | Each app had own logic | One generic mirror | ❌ |
| Payments from Dentally | Flow used `/payments` | Synced to `dentally_payments` (B.1) | ✅ |
| Payment plans from Dentally | Plans required for import | Synced to `dentally_payment_plans` (B.3) | ✅ |
| Google Sheets (Flow pipeline, Pay logs) | Primary or secondary store | Not integrated | ❌ (Flow migrated to DB; Pay needs decision) |
| Settings: Dentally config UI | Flow, Pay (site ID, therapists) | Signup step only | ❌ |
| Branding per practice | Flow/Plans settings | Portal theme only | 🟡 |
| Role-based nav | Each app had own roles | `@elio/auth` permissions | ✅ (different names, OK) |
| Inngest background jobs | N/A (inline serverless) | Required for shell sync | 🟡 Must verify prod |
| SMTP / email payslips | Pay AuraPay | Not wired in new Pay | ❌ |
| Blob/file storage | Pay bills, logos | Partial (Compass upload in-memory) | 🟡 |
| GoCardless mandate sync cron | Plans `gc-sync` daily | `GET /plans/api/cron/gc-sync` (`0 8 * * *`) | ✅ |
| Admin impersonation | N/A | Platform admin console | ✅ New capability |
| PWA / offline pages | No | All apps have `/offline` | ✅ New capability |

### 0.3a Cron schedule comparison (legacy vs new)

| Job | Legacy | Schedule | New ELIO | Schedule | Status |
|-----|--------|----------|----------|----------|--------|
| Flow full sync | ElioFlow `vercel.json` | `*/10 6-8 * * *` | Shell generic sync | `0 3 * * *` | ❌ Different scope + frequency |
| Plans Dentally sync | ElioPlans | `0 6 * * *` | Shell generic (no plan filter) | `0 5 * * *` on plans app | ✅ |
| Plans gc-sync | ElioPlans | `0 8 * * *` | `GET /plans/api/cron/gc-sync` | `0 8 * * *` | ✅ |
| Plans reconcile | ElioPlans | `0 9 * * *` | `/plans/api/cron/reconcile-payments` | `0 7 * * *` | ✅ (1h earlier) |
| Plans create charges | N/A | — | `/plans/api/cron/create-charges` | `0 6 * * *` | ✅ New (keep) |
| Pay Dentally fetch | AuraPay | Manual only | `POST /pay/api/pay-periods/[id]/fetch-dentally` | On demand (UI) | ✅ Y1 shipped |

### 0.4 Cross-cutting implementation steps

**Phase A — Fix sync foundation (blocks everything else)**

| Step | Work | Acceptance criteria |
|------|------|---------------------|
| A.1 | Wire `decryptSecret(practice.dentallyApiKey)` into `syncPracticeDentallyData` and Inngest job; fall back to env only for dev | Each practice syncs with its own key |
| A.2 | Add **Portal → Settings → Integrations** section: connection status, last sync time, last error, **Sync now** button → `POST /api/dentally/sync` | Staff can trigger sync without API knowledge |
| A.3 | Persist sync run metadata on `Practice` or new `DentallySyncRun` table (startedAt, finishedAt, counts, errors) | Dashboard can show “Last synced …” |
| A.4 | Add `GET /api/dentally/status` — configured?, last run, connection test ping | Debug without server logs |
| A.5 | Verify production: `CRON_SECRET`, Inngest, shell `vercel.json` cron, `DENTALLY_API_KEY` on shell deployment | Nightly sync actually runs |
| A.6 | Document env vars: Pay may need `DENTALLY_SITE_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` (if Pay log import kept) | Deploy checklist updated |
| A.7 | Verify **Inngest** registered, `INNGEST_*` on shell, `/api/inngest` reachable | Manual sync 202 → job completes |
| A.8 | Surface sync errors in portal (banner + last error message) | Client sees why data is stale |

**Phase B — Extend central sync (shared data layer)**

| Step | Work | Acceptance criteria |
|------|------|---------------------|
| B.1 | Add **payments** sync → new table or extend financial model | Flow deposit logic can use real payments |
| B.2 | Add **accounts** sync (planned private treatment value) | Flow plan value matches legacy |
| B.3 | Add **payment_plans** sync | Plans module can map Dentally plans | **Shipped** |
| B.4 | Add optional **site_id** filter on all Dentally calls (Pay parity) | Multi-site practices supported |

---

## Part 1 — ElioFlow parity

### 1.1 Legacy ElioFlow — full inventory

**Primary screen:** `/` — Pipeline dashboard (NOT a separate “pipeline” route)

#### Navigation (sidebar)

| Item | Route | Who |
|------|-------|-----|
| Pipeline | `/` | All |
| Clinics | `/clinics` | Admin |
| Users | `/users` | Admin |
| Settings | `/settings` | Admin |
| My Account | `/account` | User dropdown |

#### Dashboard header controls

- Date presets: This Week, Last Week, This Month, Last Month, 3/6/12 Months, Custom
- Dentist filter dropdown
- **Refresh** (re-read cache)
- **Sync Dentally** (opens full sync modal with live log)

#### Dashboard — 8 stat cards (always visible above table/charts)

| # | Metric |
|---|--------|
| 1 | Consultations |
| 2 | Attended |
| 3 | Converted |
| 4 | Stuck |
| 5 | Total Planned (£) |
| 6 | Total Paid (£) |
| 7 | Plan name count (e.g. AuraCare / `{planName}`) |
| 8 | Conversion % |

#### Dashboard — two view tabs

**Table view (default)**

- Search (name, phone, email)
- Status filter tabs with counts: All, Stuck, New, Thinking, Failed Finance, Price Shopping, Bad Experience, Out of Budget, Converted, Completed
- **Export CSV**
- Sortable table columns: Patient, Dentist, Booked By, Touchpoints, Plan badge, Consultation date, Plan Value, Paid, Progress (4 dots), Days, Status, Edit
- Progress dots: Attended → Has Plan → Deposit → Treatment Booked
- **Edit patient modal:** status, dentist, plan value override, touch points, elioCare checkbox, notes
- Click patient → edit modal (detail modal exists in code but not wired)

**Charts view**

1. Conversion funnel (Consultations → Attended → Plans Given → Converted)
2. Patients by status (donut)
3. Pipeline value by status (unconverted only)
4. Days since consultation (bar buckets)
5. Plan value distribution (bar buckets)
6. Quick stats: avg plan value, avg days to convert, attendance rate, plan rate

#### Sync flows (two types)

| Sync | Trigger | Scope |
|------|---------|-------|
| **Full sync** | Cron `*/10 6-8 * * *`, dashboard modal, `/api/run-sync` | Cosmetic Consultation appointments, 12 months, 25 patients/batch; adds new patients |
| **Manual / payment sync** | `/api/run-manual-sync` | Existing rows only; updates paid, deposit, treatment booked, plan value |

**Preserved on sync:** status, notes, practitioner (if manually edited), touchPoints, elioCare, planValueOverride

#### Conversion business rules (legacy)

```
converted = status in (converted, completed)
         OR ((hasDeposit OR totalPaid >= 450) AND hasTreatmentBooked)

stuck = attended AND NOT converted
deposit = payment >= £50 on/after consult date
```

#### Other legacy pages

| Page | Features |
|------|----------|
| Settings | Super admin creds, branding (logo, company, app name, plan name), primary color, Dentally API key field |
| Users | CRUD, roles (admin/manager/dentist/staff), clinic assignment, dentist name, can-view-all-patients |
| Clinics | CRUD card grid |
| Account | Profile, password change |
| Forgot / reset password | Email flow |

#### Data store

Google Sheets `Pipeline` tab — 20 columns (patientId, name, email, phone, consultationDate, attended, planValue, totalPaid, hasDeposit, treatmentBooked, practitioner, status, notes, touchPoints, elioCare, planValueOverride, bookedBy, appointmentState, lastSynced, …)

---

### 1.2 New ELIO Flow — today

#### Navigation

| Item | Route |
|------|-------|
| Pipeline | `/pipeline` (kanban board — 5 columns) |
| Reporting | `/reporting` |
| Enquiries | `/enquiries` |
| Reminders | `/reminders` |

**No home dashboard.** Root redirects to Pipeline.

#### Pipeline (kanban)

Columns: Capture → Consult+Quote → Outcome: Thinking → Reminders → Closed  
Drag-and-drop stage moves. Cards link to consult detail.

#### Reporting (`/reporting`)

Stats: total consultations, attended, converted, declined, stuck (thinking), conversion rate, avg plan value, avg days to convert, per-dentist table. Date range filter.

**Missing vs legacy home:** Total Paid stat card, elioCare count, charts tab, table view with 12 columns, status filter chips, CSV export, date presets, dentist filter on same screen.

#### Consult detail (`/consults/[id]`)

Quote, deposit, treatment booked, practitioner, notes, outcome, link Dentally appointment, sync financials, reminders, Plans handoff.

#### Dentally integration

- Reads **synced** appointments/invoices only (no live API from Flow)
- No automatic import of new cosmetic consultations from Dentally
- `syncConsultFinancials` sums **invoice totals**, not payments

#### Migrated data

819 legacy pipeline rows → `Enquiry`/`Consult` in Postgres (Aug 2025). Should appear in Pipeline/Reporting if correct `practiceId`.

---

### 1.3 ElioFlow — gap matrix

| Legacy feature | New ELIO | Status |
|----------------|----------|--------|
| Home = stats + table + charts | Pipeline kanban + separate Reporting | ❌ Layout changed |
| 8 stat cards on home | Partial stats on Reporting only | ❌ |
| Table view with 12 columns | Kanban cards only | ❌ |
| 6 charts on dashboard | None | ❌ |
| Date presets + dentist filter on home | Date filter on Reporting only | 🟡 |
| Status filter tabs (8 statuses) | Outcome enum (ACCEPTED/THINKING/DECLINED + stuck reasons) | 🟡 Different model |
| Export CSV | None | ❌ |
| Sync Dentally button + live log | None | ❌ |
| Payment-only sync | None | ❌ |
| Last synced banner | None | ❌ |
| Auto-import cosmetic consults from Dentally | None | ❌ |
| Full sync cron (every 10 min morning) | Shell daily sync only | ❌ |
| Edit modal (status, touchpoints, elioCare, override) | Consult detail form (partial fields) | 🟡 |
| Patient detail modal (appointments, invoices live) | Dashboard patient slide-over | ✅ |
| Progress dots (4-step) | Partial on consult | 🟡 |
| Conversion rule (deposit £50 / paid £450) | Outcome-based, not payment-rule | ❌ |
| Payments-based totalPaid / hasDeposit | Invoice-based sync | ❌ |
| Settings: branding, plan name, API key | None in Flow (portal settings only) | ❌ |
| Users / Clinics admin | Portal Team settings | 🟡 |
| Google Sheets backend | Postgres | ✅ (migrated) |
| Role: dentist sees own patients only | Permission system exists | 🟡 Verify filter |
| Forgot password | Portal flow | ✅ |
| **Booked By** column (who booked in Dentally) | Not on `Consult` model or UI | ❌ |
| **Appointment state** (DNA/Cancelled/Confirmed) | On `Appointment.dentallyState` — join exists, not shown in pipeline table | 🟡 |
| **Touch points** counter | Replaced by `Reminder` count per consult — UI does not show legacy-style count | 🟡 Design change |
| **Quote override** editable field | `quotePenceOverride` on model; limited edit UI | 🟡 |
| **Manual elioCare / planSignedUp toggle** | Set only via Plans handoff, not manual checkbox | 🟡 |
| **Practitioner edited flag** (don't overwrite on sync) | No `practitionerEdited` field — sync may overwrite dentist | ❌ |
| **Plans Given** funnel stage metric | Not in reporting (legacy chart used treatment plan value > 0) | 🟡 |
| **Pipeline value by status** (unconverted only) | Reporting shows totals; legacy chart excluded converted | 🟡 |
| **Total Paid stat card on home** | Only on reporting, not default landing | ❌ |
| **Flow settings: companyName, primaryColor, logo** | None in Flow module | Portal theme only | ❌ |
| **Flow sync auth (`CRON_SECRET`)** | Legacy sync routes bearer-protected | Shell sync uses `CRON_SECRET`; Flow has no sync routes | 🟡 |
| Clinics page + clinic filter on pipeline | Not implemented (clinic IDs on users unused in legacy too) | 🟡 Low priority |
| Manager role (between admin and dentist) | Not in new permissions | 🟡 |
| `/api/debug-appointments` | None | ❌ Dev only |
| `/api/run-sync` HTML batch runner | None (use in-app modal instead) | 🟡 |
| `/api/auth/init` one-time super admin setup | Portal signup + seed | ✅ Different path |
| Enquiries capture (new) | `/enquiries` page | ✅ New (keep) |
| Reminders workflow (new) | `/reminders` page | ✅ New (keep) |
| Kanban pipeline board (new) | `/pipeline` | ✅ New (keep as secondary tab) |

#### Flow — legacy status → new model mapping (required for table parity)

| Legacy `status` | New representation | UI label to show |
|-----------------|-------------------|------------------|
| `new` | `outcome` null, not attended | New |
| `thinking` | `outcome = THINKING` | Thinking |
| `failed-finance` | `outcome = THINKING` + `stuckReason = FAILED_FINANCE` | Failed Finance |
| `price-shopping` | `outcome = THINKING` + `stuckReason = PRICE_SHOPPING` | Price Shopping |
| `bad-experience` | `outcome = THINKING` + `stuckReason = BAD_EXPERIENCE` | Bad Experience |
| `out-of-budget` | `outcome = THINKING` + `stuckReason = OUT_OF_BUDGET` | Out of Budget |
| `converted` | `outcome = ACCEPTED` OR payment-rule converted | Converted |
| `completed` | `outcome = ACCEPTED` + `planSignedUp = true` (or separate flag) | Completed |

---

### 1.4 ElioFlow — implementation steps (new theme)

**Design principle:** Add a **“Dashboard”** nav item (or make `/pipeline` tabbed: **Overview | Board | Table**) using `@elio/ui` StatCard, TablePanel, charts — same metrics and sequence as legacy home, not kanban-first.

#### Phase F1 — Data & sync (backend)

| Step | Task | Details |
|------|------|---------|
| F1.1 | **Flow cosmetic consult import job** | After central sync, find appointments where `reason` contains “Cosmetic Consultation”; upsert `Consult` rows (match legacy dedupe: one per patient, most recent) |
| F1.2 | **Payment sync** (depends on B.1) | Populate `totalPaidPence`, `hasDeposit` from payments API |
| F1.3 | **Account / plan value sync** | Map `planned_private_treatment_value` to `quotePence` |
| F1.4 | **Treatment booked detection** | Future non-consultation appointments → `treatmentBooked` |
| F1.5 | **Preserve manual fields on re-import** | Same rules as legacy: don’t overwrite status, notes, practitioner if edited, touchPoints, elioCare, quote override |
| F1.6 | **Flow-specific cron or Inngest step** | Optional: morning batch like legacy (`*/10 6-8`) OR run after central sync |
| F1.7 | **Manual sync API** | `POST /flow/api/sync/dentally` — full + payment-only modes; auth + audit log |
| F1.8 | **Add `bookedBy` to Consult** (optional string) + populate from Dentally appointment `user_name` | Table column parity |
| F1.9 | **Touch points** — add `touchPointCount` on Consult OR surface `LegacyFlowTouchPointArchive` with edit UI | Legacy counter restored |
| F1.10 | **`practitionerEdited` flag** — skip practitioner overwrite on sync when true | Match legacy Sheets column L behaviour |

#### Phase F2 — Dashboard UI (parity layout)

| Step | Task | Details |
|------|------|---------|
| F2.1 | **New route `/dashboard` or `/pipeline?view=overview`** | Default landing = legacy-style overview (client expectation) |
| F2.2 | **Header toolbar** | Date presets, dentist filter, Refresh, **Sync Dentally** (modal with log via SSE or polling) |
| F2.3 | **8 stat cards** | Consultations, Attended, Converted, Stuck, Total Planned, Total Paid, `{planName}` count, Conversion % |
| F2.4 | **Last synced banner** | From `DentallySyncRun` + Flow job timestamp |
| F2.5 | **Tab: Table view** | All 12 columns; sort; search; status filter chips with counts |
| F2.6 | **Tab: Charts view** | 6 charts (use chart library consistent with design system) |
| F2.7 | **Export CSV** | Same columns as legacy export |
| F2.8 | **Edit consult drawer/modal** | Status mapping per table above; touchPoints, elioCare/planSignedUp toggle, **quotePenceOverride** input, notes, practitioner |
| F2.9 | **Progress indicator** | 4-dot component on table rows |
| F2.10 | **Patient detail panel** | Live Dentally fetch for appointments/invoices (like legacy `/api/patient/[id]`) — optional slide-over |
| F2.11 | **Keep kanban as second tab** | “Board view” for teams that want drag-and-drop — don’t remove, add overview first |

#### Phase F3 — Settings & admin (Flow module)

| Step | Task | Details |
|------|------|---------|
| F3.1 | **Flow settings page** | Plan display name (AuraCare), cosmetic consult reason filter, conversion thresholds (£50 deposit, £450 paid) |
| F3.2 | **Practitioner visibility** | Dentists see own pipeline unless `flow:view-all-patients` permission |
| F3.3 | **Branding overrides** | Optional: practice logo/name in Flow header (read from portal/practice settings) |

#### Phase F4 — Verification

| Step | Task |
|------|------|
| F4.1 | Compare stat card numbers against legacy Sheets export for same date range |
| F4.2 | Run cosmetic import on staging; confirm new Dentally consult appears within one sync cycle |
| F4.3 | E2E: sync button → table updates → CSV export matches |
| F4.4 | Client UAT script: walk through legacy daily workflow step-by-step |

---

## Part 2 — ElioPlans parity

### 2.1 Legacy ElioPlans — full inventory

#### Navigation (15 routes)

| Nav item | Route | Roles |
|----------|-------|-------|
| Dashboard | `/dashboard` | All |
| Patients | `/dashboard/patients` | SUPER_ADMIN, ADMIN, STAFF |
| Plans | `/dashboard/plans` | SUPER_ADMIN, ADMIN, STAFF |
| Redeems | `/dashboard/redeems` | SUPER_ADMIN, ADMIN, STAFF |
| Payments | `/dashboard/payments` | SUPER_ADMIN, ADMIN, FINANCE |
| Reconciliation | `/dashboard/reconciliation` | SUPER_ADMIN, ADMIN, FINANCE, AUDITOR |
| Dentally | `/dashboard/dentally` | SUPER_ADMIN |
| Documents | `/dashboard/documents` | SUPER_ADMIN |
| Reports | `/dashboard/reports` | SUPER_ADMIN, FINANCE |
| Users | `/dashboard/users` | SUPER_ADMIN |
| Audit Log | `/dashboard/audit-log` | SUPER_ADMIN, AUDITOR |
| Settings | `/dashboard/settings` | SUPER_ADMIN |
| Guide | `/dashboard/guide` | All (footer link) |
| Action Required | `/dashboard/action-required` | No nav link (orphan) |

#### Dashboard stats

| Stat | Logic |
|------|-------|
| Active Members | ACTIVE plan + ACTIVE patient + active GoCardless mandate |
| Monthly Revenue | Sum plan prices for qualifying actives (SUPER_ADMIN only) |
| Failed Payments | FAILED this calendar month |
| New Signups | `signupCompletedAt` this month (excludes Dentally bulk import) |

Also: Quick actions, recent activity (audit log), payment schedule reminder.

#### Dentally integration (critical)

| Feature | Details |
|---------|---------|
| **Plan mappings page** | Map Dentally payment plan **name** → ELIO plan |
| **Sync from Dentally button** | On Patients page → `POST /api/dentally/sync` |
| **Nightly cron** | 06:00 UTC, same sync function |
| **Import single patient** | Search Dentally → import |
| **Sync logic** | Only patients on **mapped** payment plans; creates INVITED patients; ACTIVE only with mandate |

#### Patients page — full flow

- Toolbar: Sync from Dentally, Check GoCardless (bulk), Export CSV, Add Patient
- Add Patient: Import from Dentally OR manual entry
- Filters: ACTIVE, INVITED, PENDING_DD, PAUSED, CANCELLED
- Table: Name, Email, Plan, Status, T&Cs signed, Joined, Actions (Invite, Setup DD)
- Detail tabs: Overview, Payments (GC + Dentally trail), Appointments (Dentally), Redeems, Documents, Correspondence, Notes
- Header actions: Resend invite, Check GC, Email DD link, Setup DD, Pause/Resume, Send T&C, New Redeem, Cancel, Link mandate

#### Plans page

- CRUD plans with inclusions, discounts, GC payment link, price increase flow (emails members)

#### Redeems

- Stat cards by status; approve/reject with reason; created from completed Dentally appointment

#### Payments page

- Status filters; notify on failed (stub in legacy)

#### Reconciliation

- Period picker; Run; mismatch table (MISSING, DUPLICATE, AMOUNT, etc.)

#### Reports (tabs)

Overview, Revenue (SUPER_ADMIN), Redeems, Breakage & BI (SUPER_ADMIN); CSV export

#### Settings (6 tabs)

Branding, Practice, GoCardless, Membership, Payment Rules, Payouts

#### Documents

T&C, Privacy, Other; seed T&C button

#### Users

CRUD; roles SUPER_ADMIN, ADMIN, STAFF (FINANCE/AUDITOR in schema but not in UI)

---

### 2.2 New ELIO Plans — today

#### Navigation (12 items)

Dashboard, Patients, Plans, Payments, Reconciliation, Redeems, Reports, Documents, Action Required, Audit Log, Users, Settings

**Missing nav vs legacy:** Dentally (mappings), Guide

#### Dashboard stats

Active plan patients, MRR, Collected this period, Overdue/failed, recent payments list.

**Different from legacy:** No “New Signups” card; no recent activity feed; no quick actions row.

#### Dentally

- **No sync button**
- **No plan mappings page**
- **No import-from-Dentally search**
- Patients enrolled from synced core `Patient` list only
- Central shell sync does not filter by payment plan

#### Patients detail

Enrolment + signup invite; Flow handoff prefill. **Missing:** payment trail tab, Dentally appointments tab, correspondence, notes, full header action set.

#### Settings

GoCardless status, redeem approval toggles, reconciliation info. **Missing:** branding, practice, payment rules, payouts, membership term tabs.

#### Cron

`create-charges` 06:00, `reconcile-payments` 07:00 — GoCardless only, no Dentally.

---

### 2.3 ElioPlans — gap matrix

| Legacy feature | New ELIO | Status |
|----------------|----------|--------|
| Dashboard 4 stat cards + activity | 4 different stats, no activity feed | 🟡 |
| Sync from Dentally button | None | ❌ |
| Dentally plan mappings page | None | ❌ |
| Nightly Dentally cron (Plans logic) | Central generic sync | ❌ |
| Import patient from Dentally search | None | ❌ |
| Patient detail: Payments trail | None | ❌ |
| Patient detail: Appointments (Dentally) | None | ❌ |
| Patient detail: Correspondence / Notes | None | ❌ |
| Patient header actions (pause, DD, etc.) | Partial | 🟡 |
| Plans CRUD + inclusions/discounts | Create + list; edit limited | 🟡 |
| Plan price increase flow | None | ❌ |
| Redeems from Dentally appointment | List + approve only; no create-from-appointment flow | ❌ |
| Reports tabs (Revenue, Breakage) | Simpler reports page | 🟡 |
| Documents CRUD + seed T&C | List only | 🟡 |
| Settings 6 tabs | 1 combined settings page | ❌ |
| Guide / help articles | None | ❌ |
| Branding settings | None in Plans | ❌ |
| Export CSV patients | None | ❌ |
| Bulk Check GoCardless | None | ❌ |
| Mandate-aware active member logic | Implemented in dashboard counts | ✅ |
| Public signup + DD flow | `/signup/[token]` | ✅ |
| GoCardless webhooks + crons | Implemented | ✅ |
| Action Required page | Exists | ✅ |
| Audit log | Exists | ✅ |
| **Patient detail page** (`/patients/[id]`) | **Does not exist** — table rows not links | ❌ Critical |
| **DentallyPlanMapping in DB** | **Not migrated, model missing** in new schema | `DentallyPlanMapping` model (P1.2) | ✅ |
| **`gc-sync` cron** (mandate reconciliation) | `GET /plans/api/cron/gc-sync` | ✅ |
| **`reassign-plans` utility** | `POST /plans/api/dentally/reassign-plans` | ✅ |
| **`setup-gc-links` admin** | None | ❌ |
| **`setup/dentally-plans` seed mappings** | None | ❌ |
| **Guide articles** (`/dashboard/guide`) | None | ❌ |
| **Public landing page** (`/`) | Portal launcher only | 🟡 |
| **`sign/[token]` standalone doc signing** | Folded into `/signup/[token]` flow | 🟡 Verify parity |
| **FINANCE / AUDITOR roles** in team UI | Schema supports; UI may not expose | 🟡 |
| **Patient notes** (`PatientNote`) | Model not in new schema | ❌ |
| **Family / parent-child plans** (`parentPatientId`) | Legacy links child to paying parent | **Shipped** — `PlanPatient.parentPatientId` + enrol/import UI |
| **PENDING_DD derived status filter** | Legacy filter chip (ACTIVE + no mandate); new list has no chip | ❌ |
| **Plan eligibility rules UI** | Legacy `PlanEligibilityRule` per plan; schema exists in new DB, **no UI** | ❌ |
| **Plan edit / delete / deactivate** | Legacy full CRUD on `/dashboard/plans`; new create + list only | ❌ |
| **Per-user permission overrides** | Legacy `UserPermission` beyond role; new uses `@elio/auth` roles only | ❌ |
| **Legacy `Setting` KV store** (~25 keys: branding, GC days, payout, payment rules) | Not migrated; only redeem toggles in new settings | ❌ |
| **`payoutPerExam` setting** | Legacy Settings → Payouts tab | Not in new schema/UI | ❌ |
| **Redeem create from Dentally appointment** | Legacy POST `/api/redeems` after completed appt | New list + approve only; no create flow | ❌ |
| **Email log / correspondence tab** | Legacy `EmailLog` model + patient tab | Not migrated | ❌ |
| **Users `[id]` edit/delete API** | Legacy CRUD | New list/create only | 🟡 |
| **Upload / branding APIs** | `/api/upload`, `/api/branding`, `/api/branding/public` | None in Plans app | ❌ |
| **Seed routes** (`/api/seed`, `/api/seed-terms`, `/api/guides/seed`) | Dev/bootstrap helpers | None | 🟡 Dev only |
| **Nav: Dentally** | Missing from `PLANS_MODULE_NAV` | ❌ |
| **Mobile nav** (legacy truncated to 5) | N/A — responsive sidebar | ✅ |

---

### 2.4 ElioPlans — implementation steps (new theme)

#### Phase P1 — Dentally sync (backend)

| Step | Task | Details |
|------|------|---------|
| P1.1 | **Port `runDentallySync()` logic** from `ElioPlans/src/lib/dentally-sync.ts` into `packages/dentally/plans-sync.ts` | Payment-plan filtered import | **Shipped** |
| P1.2 | **Create `DentallyPlanMapping` model + migration** (was deliberately NOT migrated in Step 1.9) | Map Dentally plan name → `PlanModel`; seed from legacy or manual setup | **Shipped** |
| P1.3 | **`POST /plans/api/dentally/sync`** + **`GET /plans/api/cron/dentally-sync`** | Manual + cron entry points | **Shipped** |
| P1.4 | **`GET /plans/api/dentally/patients?q=`** | Search/import single patient | **Shipped** |
| P1.5 | **`GET/POST /plans/api/dentally/mappings`** | CRUD mappings | **Shipped** |
| P1.6 | Use per-practice API key from Phase A | Same as shell sync | **Shipped** |
| P1.7 | Audit log on every sync run | Match legacy `AuditLog` actions | **Shipped** |
| P1.8 | **Port `gc-sync` cron** — reconcile mandates/payments from GoCardless | `GET /plans/api/cron/gc-sync` | **Shipped** |
| P1.9 | **`POST /plans/api/dentally/reassign-plans`** | Utility after mapping changes | **Shipped** |

#### Phase P2 — Dentally & Patients UI

| Step | Task | Details |
|------|------|---------|
| P2.1 | **Nav: Dentally** → `/dentally` mappings page (SUPER_ADMIN / OWNER) | Table: code, name, mapped plan, active, actions | **Shipped** |
| P2.2 | **Patients toolbar: Sync from Dentally** | Loading state + result toast (imported/updated/skipped/errors) | **Shipped** |
| P2.3 | **`/patients/[id]` detail page** (critical) | All tabs + header actions from legacy | **Shipped** (Notes/Correspondence placeholders — no legacy schema) |
| P2.3a | **Patient sub-route APIs** | pause, cancel, invite, send-terms, send-dd-link, check-gc, payment-trail, appointments, notes, correspondence | **Shipped** (notes/correspondence N/A; resume + GC discover + setup-dd + link-mandate) |
| P2.4 | **Add Patient dialog** — tab “Import from Dentally” | Search → select → confirm | **Shipped** |
| P2.5 | **Export CSV** on patients list | | **Shipped** |
| P2.6 | **Bulk Check GoCardless** button | Link mandates for imported patients | **Shipped** |
| P2.7 | **PENDING_DD filter chip** | Derived: ACTIVE enrolment + no active mandate | **Shipped** |
| P2.8 | **Family / child plan enrolment** | `parentPatientId` on `PlanPatient` + UI when plan price = 0 | **Shipped** |
| P2.9 | **Add Dentally to `PLANS_MODULE_NAV`** | Route `/dentally` | **Shipped** |

#### Phase P3 — Dashboard & reports parity

| Step | Task | Details |
|------|------|---------|
| P3.1 | **Dashboard: match legacy 4 cards** | Active Members (mandate-aware), Monthly Revenue (owner only), Failed Payments, New Signups | **Shipped** |
| P3.2 | **Recent activity feed** | Last 10 audit entries |
| P3.3 | **Quick actions row** | Add Patient, Send Invite, Failed Payments, Reports |
| P3.4 | **Reports tabs** | Overview, Revenue, Redeems, Breakage; CSV export for owner |
| P3.5 | **Payment schedule reminder** | Static info card (1st collection, 11th retry) |

#### Phase P4 — Plans, documents, settings

| Step | Task | Details |
|------|------|---------|
| P4.1 | **Plans: full edit** | Inclusions, discounts, eligibility rules, GC link, active toggle, delete guard |
| P4.2 | **Plan price increase flow** | Uses `parentPlanId` versioning + email members |
| P4.3 | **Documents: create/edit/seed T&C** | |
| P4.4 | **Settings tabs** | Port Part 15 Setting keys |
| P4.5 | **Guide section** | Help articles (optional if content in migrated DB) |
| P4.6 | **Redeem create flow** | From completed Dentally appointment |
| P4.7 | **Branding upload** | Logo/favicon + public branding endpoint |

#### Phase P5 — Verification

| Step | Task |
|------|------|
| P5.1 | Configure mappings on staging → Sync → patient count matches legacy |
| P5.2 | Active Members dashboard = legacy formula |
| P5.3 | New Dentally plan member appears after sync without manual enrol |

---

## Part 3 — ElioPay parity

### 3.1 Legacy ElioPay (AuraPay) — full inventory

#### Navigation

Dashboard, Payslips, Dentists, Lab Bills, Supplier Invoices, Bulk Payments, Reporting, Settings, Admin Zone (super admin)

#### Dashboard

- Active dentists, pay periods count, latest period
- New Period button
- Recent 5 periods list

**Note:** Real Dentally analytics appear on **payslip period detail**, not dashboard home.

#### Payslip period detail (main feature)

**Period actions:** Download All PDFs, Email All, **Fetch from Dentally** (draft only), Finalize/Reopen

**After Dentally fetch:** Summary panel (invoiced, paid, outstanding, flagged, finance); per-dentist analytics (chair mins, utilization %, £/hr)

**Per dentist expanded:** Gross/Net private, NHS, deductions breakdown, performance analytics, editable fields, private patients table, discrepancies, dentist log compare (Google Sheets / CSV), PDF/Email/Save

**NHS panel:** FP17 PDF upload, UDA entry, process statement

#### Dentists page

CRUD + **Check Dentally connection** (debug) + practitioner_id mapping

#### Settings sections

Clinic branding, Therapy calculator, Calculation rates (lab split, finance/Tabeo rates), **Dentally** (site ID, therapist IDs, NHS amounts), SMTP

#### Admin Zone

Users, Clinics (with **dentally_api_token** per clinic), Audit log

#### Sync model

**Manual only** — no cron. User clicks Fetch from Dentally on each draft period.

Env: `DENTALLY_API_TOKEN`, `DENTALLY_SITE_ID`, optional Google Sheets for takings logs.

---

### 3.2 New ELIO Pay — today

#### Navigation

Dashboard, Dentists, Lab Bills, Supplier Invoices, Bulk Payments, Pay Periods, Reporting, Settings (OWNER)

#### Dashboard

Current period stats, total owed, dentists paid, lab deductions, clinicians count, payslip list, Compass review alert.

**No Dentally fetch anywhere.**

#### Pay period detail

Compass PDF upload, manual review unmatched lines, **Calculate** (DB only), Lock, payslip PDF.

**Missing:** Fetch from Dentally, Google Sheets log compare, NHS FP17 panel, analytics cards, discrepancies UI, email all, private patients table from Dentally.

#### Pay calculation

`calculatePayslipForDentist` — uses Compass/NHS data; **`treatments: []` hardcoded** (Dentally private revenue not wired).

#### Settings

Cosmetic consultation treatment code only.

#### Legacy data

Old Turso payslips in `LegacyPayslipArchive` — not shown in UI.

---

### 3.3 ElioPay — gap matrix

| Legacy feature | New ELIO | Status |
|----------------|----------|--------|
| Fetch from Dentally (period) | None | ❌ |
| Dentally analytics (utilization, £/hr) | None | ❌ |
| Private patients table from invoices | None | ❌ |
| Discrepancies workflow | None | ❌ |
| Google Sheets takings compare | None | ❌ |
| NHS FP17 statement upload/parser | Compass upload (different format) | 🟡 |
| Per-dentist expanded payslip UI | Simpler payslip breakdown | ❌ |
| Download/Email all PDFs | Single PDF route exists | 🟡 |
| Finalize/Reopen period | Lock only (`POST .../lock`); **no reopen** to draft | 🟡 |
| **Save individual dentist entry** | Legacy `PUT /api/periods/entries` | Calculate-all only | ❌ |
| **Private patient row CRUD** | Legacy `POST/PUT/DELETE /api/periods/patients` | Normalized lines; no manual row edit API | ❌ |
| **Pay viewer read-only enforcement** | Legacy `viewer` role blocks writes | New `@elio/auth` permissions — verify all Pay routes | 🟡 |
| **NHS statement debug** | `POST /api/nhs-statement/debug` | None | ❌ |
| **Lab bills duplicate routes** | Legacy both `/api/lab-bills` and `/api/bills/lab` | Single `/pay/api/lab-bills` | ✅ Consolidated |
| **Admin bootstrap setup** | `POST /api/admin/setup` first-run | Platform seed + signup | 🟡 |
| **Settings logo upload** | `POST /api/settings/logo` | None | ❌ |
| **Bills seed migration tool** | `POST /api/bills/seed` | None | 🟡 One-time |
| Dentists: practitioner_id + debug | Dentists CRUD; no debug | 🟡 |
| Settings: therapy rates, finance rates, Dentally site | Cosmetic code only | ❌ |
| Admin: clinic API tokens | Platform admin console (different) | 🟡 |
| Reporting charts (lab, net pay trend) | Basic reporting route | 🟡 |
| Lab bills / supplier CRUD | Basic add/list only | 🟡 |
| **Lab bills: paid/unpaid toggle** | No `paid` field on `LabBillEntry` | ❌ |
| **Lab bills: file upload + preview** | No file attachment | ❌ |
| **Lab bills: summary cards + filters** | Dentist filter only | ❌ |
| **Lab bills: matrix table view** | List only | ❌ |
| **Supplier invoices: invoice # column** | Partial | 🟡 |
| **Bulk payments: Bank Details tab** | None | ❌ |
| **Bulk payments: mark paid** | None | ❌ |
| **Bulk payments: Starling CSV format** | Generic CSV, no bank columns | ❌ |
| **Saved lab/supplier entities + bank details** | `SavedLab`/`SavedSupplier` exist but no bank UI | ❌ |
| **Email single / all payslips** | None | ❌ |
| **Download all PDFs (ZIP)** | Single PDF only | ❌ |
| **Per-dentist Save + Undo** | Calculate only | ❌ |
| **Adjustments list** (additions/deductions) | `adjustmentReason` on calc only | ❌ |
| **Therapy breakdown JSON display** | Stored in legacy; not in new UI | ❌ |
| **Superannuation editable** on payslip | From Compass lines only | 🟡 |
| **Drift warning + Sync now** (gross vs patients) | None | ❌ |
| **Dentists fix-ids tool** | None | ❌ |
| **Dentally availability API** | Not ported (was unused in legacy UI) | 🟡 Low |
| **Dynamic clinic logo / favicon** | Static | 🟡 |
| **Account page** (profile/password) | Portal profile | ✅ |
| **Python payslip_generator_v4.py** pipeline | Replaced by web app — document retirement | 🟡 |
| Legacy payslip history | Archived, not visible | ❌ |

---

### 3.4 ElioPay — implementation steps (new theme)

#### Phase Y1 — Dentally fetch (backend) — **highest client priority for Pay**

| Step | Task | Details |
|------|------|---------|
| Y1.1 | **Port `/api/dentally` logic** from `ElioPay/aurapay/src/app/api/dentally/route.ts` | Invoice + appointment fetch for period date range |
| Y1.2 | **`POST /pay/api/pay-periods/[id]/fetch-dentally`** | Auth + draft-only guard; store results on `Payslip`/`PayLine` models |
| Y1.3 | **Map env vars** | Support `DENTALLY_API_KEY` or alias `DENTALLY_API_TOKEN`; `DENTALLY_SITE_ID` from practice settings |
| Y1.4 | **Dentist attribution** | Match `dentallyPractitionerId` on invoices to `Dentist` rows |
| Y1.5 | **NHS/therapy/finance exclusion rules** | Port keyword filters, therapist attribution, Tabeo rates from legacy |
| Y1.6 | **Analytics JSON** | Chair mins, utilization, £/hr → store on payslip for UI |
| Y1.7 | **Wire `calculatePayslipForDentist`** to synced/fetched treatments | Remove empty `treatments: []` |

#### Phase Y2 — Payslip period UI (parity layout)

| Step | Task | Details |
|------|------|---------|
| Y2.1 | **Period header actions** | Fetch from Dentally, Download All PDFs, Email All, Finalize/**Reopen** |
| Y2.1a | **`PUT /pay-periods/[id]/entries`** | Save single dentist without full recalculate |
| Y2.1b | **Private patient row edit API** | Port `periods/patients` PUT semantics onto `PrivateRevenueLineItem` |
| Y2.2 | **Fetch results banner** | Summary stats after fetch (dismissible) |
| Y2.3 | **Per-dentist accordion** | Collapsed: name, split %, NHS badge, net pay |
| Y2.4 | **Expanded: metrics + analytics cards** | Gross/net private, NHS, deductions, utilization, £/hr |
| Y2.5 | **Private patients table** | Columns: Patient, Date, Amount, Mins, £/hr, Status, Finance, actions |
| Y2.6 | **Discrepancies panel** | Types + resolve/add from log |
| Y2.7 | **Dentist log import** | Google Sheets + CSV paste + compare (if client still uses logs) |
| Y2.8 | **NHS statement panel** | FP17 upload OR continue Compass path — **decide with client** |
| Y2.9 | **Editable fields when draft** | Therapy mins, superannuation, adjustments, lab bills |
| Y2.10 | **Legacy payslip archive viewer** | Read-only view of pre-migration payslips |

#### Phase Y3 — Lab bills, bulk payments, settings

| Step | Task | Details |
|------|------|---------|
| Y3.1 | **Schema: `paid` flag** on `LabBillEntry` + `SupplierInvoiceEntry` | Match legacy bill workflow |
| Y3.2 | **Schema: bank details** on `SavedLab` / `SavedSupplier` | account name, sort code, account number |
| Y3.3 | **Lab bills UI parity** | Summary cards, year/month/lab filters, paid toggle, file upload, matrix view |
| Y3.4 | **Bulk payments tabs** | Bank Details + Unpaid Bills; mark paid; **Starling CSV** export |
| Y3.5 | **Pay settings page — full sections** | Therapy rates, lab/finance splits, Tabeo rates, Dentally site ID, therapist IDs, NHS amounts, SMTP |
| Y3.6 | **Dentists: Check Dentally connection** | Debug route + UI button |
| Y3.7 | **Practice-level Dentally token** | Owner can rotate key (encrypted on Practice) |
| Y3.8 | **Email payslips** | SMTP from settings; single + send-all |
| Y3.9 | **Download all PDFs** | ZIP generation |

#### Phase Y4 — Reporting & verification

| Step | Task | Details |
|------|------|---------|
| Y4.1 | **Reporting page** | Monthly costs, dentist net pay trend, anomaly detection (port from legacy) |
| Y4.2 | **Compare one period** legacy AuraPay vs new Pay after fetch — same net pay ±£1 |
| Y4.3 | **E2E: create period → fetch Dentally → calculate → PDF** |

---

## Part 4 — Unified portal (keep + extend)

These items **stay** but need extension so client never says “can’t sync”:

| Item | Current | Add |
|------|---------|-----|
| Signup step 2 — Dentally key | ✅ | Show validation / test connection |
| Portal Settings | Profile, Team, PWA, theme | **Integrations tab**: status, last sync, Sync now, reconnect key |
| Launcher | Module tiles | Show “Dentally connected” badge per practice |
| Admin console | Tenant list shows connection status | Link to tenant Dentally sync logs |
| Single login | ✅ | No change |

---

## Part 5 — Master implementation sequence

Recommended order to stop client pain fastest:

```
Week 1 — Foundation (unblocks all modules)
  A.1–A.8  Per-tenant keys + Sync now UI + Inngest + verify production cron
  B.1      Payments sync (needed for Flow deposit parity)

Week 2 — Pay (client payroll pain)
  Y1.1–Y1.7  Fetch from Dentally backend
  Y2.1–Y2.5  Payslip period UI core

Week 3 — Flow dashboard (client pipeline pain)
  F1.1–F1.5  Cosmetic consult import + payment fields
  F2.1–F2.8  Legacy-style dashboard (stats + table + sync button)

Week 4 — Plans (client membership pain)
  P1.1–P1.7  Plan mapping sync port
  P2.1–P2.3  Mappings page + Sync button + import dialog

Week 5 — Pay finance ops (lab/bulk) + Plans patient detail
  Y3.1–Y3.4  Lab paid flag, bank details, Starling CSV
  P2.3       Patients detail page

Week 6 — Polish & parity
  F2.9–F2.11 Charts, CSV, kanban coexist
  P2.4–P2.7  Patient detail tabs
  Y2.6–Y2.10 Discrepancies, logs, legacy archive
  P3–P4, Y3–Y4  Settings, reports, verification

Week 7 — Client UAT
  Side-by-side checklist with legacy URLs (read-only) vs new URLs
  Sign-off document
```

---

## Part 6 — Client UAT checklist (definition of done)

Client sign-off when **every row** passes on production-like staging:

### Flow

- [ ] Open Flow → first screen shows **8 stat cards** (same names as old app)
- [ ] Table lists all migrated patients with plan value, paid, status
- [ ] Click **Sync Dentally** → progress log → new consult from Dentally appears
- [ ] Charts tab shows funnel and status breakdown
- [ ] Export CSV downloads same columns as before
- [ ] Edit patient: status, notes, touch points, AuraCare flag saves
- [ ] Dentist login sees only own patients (unless admin)

### Plans

- [ ] Dentally mappings page: map plan codes
- [ ] **Sync from Dentally** imports patients on mapped plans
- [x] Dashboard Active Members matches mandate-aware count
- [ ] Patient list: **PENDING_DD** filter chip works
- [ ] Patient list rows link to **detail page** with all tabs (payments, appointments, notes, correspondence)
- [x] Free child plan requires parent patient selection
- [ ] Bulk Check GoCardless links mandates
- [ ] Plan edit: inclusions, discounts, eligibility rules
- [ ] Export CSV patients

### Pay

- [ ] Open draft pay period → **Fetch from Dentally** populates private patients
- [ ] Analytics show utilization and £/hr after fetch
- [ ] Calculate + PDF match legacy period within tolerance
- [ ] Dentists practitioner IDs map correctly
- [ ] Settings: therapy and finance rates configurable
- [ ] Lab bill: mark paid, upload invoice file
- [ ] Bulk payments: bank details saved, Starling CSV exports
- [ ] Email payslip to dentist
- [ ] View legacy archived payslip (read-only)

### Portal

- [ ] One login → all three modules
- [ ] Settings → Integrations shows connected + last sync + Sync now
- [ ] New Dentally data visible in all modules after one sync cycle

---

## Part 7 — File reference (quick index)

**Full step-by-step porting guide → Part 16.** Use this table for a quick lookup:

| Module | Legacy path (read first) | New path (implement in) |
|--------|--------------------------|-------------------------|
| Flow sync | `ElioFlow/pages/api/sync.ts`, `manual-sync.ts`, `lib/dentally.ts`, `lib/sheets.ts` | `elio/packages/dentally/src/sync.ts` + new `elio/apps/flow/app/api/sync/` |
| Flow dashboard | `ElioFlow/pages/index.tsx`, `pages/api/pipeline.ts` | `elio/apps/flow/app/dashboard/` (to create) |
| Flow settings | `ElioFlow/pages/settings.tsx`, `pages/api/settings.ts` | `elio/apps/flow/app/settings/` (to create) |
| Plans sync | `ElioPlans/src/lib/dentally-sync.ts`, `src/lib/dentally.ts` | `elio/packages/dentally/plans-sync.ts` (to create) |
| Plans mappings | `ElioPlans/src/app/(dashboard)/dashboard/dentally/page.tsx` | `elio/apps/plans/app/dentally/` (to create) |
| Plans patient detail | `ElioPlans/src/app/(dashboard)/dashboard/patients/[id]/page.tsx` | `elio/apps/plans/app/patients/[id]/` (to create) |
| Plans settings | `ElioPlans/src/app/(dashboard)/dashboard/settings/page.tsx`, `src/lib/settings.ts` | `elio/apps/plans/app/settings/` (extend) |
| Pay fetch | `ElioPay/aurapay/src/app/api/dentally/route.ts`, `src/lib/calculations.ts` | `elio/apps/pay/app/api/pay-periods/[id]/fetch-dentally/` (to create) |
| Pay payslip UI | `ElioPay/aurapay/src/app/payslips/[id]/page.tsx` | `elio/apps/pay/app/pay-periods/[id]/` (extend) |
| Pay lab/bulk | `ElioPay/aurapay/src/app/lab-bills/page.tsx`, `bulk-payments/page.tsx` | `elio/apps/pay/app/lab-bills/`, `bulk-payments/` (extend) |
| Central sync | — | `elio/packages/dentally/src/sync.ts`, `elio/apps/shell/app/api/cron/dentally-sync/route.ts` |
| Migrations | `elio/scripts/migrations/` | Already executed — do not re-run without approval |

---

## Part 8 — Explicit non-goals

Do **not** revert these (client said unified login is good):

- Separate login per module
- Google Sheets as Flow primary datastore (data already migrated)
- Turso for Pay (data migrated to Neon)
- Legacy UI styling (use `@elio/ui` components throughout)

---

## Part 9 — Schema & data gaps (third audit)

Items that block parity and are **not** just missing UI:

| Gap | Legacy | New ELIO | Action |
|-----|--------|----------|--------|
| `DentallyPlanMapping` | `ElioPlans` Prisma model | `plans_dentally_plan_mappings` (P1.2) | **Shipped** — seed UI in P2.1 |
| `PlanPatient.parentPatientId` | Child plan linked to paying parent | **Shipped** — optional self-FK on `PlanPatient` + enrol/import UI | |
| `PatientNote` | ElioPlans patient notes tab | **Missing** | New model or audit-log substitute |
| `EmailLog` | Sent email history per patient | **Not migrated** | New model or drop if correspondence not required |
| `UserPermission` | Per-user permission overrides | **Missing** — role-only in new auth | Map to `@elio/auth` or add override table |
| `Setting` KV (~25 keys) | ElioPlans `Setting` table | **Not migrated** | Extend `Practice` JSON or `PracticeSetting` table |
| `PlanEligibilityRule` UI | Per-plan rules (e.g. Dentally Fit) | **Schema exists** — no admin UI | Build plan edit form |
| `PlanModel.parentPlanId` / versioning | Price increase creates new version | **Schema exists** — no price-increase flow | Port `POST /plans/[id]/price-increase` |
| `Consult.bookedBy` | Sheets column P | **Missing** | Add optional string field |
| `Consult.practitionerEdited` | Sheets column L | **Missing** | Boolean flag for sync preserve |
| `Appointment.dentallyState` | Legacy `appointmentState` on row | **Exists** on `Appointment` | Join in Flow table UI (no new column) |
| Flow touch points | Manual counter on row | **`Reminder` count** per consult | Show count in UI; optional archive import |
| `LabBillEntry.paid` | AuraPay bills | **Missing** | Boolean + `paidAt` |
| `SupplierInvoiceEntry.paid` | AuraPay bills | **Missing** | Boolean + `paidAt` |
| `SavedLab` bank fields | AuraPay saved entities | **Missing** | accountName, sortCode, accountNumber |
| `SavedSupplier` bank fields | AuraPay saved entities | **Missing** | Same |
| `PayslipEntry` private patients JSON | AuraPay Turso | **Normalized** to `PrivateRevenueLineItem` — OK if UI reads it |
| `LegacyPayslipArchive` | N/A | **Exists** — no UI | Read-only viewer |
| Per-practice Dentally settings | Pay `settings` table keys | **Partial** — only `cosmeticConsultationTreatmentCode` on Practice | Extend Practice or Settings KV |
| Pay `settings` table (therapy, SMTP, site ID) | Turso key-value | **Not migrated** | Practice-level settings page |

### Migration status (do not re-run without approval)

| Source | Migrated | Not migrated (gap) |
|--------|----------|-------------------|
| ElioFlow Sheets | 819 consults, 791 patients | Users, Clinics tabs (superseded by portal) |
| ElioPlans DB | 76 patients, 81 enrolments, 41 mandates, docs, guides | **`DentallyPlanMapping`**, **`Setting`**, **`EmailLog`**, **`UserPermission`**, **`PatientNote`**, WebhookEvent |
| ElioPay Turso | Dentists, periods, labs, suppliers | **Payslip line items** → `LegacyPayslipArchive` only |

---

## Part 10 — Complete page route checklist

### ElioFlow — every legacy route

| Legacy route | New ELIO equivalent | Status |
|--------------|----------------------|--------|
| `/` (dashboard) | `/pipeline` + `/reporting` (split) | ❌ Need unified dashboard |
| `/settings` | Portal settings + Flow settings (to create) | ❌ |
| `/users` | Portal `/settings/team` | 🟡 |
| `/clinics` | None | ❌ Low priority |
| `/account` | Portal `/settings/profile` | ✅ |
| `/forgot-password` | Portal `/forgot-password` | ✅ |
| `/reset-password` | Portal `/reset-password/[token]` | ✅ |
| `/api/run-sync` (HTML) | In-app sync modal | 🟡 |
| `/api/run-manual-sync` (HTML) | In-app payment-only sync | 🟡 |

### ElioPlans — every legacy route

| Legacy route | New ELIO equivalent | Status |
|--------------|----------------------|--------|
| `/dashboard` | `/dashboard` | 🟡 Stats differ |
| `/dashboard/patients` | `/patients` | 🟡 No sync button |
| `/dashboard/patients/[id]` | `/patients/[id]` | ✅ |
| `/dashboard/plans` | `/plans` | 🟡 |
| `/dashboard/redeems` | `/redeems` | 🟡 |
| `/dashboard/payments` | `/payments` | 🟡 |
| `/dashboard/reconciliation` | `/reconciliation` | ✅ |
| `/dashboard/dentally` | **None** | ❌ Critical |
| `/dashboard/documents` | `/documents` | 🟡 |
| `/dashboard/reports` | `/reports` | 🟡 |
| `/dashboard/users` | `/users` | 🟡 |
| `/dashboard/audit-log` | `/audit-log` | ✅ |
| `/dashboard/settings` | `/settings` | ❌ |
| `/dashboard/guide` | **None** | ❌ |
| `/dashboard/action-required` | `/action-required` | ✅ |
| `/signup`, `/signup/complete` | `/signup/[token]` | 🟡 |
| `/sign/[token]` | Part of signup accept flow | 🟡 Verify |
| `/setup-dd/complete` | Mandate callback route | ✅ |
| `/login` | Portal `/login` | ✅ |

### ElioPay — every legacy route

| Legacy route | New ELIO equivalent | Status |
|--------------|----------------------|--------|
| `/dashboard` | `/` (pay home) | 🟡 |
| `/payslips` | `/pay-periods` | ✅ |
| `/payslips/new` | Create form on pay-periods | 🟡 |
| `/payslips/[id]` | `/pay-periods/[id]` | ❌ Missing Dentally fetch UI |
| `/dentists` | `/dentists` | 🟡 No debug |
| `/lab-bills` | `/lab-bills` | 🟡 Simplified |
| `/supplier-invoices` | `/supplier-invoices` | 🟡 Simplified |
| `/bulk-payments` | `/bulk-payments` | ❌ Missing bank/paid |
| `/reporting` | `/reporting` | 🟡 |
| `/settings` | `/settings` | ❌ |
| `/admin` | Platform `apps/admin` | 🟡 Different scope |
| `/account` | Portal profile | ✅ |
| `/login` | Portal login | ✅ |

---

## Part 11 — Complete API route parity (third audit — every route)

### 11.1 ElioFlow — 17 legacy routes

| # | Legacy API | New ELIO | Status |
|---|------------|----------|--------|
| 1 | `GET /api/pipeline` | `listPipeline` + reporting service | 🟡 Split across pages |
| 2 | `POST /api/status` | `PATCH /flow/api/consults/[id]` | 🟡 Partial fields |
| 3 | `GET /api/sync` (cron full) | Shell `/api/cron/dentally-sync` + Inngest | ❌ No Flow-specific import |
| 4 | `GET /api/manual-sync` (payment-only) | None | ❌ |
| 5 | `GET /api/patient/[id]` | `GET /flow/api/patients/[id]/live` | ✅ |
| 6 | `GET/PUT /api/settings` | Portal settings only | ❌ |
| 7 | `GET/POST/PUT/DELETE /api/users` | Portal `/api/team/users` | 🟡 |
| 8 | `GET/POST/PUT/DELETE /api/clinics` | None | ❌ Low priority |
| 9 | `GET/PUT /api/account` | Portal profile/password | ✅ |
| 10 | `POST /api/auth/login` | NextAuth (shell) | ✅ |
| 11 | `POST /api/auth/init` | Seed + portal signup | ✅ |
| 12 | `POST /api/auth/forgot-password` | Portal | ✅ |
| 13 | `POST /api/auth/reset-password` | Portal | ✅ |
| 14 | `POST /api/auth/validate-reset-token` | Portal | ✅ |
| 15 | `GET /api/debug-appointments` | None | ❌ Dev |
| 16 | `GET /api/run-sync` (HTML runner) | None — use in-app modal | 🟡 |
| 17 | `GET /api/run-manual-sync` (HTML) | None | 🟡 |

### 11.2 ElioPlans — 54 legacy routes (route-by-route)

| # | Legacy API | New ELIO | Status |
|---|------------|----------|--------|
| 1 | `POST /api/webhooks/gocardless` | `/plans/api/webhooks/gocardless` | ✅ |
| 2 | `GET/POST /api/users` | `/plans/api/users` (partial) | 🟡 |
| 3 | `GET/PUT/DELETE /api/users/[id]` | None | ❌ |
| 4 | `POST /api/upload` | None | ❌ |
| 5 | `POST /api/signup` | `/plans/api/public/signup/[token]/*` | ✅ |
| 6 | `POST /api/signup/complete` | Mandate callback flow | 🟡 Verify |
| 7 | `GET/POST /api/sign/[token]` | Folded into signup accept | 🟡 Verify |
| 8 | `POST /api/setup/dentally-plans` | None | ❌ |
| 9 | `POST /api/setup-dd/complete` | `/plans/api/public/signup/.../mandate/callback` | ✅ |
| 10 | `GET/PUT /api/settings` | `/plans/api/settings` (redeem toggles only) | 🟡 |
| 11 | `POST /api/seed` | None | 🟡 Dev |
| 12 | `GET /api/reports` | Inline in `/reports` page | 🟡 |
| 13 | `POST /api/seed-terms` | None | ❌ |
| 14 | `GET/PATCH /api/redeems/[id]` | `/plans/api/redeems/[id]` | ✅ |
| 15 | `GET/POST /api/redeems` | List page only; no POST create | ❌ |
| 16 | `GET/POST /api/plans` | `/plans/api/plans` (POST create) | 🟡 |
| 17 | `GET/PUT/DELETE /api/plans/[id]` | None | ❌ |
| 18 | `POST /api/plans/[id]/price-increase` | None | ❌ |
| 19 | `GET /api/payments` | `/payments` page (DB query) | 🟡 |
| 20 | `POST /api/patients/[id]/setup-dd` | `POST /plans/api/patients/[id]/setup-dd` | ✅ |
| 21 | `GET/POST /api/patients` | `/plans/api/enrolments` + list page | 🟡 |
| 22 | `POST /api/patients/[id]/send-terms` | `POST /plans/api/patients/[id]/invite` | ✅ |
| 23 | `POST /api/patients/[id]/send-dd-link` | `POST /plans/api/patients/[id]/invite` (email) | ✅ |
| 24 | `GET/PUT/DELETE /api/patients/[id]` | `GET /plans/api/patients/[id]` + detail page | 🟡 (no PUT/DELETE) |
| 25 | `GET /api/patients/[id]/payment-trail` | `GET /plans/api/patients/[id]/payment-trail` | ✅ |
| 26 | `POST /api/patients/[id]/pause` | `POST /plans/api/patients/[id]/pause` (pause + resume) | ✅ |
| 27 | `GET/POST /api/patients/[id]/notes` | None | ❌ Deferred (no schema) |
| 28 | `POST /api/patients/[id]/link-mandate` | `POST /plans/api/patients/[id]/link-mandate` | ✅ |
| 29 | `POST /api/patients/[id]/invite` | `POST /plans/api/patients/[id]/invite` | ✅ |
| 30 | `GET /api/patients/[id]/correspondence` | None | ❌ Deferred (no schema) |
| 31 | `POST /api/patients/[id]/check-gc` | `POST /plans/api/patients/[id]/check-gc` | ✅ |
| 32 | `GET /api/patients/[id]/appointments` | `GET /plans/api/patients/[id]/appointments` | ✅ |
| 33 | `POST /api/patients/[id]/cancel` | `POST /plans/api/patients/[id]/cancel` | ✅ |
| 34 | `POST /api/guides/seed` | None | 🟡 |
| 35 | `GET/PUT/DELETE /api/guides/[id]` | None | ❌ |
| 36 | `GET/POST /api/guides` | None | ❌ |
| 37 | `GET/POST /api/documents` | `/documents` page (read) | 🟡 |
| 38 | `POST /api/dentally/sync` | `POST /plans/api/dentally/sync` | ✅ |
| 39 | `POST /api/dentally/reassign-plans` | `POST /plans/api/dentally/reassign-plans` | ✅ |
| 40 | `GET /api/dentally/plans` | `GET /plans/api/dentally/plans` | ✅ |
| 41 | `GET /api/dentally/patients` | `GET /plans/api/dentally/patients` | ✅ |
| 42 | `PUT/DELETE /api/dentally/mappings/[id]` | `PUT/DELETE /plans/api/dentally/mappings/[id]` | ✅ |
| 43 | `GET/POST /api/dentally/mappings` | `GET/POST /plans/api/dentally/mappings` | ✅ |
| 44 | `GET /api/dashboard/stats` | Inline dashboard queries | 🟡 |
| 45 | `GET /api/cron/reconcile-payments` | `/plans/api/cron/reconcile-payments` | ✅ |
| 46 | `GET /api/cron/gc-sync` | `GET /plans/api/cron/gc-sync` | ✅ |
| 47 | `GET /api/cron/dentally-sync` | `GET /plans/api/cron/dentally-sync` | ✅ |
| 48 | `GET /api/branding/public` | None | ❌ |
| 49 | `GET/PUT /api/branding` | None | ❌ |
| 50 | `GET/POST /api/auth/[...nextauth]` | Shell NextAuth | ✅ |
| 51 | `GET /api/audit-log` | `/audit-log` page | ✅ |
| 52 | `POST /api/admin/setup-gc-links` | None | ❌ |
| 53 | `GET /api/admin/check-gc-connection` | None | ❌ |
| 54 | `POST /api/admin/bulk-check-gc` | `POST /plans/api/admin/bulk-check-gc` | ✅ |

**New-only Plans APIs (keep, not in legacy):**

| API | Purpose |
|-----|---------|
| `GET /plans/api/cron/create-charges` | Daily GC charge creation |
| `GET/POST /plans/api/reconciliation` | On-demand reconciliation runner |
| `GET/POST /plans/api/public/signup/[token]/accept` | Document acceptance step |
| E2E test routes under `/plans/api/test/*` | Dev/CI only |

### 11.3 ElioPay — 38 legacy routes (route-by-route)

| # | Legacy API | New ELIO | Status |
|---|------------|----------|--------|
| 1 | `GET /api/dentally/debug` | None | ❌ |
| 2 | `POST /api/dentally` | **Missing** | ❌ Critical |
| 3 | `GET/PUT /api/settings` | `/pay/api/settings` (cosmetic code only) | 🟡 |
| 4 | `POST /api/settings/logo` | None | ❌ |
| 5 | `GET/POST /api/periods` | `/pay/api/pay-periods` | ✅ |
| 6 | `POST/PUT/DELETE /api/periods/patients` | None | ❌ |
| 7 | `POST /api/periods/finalize` | `/pay/api/pay-periods/[id]/lock` (lock only) | 🟡 No reopen |
| 8 | `GET/PUT /api/periods/entries` | Calculate route only | ❌ |
| 9 | `POST /api/periods/dentist-log` | None | ❌ |
| 10 | `POST /api/payslips/send-email` | None | ❌ |
| 11 | `POST /api/payslips/send-all-emails` | None | ❌ |
| 12 | `POST /api/payslips/generate-pdf` | `/pay/api/payslips/[id]/pdf` | 🟡 |
| 13 | `GET /api/payslips/download-all` | None | ❌ |
| 14 | `POST /api/nhs-statement` | `/pay/api/compass/upload` | 🟡 Different format |
| 15 | `POST /api/nhs-statement/debug` | None | ❌ |
| 16 | `POST /api/lab-bills/upload` | None | ❌ |
| 17 | `POST /api/google-sheets/upload` | None | ❌ |
| 18 | `GET/POST/PUT/DELETE /api/lab-bills` | `/pay/api/lab-bills` | 🟡 No paid/file |
| 19 | `POST /api/google-sheets/takings` | None | ❌ |
| 20 | `GET /api/favicon` | Static favicon | 🟡 |
| 21 | `GET/POST/PUT/DELETE /api/dentists` | `/pay/api/dentists` | 🟡 No debug |
| 22 | `POST /api/dentists/fix-ids` | None | ❌ |
| 23 | `GET /api/dentally/availability` | None | 🟡 Unused in legacy UI |
| 24 | `POST /api/bills/upload` | None | ❌ |
| 25 | `GET/POST /api/bills/suppliers` | `/pay/api/supplier-invoices` | 🟡 |
| 26 | `POST /api/bills/seed` | None | 🟡 One-time |
| 27 | `GET/POST /api/bills/saved-entities` | DB models only | 🟡 No bank UI |
| 28 | `GET /api/bills/reporting` | `/pay/api/reporting` | 🟡 |
| 29 | `GET/POST/PUT/DELETE /api/bills/lab` | Same as `/api/lab-bills` | 🟡 Consolidated |
| 30 | `POST /api/bills/bulk-payment` | `/pay/api/bulk-payments` GET only | ❌ |
| 31 | `POST /api/auth` (login) | Shell NextAuth | ✅ |
| 32 | `POST /api/auth/password` | Portal password change | ✅ |
| 33 | `GET /api/auth/me` | Session from shell | ✅ |
| 34 | `GET/POST/PUT/DELETE /api/admin/users` | `apps/admin` tenant users | 🟡 |
| 35 | `POST /api/admin/setup` | Platform seed | 🟡 |
| 36 | `GET /api/admin` | Admin console home | 🟡 |
| 37 | `GET/POST /api/admin/clinics` | Admin tenant detail (partial) | 🟡 |
| 38 | `GET /api/admin/audit` | Admin audit (platform scope) | 🟡 |

**New-only Pay APIs (keep, not in legacy):**

| API | Purpose |
|-----|---------|
| `POST /pay/api/pay-periods/[id]/calculate` | Payslip calculation engine |
| `POST /pay/api/compass/upload` + review routes | Compass PDF NHS workflow |
| `POST /pay/api/compass-lines/[id]/review` | Line-by-line NHS review |

### 11.4 Shell / admin APIs (handoff-relevant, no legacy equivalent)

| API | Purpose | Status |
|-----|---------|--------|
| `POST /api/dentally/sync` | Manual central sync (no UI) | 🟡 |
| `GET /api/cron/dentally-sync` | Nightly sync trigger | 🟡 Verify prod |
| `POST /api/impersonate/start` | Admin impersonation redeem | ✅ |
| `POST /api/tenants/[id]/suspend` | Suspend practice | ✅ |
| `POST /api/tenants/[id]/licence` | Module licence toggle | ✅ |
| `POST /api/tenants/[id]/feature-flag` | Per-tenant flags | ✅ |
| `POST /api/tenants/[id]/impersonate/[userId]` | Start impersonation | ✅ |
| Admin Settings MFA/password routes | Super-admin handoff | ✅ |

---

## Part 12 — Production infrastructure checklist

Before telling the client “sync is fixed”, verify on **each Vercel project**:

| Deployment | Required env vars | Cron / jobs |
|------------|-------------------|-------------|
| `apps/shell` | `DATABASE_URL`, `NEXTAUTH_*`, `DENTALLY_API_KEY`, `CRON_SECRET`, `INNGEST_*`, `ENCRYPTION_KEY` | `0 3 * * *` → `/api/cron/dentally-sync` |
| `apps/flow` | `DATABASE_URL`, `NEXTAUTH_*`, `SHELL_APP_ORIGIN` | None (uses shell sync) |
| `apps/plans` | `DATABASE_URL`, `GOCARDLESS_*`, `CRON_SECRET` | `create-charges`, `reconcile-payments` |
| `apps/pay` | `DATABASE_URL`, `DENTALLY_API_KEY`, `DENTALLY_SITE_ID`, `BLOB_*`, `SMTP_*` | None (manual Dentally fetch) |

**Common failure modes:**

1. `DENTALLY_API_KEY` set on pay/plans/flow but **not on shell** → central sync never runs
2. Inngest not connected → manual sync returns 202 but job never executes
3. `CRON_SECRET` mismatch → cron returns 401 silently in Vercel logs
4. Pay expects `DENTALLY_API_TOKEN` in old docs but deploy has `DENTALLY_API_KEY`
5. Wrong `practiceId` after migration → data exists but UI shows empty for logged-in practice

---

## Part 13 — New ELIO features to KEEP (not in legacy)

Do not remove these when restoring parity — they are improvements:

| Feature | Module | Notes |
|---------|--------|-------|
| Unified portal launcher | Shell | Client approved |
| Module licensing / trials | Shell + admin | |
| Kanban pipeline board | Flow | Keep as secondary tab |
| Enquiries capture | Flow | New lead workflow |
| Reminders scheduling | Flow | |
| Flow → Plans handoff | Flow + Plans | |
| Compass PDF upload (NHS) | Pay | May coexist with FP17 parser |
| Platform admin console | Admin | Tenant suspend, licences, impersonation |
| PWA install + offline | All apps | |
| MFA for super admin | Admin | Option B handoff |
| Multi-tenant isolation | All | |
| Tenant suspend / reactivate | Admin | Legacy had no platform admin |
| Per-module licence toggles | Admin | Enforces module access at runtime |
| Feature flags per tenant | Admin | e.g. `beta-pay-engine` |
| Impersonation with audit trail | Admin + shell banner | Support/debug without shared passwords |

---

## Part 14 — Platform admin console (new — handoff checklist)

Not legacy parity, but required for **client operations** after handoff:

| Feature | Route / API | Status |
|---------|-------------|--------|
| Tenant list + pagination | `/` (admin) | ✅ |
| Tenant detail | `/tenants/[id]` | ✅ |
| Suspend / reactivate | `POST /api/tenants/[id]/suspend` | ✅ E2E verified |
| Module licence toggles (FLOW/PLANS/PAY) | `POST /api/tenants/[id]/licence` | ✅ E2E verified |
| Feature flags per tenant | `POST /api/tenants/[id]/feature-flag` | ✅ E2E verified |
| Impersonate staff user | `POST /api/tenants/[id]/impersonate/[userId]` → shell | ✅ E2E verified |
| Impersonation banner + end session | Shell `impersonation-banner` | ✅ |
| Super-admin Settings (password + MFA) | `/settings` | ✅ Handoff complete |
| MFA gate until enrolled | `require-mfa-complete` middleware | ✅ |
| Audit log for admin actions | Platform audit entries | ✅ |

**Not in admin (legacy was per-app):** Pay clinic-level `dentally_api_token` rotation — should move to **Portal → Settings → Integrations** (Phase A) for practice owners, not super-admin only.

---

## Part 15 — Legacy `Setting` keys not migrated (Plans reference)

When rebuilding Plans settings tabs, port these keys from `ElioPlans/src/lib/settings.ts`:

| Category | Keys |
|----------|------|
| GoCardless | `gocardless.environment`, `collection_day`, `retry_day`, `creditor_id` |
| Provider costs | `provider.cost_per_collection`, signup/setup/annual fees |
| Practice | `practice.name`, `currency`, `vat_enabled`, support email/phone |
| Branding | `brand.name`, `tagline`, `logo_url`, `favicon_url`, colors, `custom_domain`, email sender |
| Membership | `membership.min_term_months` |
| Payment failure | `payment.max_retries`, `grace_period_days`, `auto_suspend_redeems` |
| Payouts | **`payout.dentist_per_exam`** |
| Dentally | `dentally.api_key`, `dentally.practice_id`, `dentally.auto_match` |

Store on `Practice` columns, encrypted secrets, or a `PracticeSetting` KV table — match deploy env for secrets already in `plans.env`.

---

## Part 16 — Implementation reference guide (legacy → new)

**How to use this section**

1. Pick a step ID from Parts 0–5 (e.g. `Y1.2`, `P2.3`).
2. Open the **Legacy reference** file(s) below — that is the behaviour to replicate.
3. Implement in the **New ELIO target** path using `@elio/ui` components.
4. Do **not** copy-paste legacy auth, Turso, or Google Sheets storage — port logic only.
5. After porting, tick the matching row in Part 6 UAT checklist.

**Legend:** 📖 = read legacy first · ✏️ = create or extend in new repo

---

### Phase A — Cross-cutting sync foundation

| Step | Legacy reference (📖) | New ELIO target (✏️) | Notes |
|------|----------------------|----------------------|-------|
| A.1 Per-tenant API key | `ElioPlans/src/lib/dentally-sync.ts` (reads DB key), `ElioPay/aurapay/src/app/api/dentally/route.ts` (`DENTALLY_API_TOKEN`) | `elio/packages/dentally/src/resolve-api-key.ts` | **Shipped** |
| A.2 Sync now UI | `ElioFlow/pages/index.tsx` (Sync modal), `ElioPlans/.../patients/page.tsx` (Sync button) | `elio/apps/shell/app/(portal)/settings/integrations/` | **Shipped** |
| A.3 Sync run metadata | `ElioFlow/pages/index.tsx` (`lastSynced` banner) | `DentallySyncRun` model + `sync-run.ts` | **Shipped** |
| A.4 Connection status API | `ElioPay/aurapay/src/app/api/dentally/debug/route.ts` | `elio/apps/shell/app/api/dentally/status/route.ts` | **Shipped** |
| A.5 Prod cron verify | `ElioFlow/vercel.json`, `ElioPlans/vercel.json`, `elio-deploy-env/shell.env` | `elio/apps/shell/vercel.json` + `verify:dentally-sync` | **Shipped** |
| A.6 Env documentation | `ElioPay/aurapay/.env.local`, `elio-deploy-env/*.env` | `elio/docs/deploy-checklist.md` | **Shipped** |
| A.7 Inngest verify | — | `elio/packages/dentally/src/inngest.ts`, `elio/apps/shell/app/api/inngest/route.ts` | **Shipped** |
| A.8 Error surfacing | `ElioFlow/pages/index.tsx` (sync log errors) | `sync-status-banner.tsx` on launcher | **Shipped** |

### Phase B — Extend central sync

| Step | Legacy reference (📖) | New ELIO target (✏️) | Notes |
|------|----------------------|----------------------|-------|
| B.1 Payments sync | `ElioFlow/pages/api/manual-sync.ts`, `ElioFlow/lib/dentally.ts` | `elio/packages/dentally/src/sync.ts` + `DentallyPayment` model | **Shipped** |
| B.2 Accounts sync | `ElioFlow/pages/api/sync.ts` (`planned_private_treatment_value`) | `elio/packages/dentally/src/sync.ts` + `DentallyAccount` | **Shipped** |
| B.3 Payment plans sync | `ElioPlans/src/lib/dentally-sync.ts` | `elio/packages/dentally/src/sync.ts` + `DentallyPaymentPlan` | **Shipped** |
| B.4 Site ID filter | `ElioPay/aurapay/src/app/api/dentally/route.ts` | `elio/packages/dentally/src/client.ts` | `DENTALLY_SITE_ID` |

---

### Phase F — ElioFlow

| Step | Legacy reference (📖) | New ELIO target (✏️) | Notes |
|------|----------------------|----------------------|-------|
| F1.1 Cosmetic consult import | `ElioFlow/pages/api/sync.ts` (reason filter, dedupe), `lib/sheets.ts` | `importCosmeticConsultsFromDentally` + post-sync hook | **Shipped** |
| F1.2 Payment sync | `ElioFlow/pages/api/manual-sync.ts` | `elio/apps/flow/lib/flow-service.ts` → `syncConsultFinancials` | **Shipped** — uses B.1 `dentally_payments` |
| F1.3 Plan value sync | `ElioFlow/pages/api/sync.ts` | `syncConsultFinancials` (respects `quotePenceOverride`) | **Shipped** |
| F1.4 Treatment booked | `ElioFlow/pages/api/manual-sync.ts` | `syncConsultFinancials` (future appts) | **Shipped** |
| F1.5 Preserve manual fields | `ElioFlow/pages/api/sync.ts`, `manual-sync.ts` | `importCosmeticConsultsFromDentally` | **Shipped** |
| F1.6 Flow cron | `ElioFlow/vercel.json` (`*/10 6-8 * * *`) | Inngest step after central sync OR `elio/apps/flow/vercel.json` | Optional morning batch |
| F1.7 Manual sync API | `ElioFlow/pages/api/run-sync.ts`, `run-manual-sync.ts` | `elio/apps/flow/app/api/sync/route.ts` (to create) | Full + payment-only modes |
| F1.8 `bookedBy` field | `ElioFlow/pages/api/sync.ts` (`user_name`), `lib/sheets.ts` col P | `elio/packages/db/prisma/schema.prisma` → `Consult.bookedBy` | Migration required |
| F1.9 Touch points display | `ElioFlow/pages/index.tsx` (touchPoints column) | `elio/apps/flow/` — count `Reminder` where `sentAt != null` | Design change — see executive summary |
| F1.10 `practitionerEdited` | `ElioFlow/pages/api/manual-sync.ts` (keep practitioner) | `Consult.practitionerEdited` + sync guard | Migration required |
| F2.1 Dashboard route | `ElioFlow/pages/index.tsx` | `elio/apps/flow/app/dashboard/page.tsx` | **Shipped** — default landing |
| F2.2 Header toolbar | `ElioFlow/pages/index.tsx` | `dashboard-client.tsx` | **Shipped** — date presets, dentist filter, refresh, import |
| F2.3 Eight stat cards | `ElioFlow/pages/index.tsx`, `pages/api/pipeline.ts` | `getFlowDashboard` | **Shipped** |
| F2.4 Last synced banner | `ElioFlow/pages/index.tsx` | Portal sync banner (Phase A) | **Shipped** — link to Integrations |
| F2.5 Table view | `ElioFlow/pages/index.tsx` (table + filters) | `dashboard-client.tsx` | **Shipped** — core columns + status chips |
| F2.6 Charts view | `ElioFlow/pages/index.tsx` (charts section) | `dashboard-charts.tsx` | **Shipped** |
| F2.7 Export CSV | `ElioFlow/pages/index.tsx` (`exportCSV`) | `dashboard-client.tsx` client export | **Shipped** |
| F2.8 Edit modal | `ElioFlow/pages/index.tsx` (edit modal), `pages/api/status.ts` | `dashboard-edit-dialog.tsx` + `PATCH /flow/api/consults/[id]` | **Shipped** |
| F2.9 Progress dots | `ElioFlow/pages/index.tsx` | `dashboard-client.tsx` ProgressDots | **Shipped** |
| F2.10 Patient detail panel | `ElioFlow/pages/api/patient/[id].ts` | `dashboard-patient-panel.tsx` + `GET /flow/api/patients/[id]/live` | **Shipped** |
| F2.11 Keep kanban | — | `elio/apps/flow/app/pipeline/` + Board nav | **Shipped** — Dashboard + Board tabs |
| F3.1 Flow settings | `ElioFlow/pages/settings.tsx`, `pages/api/settings.ts` | `elio/apps/flow/app/settings/` (to create) | Plan name, thresholds |
| F3.2 Dentist visibility | `ElioFlow/pages/index.tsx` (dentist filter), `pages/api/users.ts` | `@elio/auth` permission `flow:view-all-patients` | |
| F3.3 Branding | `ElioFlow/pages/settings.tsx` | Read from portal/practice settings | |
| F4.x Verification | Export legacy Sheets + compare | E2E in `elio/apps/flow/e2e/` | Side-by-side stats |

**Flow — supporting legacy files (read when stuck)**

| Topic | File |
|-------|------|
| Sheets column layout | `ElioFlow/lib/sheets.ts` |
| Dentally API calls | `ElioFlow/lib/dentally.ts` |
| Pipeline stats math | `ElioFlow/pages/api/pipeline.ts` |
| Conversion rules | `ElioFlow/pages/index.tsx` (filtered stats ~line 650) |
| Cron config | `ElioFlow/vercel.json` |

---

### Phase P — ElioPlans

| Step | Legacy reference (📖) | New ELIO target (✏️) | Notes |
|------|----------------------|----------------------|-------|
| P1.1 Port sync logic | `ElioPlans/src/lib/dentally-sync.ts` | `elio/packages/dentally/src/plans-sync.ts` | **Shipped** |
| P1.2 Mapping model | `ElioPlans/prisma/schema.prisma` → `DentallyPlanMapping` | `elio/packages/db/prisma/schema.prisma` | **Shipped** |
| P1.3 Sync API + cron | `ElioPlans/src/app/api/dentally/sync/route.ts`, `api/cron/dentally-sync/route.ts` | `elio/apps/plans/app/api/dentally/sync/route.ts`, cron route | **Shipped** |
| P1.4 Patient search | `ElioPlans/src/app/api/dentally/patients/route.ts` | `elio/apps/plans/app/api/dentally/patients/route.ts` | **Shipped** |
| P1.5 Mappings CRUD | `ElioPlans/src/app/api/dentally/mappings/route.ts`, `mappings/[id]/route.ts` | `elio/apps/plans/app/api/dentally/mappings/` | **Shipped** |
| P1.6 Per-practice key | `ElioPlans/src/lib/dentally-sync.ts`, `src/lib/settings.ts` | Phase A.1 | **Shipped** |
| P1.7 Audit on sync | `ElioPlans/src/lib/audit.ts` | `elio/apps/plans` sync + cron routes | **Shipped** |
| P1.8 gc-sync cron | `ElioPlans/src/app/api/cron/gc-sync/route.ts`, `src/lib/gocardless.ts` | `elio/apps/plans/app/api/cron/gc-sync/route.ts` | **Shipped** |
| P1.9 Reassign plans | `ElioPlans/src/app/api/dentally/reassign-plans/route.ts` | `elio/apps/plans/app/api/dentally/reassign-plans/route.ts` | **Shipped** |
| P2.1 Mappings page | `ElioPlans/src/app/(dashboard)/dashboard/dentally/page.tsx` | `elio/apps/plans/app/dentally/page.tsx` | **Shipped** |
| P2.2 Sync button | `ElioPlans/.../patients/page.tsx` (toolbar) | `elio/apps/plans/app/patients/patients-sync-button.tsx` | **Shipped** |
| P2.3 Patient detail page | `ElioPlans/.../patients/[id]/page.tsx` | `elio/apps/plans/app/patients/[id]/page.tsx` | **Shipped** |
| P2.3a Patient sub-APIs | `ElioPlans/src/app/api/patients/[id]/*.ts` (10 routes) | `elio/apps/plans/app/api/patients/[id]/` | **Shipped** |
| P2.4 Import dialog | `ElioPlans/.../patients/page.tsx` (Add Patient tabs) | `import-from-dentally.tsx` + `POST /api/dentally/import-patient` | **Shipped** |
| P2.5 Export CSV | `ElioPlans/.../patients/page.tsx` | `GET /plans/api/patients/export` + header button | **Shipped** |
| P2.6 Bulk Check GC | `ElioPlans/src/app/api/admin/bulk-check-gc/route.ts` | `POST /plans/api/admin/bulk-check-gc` + toolbar button | **Shipped** |
| P2.7 PENDING_DD filter | `ElioPlans/.../patients/page.tsx`, `src/app/api/patients/route.ts` | `patient-list-filters.ts` + FilterBar chip | **Shipped** |
| P2.8 Family plans | `ElioPlans/prisma/schema.prisma` (`parentPatientId`), patients page form | `PlanPatient.parentPatientId` migration + UI | **Shipped** |
| P2.9 Nav item | `ElioPlans/src/components/` (sidebar nav) | `elio/packages/ui/lib/module-nav-items.ts` | **Shipped** |
| P3.1 Dashboard cards | `ElioPlans/.../dashboard/page.tsx`, `api/dashboard/stats/route.ts` | `dashboard-stats.ts` + `app/dashboard/page.tsx` | **Shipped** |
| P3.2 Activity feed | `ElioPlans/.../dashboard/page.tsx` | Dashboard component | Last 10 audit entries |
| P3.3 Quick actions | `ElioPlans/.../dashboard/page.tsx` | Dashboard row | |
| P3.4 Reports tabs | `ElioPlans/.../reports/page.tsx`, `api/reports/route.ts` | `elio/apps/plans/app/reports/page.tsx` | Revenue, Breakage |
| P3.5 Payment schedule card | `ElioPlans/.../dashboard/page.tsx` | Static info card | 1st / 11th |
| P4.1 Plan edit | `ElioPlans/.../plans/page.tsx`, `api/plans/[id]/route.ts` | `elio/apps/plans/app/plans/[id]/` (to create) | Inclusions, discounts, eligibility |
| P4.2 Price increase | `ElioPlans/src/app/api/plans/[id]/price-increase/route.ts` | `elio/apps/plans/app/api/plans/[id]/price-increase/route.ts` | Uses `parentPlanId` |
| P4.3 Documents CRUD | `ElioPlans/.../documents/page.tsx`, `api/documents/route.ts`, `api/seed-terms/route.ts` | `elio/apps/plans/app/documents/` (extend) | |
| P4.4 Settings tabs | `ElioPlans/.../settings/page.tsx`, `src/lib/settings.ts` | `elio/apps/plans/app/settings/page.tsx` | Part 15 keys |
| P4.5 Guide | `ElioPlans/.../guide/page.tsx`, `api/guides/route.ts` | `elio/apps/plans/app/guide/` (to create) | Optional |
| P4.6 Redeem create | `ElioPlans/src/app/api/redeems/route.ts`, `.../redeems/page.tsx` | `elio/apps/plans/app/redeems/` + API POST | From Dentally appt |
| P4.7 Branding upload | `ElioPlans/src/app/api/branding/route.ts`, `api/upload/route.ts`, `src/lib/branding-context.tsx` | Plans settings + blob storage | |
| P5.x Verification | Legacy DB export | Staging compare | Patient counts after sync |

**Plans — supporting legacy files (read when stuck)**

| Topic | File |
|-------|------|
| GoCardless billing | `ElioPlans/src/lib/billing.ts`, `src/lib/gocardless.ts` |
| Webhook handler | `ElioPlans/src/app/api/webhooks/gocardless/route.ts` |
| Reconciliation cron | `ElioPlans/src/app/api/cron/reconcile-payments/route.ts` → compare `elio/apps/plans/app/api/cron/reconcile-payments/route.ts` |
| Email templates | `ElioPlans/src/lib/email.ts` |
| Patient matching | `ElioPlans/src/lib/patient-matching.ts` |
| Permissions | `ElioPlans/src/lib/permissions.ts` |
| Public signup flow | `ElioPlans/src/app/signup/`, `src/app/api/signup/` |
| Schema (all models) | `ElioPlans/prisma/schema.prisma` |
| Cron config | `ElioPlans/vercel.json` |

---

### Phase Y — ElioPay

| Step | Legacy reference (📖) | New ELIO target (✏️) | Notes |
|------|----------------------|----------------------|-------|
| Y1.1 Port Dentally fetch | `ElioPay/aurapay/src/app/api/dentally/route.ts` | `elio/apps/pay/lib/dentally-fetch.ts` + fetch route | **Shipped** |
| Y1.2 Fetch API route | Same + `src/lib/period.ts` | `elio/apps/pay/app/api/pay-periods/[id]/fetch-dentally/route.ts` | **Shipped** — draft-only guard |
| Y1.3 Env vars | `ElioPay/aurapay/.env.local`, `elio-deploy-env/pay.env` | Pay Vercel env (`DENTALLY_SITE_ID`, therapist IDs/rate); practice UI = Y3.5 | **Shipped (env)** |
| Y1.4 Dentist attribution | `ElioPay/aurapay/src/app/api/dentally/route.ts` | `dentally-fetch.ts` + `Dentist.dentallyPractitionerId` | **Shipped** |
| Y1.5 Exclusion rules | `ElioPay/aurapay/src/lib/calculations.ts` | `pay-engine` + `private-revenue.ts` (therapy/finance deducted; Tabeo £ rates = Y3.5) | **Shipped** |
| Y1.6 Analytics JSON | `ElioPay/aurapay/src/app/payslips/[id]/page.tsx` (analytics cards) | `PayslipEntry.dentallyAnalyticsJson` + period UI | **Shipped** |
| Y1.7 Wire calculate | `ElioPay/aurapay/src/lib/calculations.ts` | calculate route + `calculatePayslipForDentist` (preserves Dentally lines) | **Shipped** |
| Y2.1 Period header actions | `ElioPay/aurapay/src/app/payslips/[id]/page.tsx` | `elio/apps/pay/app/pay-periods/[id]/page.tsx` | Fetch, Email All, Finalize |
| Y2.1a Save entry | `ElioPay/aurapay/src/app/api/periods/entries/route.ts` | `elio/apps/pay/app/api/pay-periods/[id]/entries/route.ts` (to create) | Per-dentist save |
| Y2.1b Patient row edit | `ElioPay/aurapay/src/app/api/periods/patients/route.ts` | Map to `PrivateRevenueLineItem` API | |
| Y2.2 Fetch banner | `ElioPay/aurapay/src/app/payslips/[id]/page.tsx` | Period detail page | Summary stats |
| Y2.3–Y2.5 Accordion UI | `ElioPay/aurapay/src/app/payslips/[id]/page.tsx` | Extend period detail | Per-dentist expand |
| Y2.6 Discrepancies | Same page (discrepancies panel) | Period detail component | |
| Y2.7 Dentist log compare | `ElioPay/aurapay/src/app/api/periods/dentist-log/route.ts`, `api/google-sheets/takings/route.ts` | Optional — confirm with client | |
| Y2.8 NHS panel | `ElioPay/aurapay/src/app/api/nhs-statement/route.ts` | `elio/apps/pay/app/pay-periods/[id]/compass-upload-form.tsx` + FP17 path | Coexist or choose |
| Y2.9 Editable draft fields | `ElioPay/aurapay/src/app/payslips/[id]/page.tsx` | Period detail forms | |
| Y2.10 Legacy archive | Turso payslip JSON (migrated) | `LegacyPayslipArchive` viewer in Pay | Read-only |
| Y3.1 Paid flag schema | `ElioPay/aurapay/src/app/api/bills/lab/route.ts` | `elio/packages/db/prisma/schema.prisma` | |
| Y3.2 Bank details schema | `ElioPay/aurapay/src/app/api/bills/saved-entities/route.ts` | Same schema | |
| Y3.3 Lab bills UI | `ElioPay/aurapay/src/app/lab-bills/page.tsx`, `api/lab-bills/upload/route.ts` | `elio/apps/pay/app/lab-bills/page.tsx` | |
| Y3.4 Bulk payments | `ElioPay/aurapay/src/app/bulk-payments/page.tsx`, `api/bills/bulk-payment/route.ts` | `elio/apps/pay/app/bulk-payments/page.tsx` | Starling CSV |
| Y3.5 Pay settings | `ElioPay/aurapay/src/app/settings/page.tsx`, `api/settings/route.ts` | `elio/apps/pay/app/settings/page.tsx` | Full sections |
| Y3.6 Dentally debug | `ElioPay/aurapay/src/app/api/dentally/debug/route.ts`, `dentists/page.tsx` | `elio/apps/pay/app/dentists/` + debug route | |
| Y3.7 Token rotation | `ElioPay/aurapay/src/app/api/admin/clinics/route.ts` | Portal integrations (Phase A) | Per-practice |
| Y3.8 Email payslips | `ElioPay/aurapay/src/app/api/payslips/send-email/route.ts`, `send-all-emails/route.ts` | Pay API routes (to create) | SMTP from settings |
| Y3.9 Download all PDFs | `ElioPay/aurapay/src/app/api/payslips/download-all/route.ts`, `src/lib/pdf-generator.ts` | ZIP route (to create) | Compare `elio/apps/pay/app/api/payslips/[id]/pdf/route.ts` |
| Y4.1 Reporting | `ElioPay/aurapay/src/app/reporting/page.tsx`, `api/bills/reporting/route.ts` | `elio/apps/pay/app/reporting/page.tsx` | |
| Y4.2–Y4.3 Verification | Legacy AuraPay period export | Staging tolerance ±£1 | |

**Pay — supporting legacy files (read when stuck)**

| Topic | File |
|-------|------|
| Pay period logic | `ElioPay/aurapay/src/lib/period.ts` |
| Payslip calculations | `ElioPay/aurapay/src/lib/calculations.ts` |
| PDF generation | `ElioPay/aurapay/src/lib/pdf-generator.ts` |
| Finalize/reopen | `ElioPay/aurapay/src/app/api/periods/finalize/route.ts` → new lock needs **reopen** |
| Supplier invoices | `ElioPay/aurapay/src/app/supplier-invoices/page.tsx` |
| Admin zone | `ElioPay/aurapay/src/app/admin/page.tsx` |
| Auth roles (viewer) | `ElioPay/aurapay/src/lib/auth.ts` → map to `@elio/auth` |
| Retired Python pipeline | `ElioPay/payslip_generator_v4.py` (if present) — **do not port** |

---

### Phase 4 — Portal extensions

| Step | Legacy reference (📖) | New ELIO target (✏️) | Notes |
|------|----------------------|----------------------|-------|
| Integrations tab | Flow sync modal + Plans sync button + Pay debug (combined UX) | `elio/apps/shell/app/settings/integrations/page.tsx` (to create) | Phase A.2 |
| Team/users | `ElioFlow/pages/users.tsx`, `ElioPlans/.../users/page.tsx` | `elio/apps/shell/app/settings/team/` | Already partial |

---

### New ELIO files already implemented (extend, do not rewrite)

When porting, **reuse** these — they replace parts of legacy:

| Area | New file | Replaces legacy |
|------|----------|-----------------|
| Central Dentally client | `elio/packages/dentally/src/client.ts` | Per-app `lib/dentally.ts` |
| Central sync | `elio/packages/dentally/src/sync.ts` | Generic mirror (extend, don't replace) |
| Flow service | `elio/apps/flow/lib/flow-service.ts` | Partial pipeline logic |
| Plans service | `elio/apps/plans/lib/plans-service.ts` | Partial billing/redeems |
| Pay service | `elio/apps/pay/lib/pay-service.ts` | Partial `calculations.ts` |
| GC webhook | `elio/apps/plans/app/api/webhooks/gocardless/route.ts` | Same path pattern in legacy |
| Reconcile cron | `elio/apps/plans/app/api/cron/reconcile-payments/route.ts` | Ported from legacy (verify) |
| Create charges cron | `elio/apps/plans/app/api/cron/create-charges/route.ts` | New (no legacy) |
| Public signup | `elio/apps/plans/app/api/public/signup/[token]/*` | Legacy signup/sign routes |
| Admin console | `elio/apps/admin/` | Legacy Pay admin (different scope) |
| DB schema | `elio/packages/db/prisma/schema.prisma` | 3 legacy schemas unified |

---

### Final audit confirmation checklist

Use this to confirm nothing was missed before starting implementation:

- [x] **Flow** — 8 pages + 17 API routes listed (Parts 10–11.1)
- [x] **Plans** — 18 pages + 54 API routes listed (Parts 10–11.2)
- [x] **Pay** — 12 pages + 38 API routes listed (Parts 10–11.3)
- [x] **Schema** — 20 blocking gaps documented (Part 9)
- [x] **Crons** — legacy vs new schedules compared (Part 0.3a)
- [x] **Deploy env** — `elio-deploy-env/` cross-referenced (Part 12)
- [x] **Admin handoff** — MFA, impersonation, licences documented (Part 14)
- [x] **Implementation refs** — every phase step → legacy file (Part 16)
- [x] **Intentional diffs** — touch points, Turso, Python pipeline noted (executive summary)
- [x] **UAT script** — client sign-off rows (Part 6)

**Nothing outstanding from code audit.** Remaining work is implementation only.

---

*This document should be updated as each phase ships. Link PRs to phase/step IDs (e.g. `F2.3`, `Y1.2`) in commit messages for traceability. When a step ships, add the PR link in the Part 16 row.*
