# Elio Pay — Practice Setup & Bulk Import Requirements

**Status:** Requirements (pre-implementation)  
**Requested:** One-time setup with **manual add** OR **bulk import** — not repetitive one-by-one entry.  
**Relates to roadmap:** Y3.5 (settings), saved entities (Y3.2), dentists, lab/supplier master data.

---

## 1. Problem statement

Today, Pay master data is entered **one record at a time**:

| Area | Current UX | Pain |
|------|------------|------|
| Saved labs / suppliers | Add row in Bulk Payments → Bank Details | 10–30 labs × 4 fields = tedious |
| Dentists | Add dentist form, one at a time | New practice onboarding = many dentists |
| Pay settings | Single cosmetic code only (Y3.5 pending) | Therapy rates, therapist IDs, NHS amounts, SMTP are env/manual |
| Lab bills / supplier invoices | Add per bill on lab-bills page | Historical migration from AuraPay is slow |

**Goal:** A practice admin can **set up once** — either paste/upload a CSV **or** add/edit manually — then only touch exceptions.

---

## 2. Scope

### In scope (v1)

1. **Practice Setup hub** — single page: `/pay/setup` (or Settings → “Import & setup” tab)
2. **Bulk import** for master data (CSV upload + paste + template download)
3. **Manual add/edit** retained everywhere (not removed)
4. **Export current data** as CSV (backup, edit offline, re-import)
5. **Import preview** with validation before commit
6. **Pay settings full sections** (Y3.5) stored per practice, editable in UI + importable as one settings CSV/JSON row

### Out of scope (v1)

- Google Sheets live sync (stub only, like dentist log)
- Auto-import dentists from Dentally (separate Y3.6/Y3.7)
- Vercel Blob for logos (local placeholder OK initially)
- Cross-practice import (tenant isolation strict)

---

## 3. User roles & permissions

| Action | Permission |
|--------|------------|
| View setup / export | `pay:view` |
| Manual add/edit master data | `pay:edit-bills` or `practice:manage` (match saved-entities) |
| Bulk import / overwrite | `practice:manage` only |
| Pay settings (rates, SMTP) | `practice:manage` |

---

## 4. Data domains & import formats

### 4.1 Saved labs

**Purpose:** Lab names + bank details for bulk Starling CSV and lab bill assignment.

**Storage:** `pay_saved_labs` (`SavedLab`)

| Column (CSV header) | Required | Example | Notes |
|---------------------|----------|---------|-------|
| `name` | Yes | `Acme Dental Lab` | Unique per practice |
| `account_name` | No | `Acme Lab Ltd` | Defaults to `name` |
| `sort_code` | No | `11-22-33` or `112233` | Normalized to `XX-XX-XX` |
| `account_number` | No | `12345678` | Digits only |

**Manual:** Existing Bulk Payments → Bank Details table (keep).

**Import API:** `POST /pay/api/setup/import` with `{ type: "labs", rows: [...], mode }`  
**Export:** `GET /pay/api/setup/export?type=labs` → CSV download.

---

### 4.2 Saved suppliers

Same shape as labs; `type: "suppliers"`; table `pay_saved_suppliers`.

| Column | Required | Example |
|--------|----------|---------|
| `name` | Yes | `Henry Schein` |
| `account_name` | No | `Henry Schein UK` |
| `sort_code` | No | `40-05-30` |
| `account_number` | No | `87654321` |

---

### 4.3 Dentists

**Storage:** `pay_dentists` (`Dentist`)

| Column | Required | Example | Notes |
|--------|----------|---------|-------|
| `name` | Yes | `Dr Sarah Jones` | |
| `pay_type` | Yes | `PERCENTAGE_SPLIT` or `HOURLY` | |
| `private_split_percent` | If split | `50` | 0–100 |
| `uda_rate` | If split | `25.00` | Pounds; stored as pence |
| `hourly_rate` | If hourly | `35.00` | Pounds |
| `nhs_performer_number` | No | `123456` | |
| `dentally_practitioner_id` | No | `189342` | For Dentally fetch attribution |
| `email` | No | `sarah@clinic.com` | For payslip email (Y3.8) |

**Duplicate rule:** Match on `name` (case-insensitive) or `dentally_practitioner_id` if provided.

---

### 4.4 Pay settings (Y3.5)

**Storage:** New `Practice.paySettingsJson` (JSON) **or** `pay_practice_settings` key-value table. Recommended: **JSON on Practice** for v1 (single blob, easy export/import).

**Sections (match legacy AuraPay settings page):**

#### A. Clinic branding
| Key | Type | Default | Example |
|-----|------|---------|---------|
| `clinic_name` | string | practice.name | `Aura Dental` |
| `clinic_logo_url` | string | null | URL or `local://...` |
| `clinic_address_line1` | string | | `123 High St` |
| `clinic_address_line2` | string | | |
| `clinic_city` | string | | `London` |
| `clinic_postcode` | string | | `SW1A 1AA` |
| `clinic_phone` | string | | |
| `clinic_email` | string | | |
| `clinic_website` | string | | |

#### B. Therapy calculator
| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `therapy_hourly_rate` | decimal | `35` | £/hour |
| `therapy_rate` | decimal | `0.5833` | £/min; auto-sync with hourly |

#### C. Calculation rates
| Key | Type | Default |
|-----|------|---------|
| `lab_bill_split` | decimal | `0.50` |
| `finance_fee_split` | decimal | `0.50` |
| `finance_rate_3m` | decimal | `0.045` |
| `finance_rate_12m` | decimal | `0.08` |
| `finance_rate_36m` | decimal | `0.034` |
| `finance_rate_60m` | decimal | `0.037` |

#### D. Dentally integration
| Key | Type | Example |
|-----|------|---------|
| `dentally_site_id` | string (UUID) | From Dentally |
| `therapist_ids` | comma-separated | `189342,189343` |
| `nhs_amounts` | comma-separated £ | `27.40,75.30,326.70` |
| `cosmetic_consultation_treatment_code` | string | Already on `Practice`; merge into settings UI |

#### E. Email (SMTP)
| Key | Type | Example |
|-----|------|---------|
| `smtp_host` | string | `smtp.gmail.com` |
| `smtp_port` | string | `587` |
| `smtp_user` | string | |
| `smtp_pass` | string | Encrypted at rest |
| `email_from` | string | `payslips@clinic.com` |

**Settings import format:** Single-row CSV with all keys as columns, **or** JSON file upload.  
**Export:** Full settings JSON + downloadable CSV template.

---

### 4.5 Lab bills (optional v1.1 — historical load)

| Column | Required | Example |
|--------|----------|---------|
| `lab_name` | Yes | `Acme Lab` |
| `dentist_name` | No | Match to dentist |
| `amount` | Yes | `125.50` | Pounds |
| `date` | No | `2026-01-15` |
| `description` | No | |
| `paid` | No | `0` or `1` |
| `paid_date` | No | `2026-02-01` |

**Link:** Resolve `lab_name` → `SavedLab`; create `LabBillEntry`.

---

### 4.6 Supplier invoices (optional v1.1)

| Column | Required | Example |
|--------|----------|---------|
| `supplier_name` | Yes | |
| `amount` | Yes | |
| `invoice_date` | No | |
| `description` | No | |
| `paid` | No | |

---

## 5. Import UX (all domains)

### 5.1 Entry points

1. **Setup hub** `/pay/setup` — cards per domain: Labs, Suppliers, Dentists, Settings, (optional) Historical bills
2. **Contextual** — “Import CSV” button on Bulk Payments, Dentists page, Settings (same component)

### 5.2 Import wizard (4 steps)

```
Step 1: Choose type + download template
Step 2: Upload file OR paste CSV/TSV
Step 3: Preview table — valid / warning / error rows
Step 4: Choose mode → Confirm → Results summary
```

### 5.3 Import modes

| Mode | Behaviour |
|------|-----------|
| **Create only** | Skip rows that match existing (by unique key) |
| **Upsert** (default) | Update existing, create new |
| **Replace** | Delete all existing for that type, then import (requires confirmation checkbox) |

### 5.4 Validation rules

- Required fields present
- Numeric ranges (splits 0–1, percents 0–100)
- Sort code / account number format
- Duplicate detection with row number in error report
- SMTP password never returned in export (export shows `***`)

### 5.5 Result summary (required)

```json
{
  "ok": true,
  "created": 12,
  "updated": 3,
  "skipped": 2,
  "errors": [
    { "row": 5, "field": "sort_code", "message": "Invalid sort code" }
  ],
  "warnings": [
    { "row": 8, "message": "No bank details — bulk payment will flag this" }
  ]
}
```

Show in UI like dentist log import summary (green stats + expandable error list).

---

## 6. API design

### 6.1 Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/pay/api/setup/export?type=labs\|suppliers\|dentists\|settings` | Download CSV |
| `GET` | `/pay/api/setup/templates/:type` | Download empty template CSV |
| `POST` | `/pay/api/setup/import/preview` | Parse + validate, no DB write |
| `POST` | `/pay/api/setup/import` | Commit import |
| `GET` | `/pay/api/settings` | Full settings object (Y3.5) |
| `PUT` | `/pay/api/settings` | Save all settings sections |
| `PATCH` | `/pay/api/settings` | Partial update (backward compat) |

### 6.2 Shared library

`apps/pay/lib/setup-import/`:

- `parse-csv.ts` — TSV/CSV auto-detect (reuse dentist-log patterns)
- `validate-labs.ts`, `validate-dentists.ts`, etc.
- `import-labs.ts` — transactional batch with mode
- `export-labs.ts`
- Unit tests per type (like `dentist-log-compare.test.ts`)

---

## 7. UI — Practice Setup page

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ Practice Setup                                          │
│ One-time import or manual edit of Pay master data       │
├─────────────────────────────────────────────────────────┤
│ [Labs] [Suppliers] [Dentists] [Settings] [History]      │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ 12 labs      │  │ Import CSV   │  │ Export CSV   │    │
│  │ 3 missing    │  │ Paste data   │  │ Download     │    │
│  │ bank details │  │ template     │  │ template     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                         │
│  [Table: existing records + inline edit + add row]      │
└─────────────────────────────────────────────────────────┘
```

### Settings tab (Y3.5)

- Same sections as legacy: Branding, Therapy, Calculation rates, Dentally, SMTP
- **One Save button** for whole page (legacy pattern)
- **Import settings** button → single-row CSV or JSON
- Therapy hourly ↔ per-minute auto-sync (legacy behaviour)

---

## 8. Migration from AuraPay

For go-live, admin should be able to:

1. Export from legacy SQLite (`saved_labs`, `saved_suppliers`, `dentists`, `settings`) — `migrate-elioay.ts` already maps most
2. Or use **Setup hub CSV import** with exported CSVs from legacy admin
3. One migration run per practice, not per record in UI

**Deliverable:** Document export SQL/queries in this file’s appendix (for Hish to run once).

---

## 9. Acceptance criteria

### Must have (v1)

- [ ] Import ≥20 labs from CSV in &lt;30 seconds with preview
- [ ] Upsert: re-import same file updates bank details, no duplicates
- [ ] Export → edit in Excel → re-import round-trip works
- [ ] Settings page has all legacy sections; values used by pay-engine / dentally-fetch
- [ ] `therapist_ids` and `nhs_amounts` comma lists work in calculations (not env-only)
- [ ] Permission gates enforced
- [ ] Unit tests: parse, validate, aggregate, settings normalize
- [ ] Type-check + existing 52+ tests still pass

### Should have

- [ ] Paste TSV (tab-separated from Excel)
- [ ] Import history log (last import timestamp + counts in audit)

### Nice to have (v1.1)

- [ ] Historical lab bills / supplier invoices import
- [ ] Logo upload on settings branding section

---

## 10. Implementation order (suggested)

| Step | Task | Roadmap |
|------|------|---------|
| 1 | `paySettingsJson` schema + GET/PUT settings API | Y3.5 |
| 2 | Settings UI — all sections, single save | Y3.5 |
| 3 | `setup-import` lib + labs/suppliers import/export | New |
| 4 | Setup hub page + wire Bulk Payments “Import” | New |
| 5 | Dentists import/export | New |
| 6 | Settings CSV import/export | Y3.5 |
| 7 | Historical bills import (optional) | Post-Y3.5 |

**Estimated:** Y3.5 + bulk import core ≈ 2–3 focused sessions (not one-field-at-a-time).

---

## 11. Appendix — CSV templates

### labs.csv
```csv
name,account_name,sort_code,account_number
Acme Dental Lab,Acme Lab Ltd,11-22-33,12345678
```

### dentists.csv
```csv
name,pay_type,private_split_percent,uda_rate,hourly_rate,nhs_performer_number,dentally_practitioner_id,email
Dr Sarah Jones,PERCENTAGE_SPLIT,50,25.00,,123456,189342,sarah@clinic.com
Jane Hygienist,HOURLY,,,35.00,,189343,
```

### settings.csv (single data row after header)
```csv
therapy_hourly_rate,therapy_rate,lab_bill_split,finance_fee_split,finance_rate_3m,finance_rate_12m,finance_rate_36m,finance_rate_60m,dentally_site_id,therapist_ids,nhs_amounts,smtp_host,smtp_port,smtp_user,email_from
35,0.5833,0.50,0.50,0.045,0.08,0.034,0.037,,189342;189343,27.40;75.30,smtp.gmail.com,587,,
```

---

## 12. What you need to provide (one time)

To bulk-import your practice without typing each row in chat or UI:

1. **Labs spreadsheet** — name + bank details (export from AuraPay or Excel)
2. **Suppliers spreadsheet** — same
3. **Dentists list** — name, pay type, split/UDA or hourly rate, Dentally practitioner IDs
4. **Settings snapshot** — from AuraPay Settings page (screenshot or export); especially therapist IDs, NHS amounts, therapy rate, Tabeo rates, SMTP
5. **Dentally site ID** — from Dentally or env

Once this spec is implemented, you upload those files once in **Practice Setup** and you’re done.
