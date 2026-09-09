/**
 * Probe Dentally list endpoints (read-only) to confirm pagination + appointment filters.
 * Usage: DENTALLY_API_KEY=... npx tsx scripts/probe-dentally-lists.ts
 */
const KEY = process.env.DENTALLY_API_KEY?.trim();
if (!KEY) {
  console.error("DENTALLY_API_KEY required");
  process.exit(1);
}

const SITE = process.env.DENTALLY_SITE_ID?.trim();

async function get(path: string, params: Record<string, string | number>) {
  const url = new URL(`https://api.dentally.co/v1${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${KEY}`,
      Accept: "application/json",
      "User-Agent": "ELIO/probe",
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

function summarize(label: string, status: number, json: any, listKey: string) {
  const items = json?.[listKey] ?? [];
  const meta = json?.meta ?? {};
  console.log(
    JSON.stringify({
      label,
      status,
      count: Array.isArray(items) ? items.length : null,
      meta,
      sampleKeys: Array.isArray(items) && items[0] ? Object.keys(items[0]).slice(0, 12) : [],
    })
  );
}

async function main() {
  const patients100 = await get("/patients", { page: 1, per_page: 100 });
  summarize("patients per_page=100", patients100.status, patients100.json, "patients");

  const patients25 = await get("/patients", { page: 1, per_page: 25 });
  summarize("patients per_page=25", patients25.status, patients25.json, "patients");

  const apptBare = await get("/appointments", { page: 1, per_page: 100 });
  summarize("appointments bare", apptBare.status, apptBare.json, "appointments");

  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 12);
  const after = start.toISOString().slice(0, 10);
  const before = end.toISOString().slice(0, 10);

  const apptDated = await get("/appointments", { page: 1, per_page: 100, after, before });
  summarize(`appointments after=${after} before=${before}`, apptDated.status, apptDated.json, "appointments");

  const future = new Date();
  future.setMonth(future.getMonth() + 6);
  const apptFuture = await get("/appointments", {
    page: 1,
    per_page: 100,
    after: before,
    before: future.toISOString().slice(0, 10),
  });
  summarize("appointments next 6 months", apptFuture.status, apptFuture.json, "appointments");

  if (SITE) {
    const apptSite = await get("/appointments", { page: 1, per_page: 100, after, before, site_id: SITE });
    summarize("appointments dated+site", apptSite.status, apptSite.json, "appointments");
  }

  const payments = await get("/payments", { page: 1, per_page: 100 });
  summarize("payments per_page=100", payments.status, payments.json, "payments");

  const accounts = await get("/accounts", { page: 1, per_page: 100 });
  summarize("accounts per_page=100", accounts.status, accounts.json, "accounts");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
