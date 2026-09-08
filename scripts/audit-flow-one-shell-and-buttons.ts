/**
 * Static audit: Flow stays one-shell + dashboard actions are wired.
 * Run: npx tsx scripts/audit-flow-one-shell-and-buttons.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const fails: string[] = [];
const ok: string[] = [];

function read(rel: string) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) {
    fails.push(`missing file: ${rel}`);
    return "";
  }
  return readFileSync(p, "utf8");
}

function assert(cond: boolean, pass: string, fail: string) {
  if (cond) ok.push(pass);
  else fails.push(fail);
}

const nextConfig = read("apps/flow/next.config.ts");
assert(nextConfig.includes('basePath: "/flow"'), "Flow basePath=/flow", "Flow missing basePath /flow");

const vercel = read("apps/shell/vercel.json");
assert(
  vercel.includes('"/flow/:path*"') && vercel.includes("flow.elioportal.co.uk/flow"),
  "Shell rewrites /flow/* to Flow zone",
  "Shell vercel.json missing /flow rewrite"
);

const moduleLayout = read("packages/ui/components/module-app-layout.tsx");
assert(
  moduleLayout.includes('href="/launcher"') && moduleLayout.includes("back-to-portal"),
  "Module chrome links ELIO Portal → /launcher (shell)",
  "Portal back link not /launcher"
);

const dash = read("apps/flow/app/dashboard/dashboard-client.tsx");
assert(dash.includes('href="/settings/integrations"'), "Portal Integrations → /settings/integrations", "Integrations link wrong");
assert(!/fetch\(["'`](?!\/flow\/)/.test(dash.replace(/fetch\(\s*`\/flow\//g, "fetch(`/flow/").replace(/fetch\(\s*"\/flow\//g, 'fetch("/flow/').replace(/fetch\(\s*'\/flow\//g, "fetch('/flow/")), "Dashboard fetches use /flow prefix", "Dashboard has unprefixed fetch()");

// Simpler fetch check
const fetchUrls = [...dash.matchAll(/fetch\(\s*[`'"]([^`'"]+)/g)].map((m) => m[1]!);
for (const u of fetchUrls) {
  if (u.startsWith("/api/") || (u.startsWith("/") && !u.startsWith("/flow/"))) {
    fails.push(`unprefixed fetch: ${u}`);
  } else if (u.startsWith("/flow/")) {
    ok.push(`fetch ${u.split("?")[0]}`);
  }
}

assert(dash.includes('data-testid="flow-refresh"') && dash.includes("loadDashboard()"), "Refresh button wired", "Refresh missing");
assert(dash.includes('data-testid="flow-sync-dentally"') && dash.includes("importFromDentally"), "Sync Dentally wired", "Sync Dentally missing");
assert(dash.includes('data-testid="flow-export-csv"') && dash.includes("exportRowsCsv"), "Export CSV wired", "Export CSV missing");
assert(dash.includes('setView("table")') && dash.includes('setView("charts")'), "Table/Charts toggle wired", "View toggle missing");
assert(dash.includes("setStatusFilter") && dash.includes("STATUS_FILTERS"), "Status filters wired", "Status filters missing");
assert(dash.includes("setDetailRow") && dash.includes("setEditRow"), "Details/Edit actions wired", "Row actions missing");
assert(dash.includes('useState("3m")'), "Default period Last 3 months", "Default period not 3m");

const nav = read("packages/ui/lib/module-nav-items.ts");
assert(
  nav.includes("FLOW_MODULE_NAV") && nav.includes('href: "/dashboard"') && nav.includes('href: "/settings"'),
  "Flow nav = Dashboard + Settings only",
  "Flow nav incorrect"
);
assert(!nav.includes('FLOW_MODULE_NAV') || !/FLOW_MODULE_NAV[\s\S]*href: "\/team"/.test(nav), "No Team tab in Flow (Portal owns Team)", "Flow still has Team tab");

const brand = read("packages/ui/components/sidebar-brand.tsx");
assert(brand.includes("h-[4.5rem]") || brand.includes("h-[5rem]"), "Sidebar brand lg size increased", "Logo size not increased");

const sidebar = read("packages/ui/components/sidebar.tsx");
assert(sidebar.includes("h-28"), "Sidebar header taller for logo", "Sidebar header not h-28");

console.log(JSON.stringify({ ok: ok.length, fails: fails.length, passed: ok, failed: fails }, null, 2));
process.exit(fails.length ? 1 : 0);
