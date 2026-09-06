import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const FORBIDDEN = /DentallyClient|getDentallyClient|api\.dentally\.co|fetchDentallyForPayPeriod/;

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTsx(full, out);
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("Step 3 — no Dentally from page render", () => {
  it("pay app pages/layouts never import Dentally client or live fetch", () => {
    const appRoot = join(__dirname, "..", "app");
    const files = walkTsx(appRoot).filter(
      (f) =>
        f.includes(`${join("app", "")}`) &&
        !f.includes(`${join("app", "api")}`) &&
        (f.endsWith("page.tsx") ||
          f.endsWith("layout.tsx") ||
          f.endsWith("loading.tsx") ||
          f.endsWith("error.tsx") ||
          f.endsWith("template.tsx"))
    );

    const violations: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (FORBIDDEN.test(src)) violations.push(file);
    }
    expect(violations).toEqual([]);
  });
});
