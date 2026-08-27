# Step 1.9 data migration scripts

Status: **ElioPay ✅ DONE, ElioPlans ✅ DONE, ElioFlow ✅ DONE — all executed for real (ElioPay/ElioPlans 2026-08-19, ElioFlow 2026-08-25).** See `project-docs/PROJECT_STATE.md`'s Step 1.9 entries for full context and verification evidence.

## `migrate-elioplans.ts` — ✅ DONE

Turned out simpler than expected: the old ElioPlans data was never in a separate database at all. Its original unmapped PascalCase tables (`Patient`, `Plan`, `PatientPlan`, `Mandate`, `Payment`, `Document`, `DocumentAcceptance`, `SigningRequest`, `GuideArticle`) coexist in the SAME Neon database as the new schema's own `plans_*`-prefixed tables — exactly why Step 1.7's schema merge used `@@map()` in the first place. No separate credentials, no generated old-schema Prisma Client needed — this script queries the old tables via raw SQL (`$queryRawUnsafe`) through the exact same `@elio/db` connection everything else uses, and writes into the new mapped tables through normal Prisma calls.

Migrated for real: 76 patients, 4 plans, 81 plan enrolments, 41 mandates, 3 documents, 38 document acceptances, 62 signing requests, 6 guide articles. `Clinic`/`UserPermission`/old `User`/`EmailLog`/`WebhookEvent`/`DentallyPlanMapping`/`Setting` deliberately not migrated (see the script's own header comment for why); `PatientNote` has no new-schema equivalent (checked: 0 real notes existed, so nothing was actually lost). Real spot-check evidence and row-count deltas are in `project-docs/PROJECT_STATE.md`'s 1.9 ElioPlans closeout entry.

**A real mid-task catch worth remembering**: the first connection string obtained for "the old ElioPlans database" was actually a completely different, unrelated application (tables like `CaseFile`/`ConsentPacket`/`TreatmentPlan` — nothing resembling ElioPlans' schema). Caught by inspecting the actual table names before writing any migration logic against it, rather than assuming the label on the credential was correct. Worth remembering for any future old-system connection: verify what a connection string actually points to before trusting it.

## `migrate-elioay.ts` — ElioPay migration, ✅ DONE

Executed for real against the live production database on 2026-08-19, with explicit user approval. The old ElioPay app (`ElioPay/aurapay`) used **Turso** (SQLite-based) — `Dentist`/`PayPeriod`/`SavedLab`/`SavedSupplier`/`LabBillEntry`/`SupplierInvoiceEntry` all migrated cleanly, field-by-field. Old `payslip_entries` rows (which store itemized real patient-payment data as JSON blobs with no safe automatic mapping onto the new normalized `PayslipEntry`/`PrivateRevenueLineItem` models) were preserved verbatim in a new `LegacyPayslipArchive` model instead of risking an unverified transformation of real payroll history — see `project-docs/PROJECT_STATE.md`'s 1.9 closeout entry for the full reasoning and verification evidence.

Credentials live in `scripts/migrations/.env.local` (gitignored, `OLD_ELIOPAY_TURSO_URL`/`OLD_ELIOPAY_TURSO_TOKEN`, read-only token). Re-running `npx tsx migrate-elioay.ts` (dry run) or `--execute` is safe — every insert is idempotent (matched on the old row's own id or the dentist's real Dentally practitioner id), so a second run is a no-op, not a duplicate.

`inspect-elipay-turso.ts` is a standalone read-only schema/row-count inspector, kept for future reference if the old database needs checking again.

## `migrate-elioflow.ts` — ✅ DONE (2026-08-25)

**Decision (made using project context per the user's explicit instruction, not a guess):** migrate the real old ElioFlow Google Sheets "Pipeline" data. The new `Enquiry`/`Consult`/`Reminder` schema (`packages/db/prisma/schema.prisma`) was deliberately designed against the old Sheets fields — its own comments cite `planValueOverride`/`elioCare`/`attended`/`hasDeposit`/`treatmentBooked`/`dentistName` matching directly. This is real patient-linked consult/pipeline history with real financial figures and outcomes, not informal scratch notes — worth preserving for the reporting screen's continuity and so Hisham doesn't see an empty pipeline board on day one. Step 1.8's "full rebuild, not a port" instruction was about the APPLICATION, not about discarding real business history.

Field mapping (old Sheets column -> new model field), full reasoning in the script's own header comment:
- `Patient ID` (real Dentally patient id) -> matched/created against core `Patient.dentallyId`
- `consultationDate`/`attended`/`practitioner`(name-matched to real `Dentist`)/`planValue`/`planValueOverride`/`totalPaid`/`hasDeposit`/`treatmentBooked`/`notes`/`elioCare` -> `Enquiry`/`Consult` fields, direct 1:1
- `status` (old 8-value vocabulary, confirmed against `ElioFlow/pages/index.tsx`'s real `STATUS_OPTIONS`) -> new `ConsultOutcome`/`ConsultStuckReason` enums
- `touchPoints` (a bare counter, never had per-contact dates) -> preserved verbatim in a new `LegacyFlowTouchPointArchive` model (safe additive migration `20260825050000_flow_legacy_touch_point_archive`) rather than fabricating fake dated `Reminder` rows — same reasoning as ElioPay's `LegacyPayslipArchive`.
- Old Sheets `Users`/`Clinics` tabs -> NOT migrated, fully superseded by the new NextAuth+RBAC system; migrating old plaintext/bcrypt passwords would be a security anti-pattern.

**Verification, all real:**
- Dry run first: 819 real pipeline rows found, 0 skipped, 791 projected new core `Patient` rows, 28 matched existing, 809/819 practitioners name-matched, 10 unmatched (flagged, not dropped).
- **Explicit user approval obtained before `--execute`.**
- Executed for real against the live production Neon DB. Network to Neon was intermittently unstable throughout (drops mid-write, occasional multi-minute hangs) — every write is an idempotent `upsert` keyed on a deterministic id derived from the old Sheets row's real Patient ID, so repeated retries after a drop safely resumed without creating duplicates. Also applied `connect_timeout=10&socket_timeout=15` on the connection string to fail fast on a dead connection instead of hanging.
- Re-queried the live DB directly afterward (not the script's own self-report): `Enquiry`/`Consult`/`LegacyFlowTouchPointArchive` all 0 -> 819 exactly; core `Patient` 82 -> 873 (+791, exact match to dry run). Consults with no matched practitioner: 10 (exact match).
- **Real spot-check**: pulled a real migrated `Consult` for patient "Laura Harries" (Dentally id 4927) — `outcome: ACCEPTED`, £3,700 quote, correctly linked to real dentist "Zeeshan Abbas" (the same dentist independently confirmed in the ElioPay migration's own spot-check). Pulled a real `LegacyFlowTouchPointArchive` row (patient 11632, 4 touch points) — raw sheet row intact.
- Credentials: `OLD_ELIOFLOW_SPREADSHEET_ID` in `scripts/migrations/.env.local` (gitignored); the Google service-account JSON lives in `scripts/migrations/google-credentials.json` (gitignored, NOT inline in `.env.local` — `dotenv` unescapes `\n` in double-quoted values, which corrupts the credential JSON's `private_key` field before `JSON.parse` ever sees it; a standalone file read via `fs` avoids that entirely).
