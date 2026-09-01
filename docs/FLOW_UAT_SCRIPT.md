# Elio Flow — Client UAT Script (F4.4)

Walk through the legacy ElioFlow daily workflow in the new Elio Flow module. Check each step against the old app behaviour.

## Prerequisites

- Practice has FLOW licence and Dentally connected (Portal → Integrations)
- Log in as practice owner (`dev-owner@elio.test` in local seed)
- Optional: legacy ElioFlow open in another tab for side-by-side comparison

## 1. Morning dashboard review

1. Open **ELIO Portal** → launch **Flow**
2. Confirm sidebar shows practice branding (logo + app name if configured in **Settings**)
3. On **Dashboard**, verify stat cards: Consultations, Attended, Converted, Stuck, Total planned, Total paid, Plan sign-ups, Conversion %
4. Compare numbers with legacy dashboard for the same period (use **All time** or matching date preset)
5. Filter by dentist (owners/admins only) and confirm table rows update

## 2. Import & sync

1. Click **Import from Dentally** — toast shows created/updated counts
2. Click **Sync payments** — toast shows updated consult count
3. Confirm table rows reflect latest paid amounts and statuses
4. (Optional) **Full sync** — returns 202 when Portal sync is configured

## 3. Patient workflow

1. Search for a patient by name, phone, or email
2. Click patient name → detail panel opens
3. Click **Edit** → update status, quote, deposit, plan signed up, notes
4. Save and confirm row updates without full page reload

## 4. Pipeline board

1. Open **Board** tab
2. Confirm cards appear in Capture / Consult+Quote / Thinking / Reminders / Closed columns
3. Drag a card to another column (if data exists) — card stays in new column after refresh

## 5. Reporting

1. Open **Reporting**
2. Confirm funnel counts and conversion rate load
3. Apply a date range filter and confirm numbers change

## 6. Settings & branding

1. Open **Settings**
2. Set **App display name** and optional logo (upload or URL)
3. Save → reload Flow → sidebar and favicon update
4. Confirm **Plan display name** appears on dashboard stat card

## 7. Export

1. On Dashboard **Table** view, click **Export CSV**
2. Open file — columns: Name, Phone, Email, Dentist, Booked by, Consultation Date, Plan Value, Paid, Status, Touchpoints, Plan Signed Up, Notes
3. Filename should be `{app-name}-export-{date}.csv` (legacy parity)

## 8. Practitioner visibility (dentist login)

1. Log in as a STAFF user linked to a dentist (no view-all permission)
2. Dashboard shows only that dentist's patients; dentist filter is hidden
3. Attempting to edit another dentist's consult via API should return 403

## Sign-off

| Area | Legacy match? | Notes |
|------|---------------|-------|
| Stat cards | ☐ | |
| Import/sync | ☐ | |
| Edit consult | ☐ | |
| Kanban board | ☐ | |
| Reporting | ☐ | |
| Branding | ☐ | |
| CSV export | ☐ | |
| Dentist scope | ☐ | |

Run automated parity check when legacy export is available:

```bash
LEGACY_FLOW_EXPORT_PATH=./legacy-flow-stats.json PRACTICE_ID=seed-practice npx tsx scripts/verify-flow-parity.ts
```
