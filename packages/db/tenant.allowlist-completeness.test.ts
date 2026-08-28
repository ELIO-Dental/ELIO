// Systemic guard against the exact bug class found live (2026-08-28,
// independent Phase 1 audit): 13 models with a real practiceId column were
// missing from tenant.ts's TENANT_SCOPED_MODELS allowlist, so every
// scopedDb() call against them silently ran completely unscoped — no
// practiceId filter injected at all, a real cross-tenant read/write path.
//
// TENANT_SCOPED_MODELS is deliberately an explicit allowlist (see its own
// header comment) specifically so a forgotten model "fails LOUD... instead
// of silently shipping unscoped" — but that only holds if something actually
// checks it. This test IS that check: it parses schema.prisma directly (no
// Prisma internals dependency) to find every model with a practiceId scalar
// field, and asserts the allowlist matches exactly, so this class of bug
// can never again ship silently for a NEW model either.
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { TENANT_SCOPED_MODELS } from "./tenant";

// Models with a real practiceId column that are deliberately NOT in the
// allowlist, with the reason why — kept in sync with tenant.ts's own inline
// comment for "payLine" so there is exactly one place this exception is
// explained, not two that can drift apart.
const DELIBERATE_EXCEPTIONS = new Set([
  "payLine", // scoped transitively via compassStatementId -> CompassStatement.practiceId
]);

function findModelsWithPracticeId(schema: string): Set<string> {
  const models = new Set<string>();
  // Matches "model Foo {" ... up to the matching closing "}" at column 0,
  // which is how prisma-format always renders top-level model blocks.
  const modelBlockRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;
  while ((match = modelBlockRe.exec(schema))) {
    const [, name, body] = match;
    if (/^\s*practiceId\s+String/m.test(body!)) {
      models.add(name![0]!.toLowerCase() + name!.slice(1));
    }
  }
  return models;
}

describe("TENANT_SCOPED_MODELS allowlist completeness", () => {
  it("contains every model with a real practiceId column (minus documented exceptions)", () => {
    const schemaPath = join(__dirname, "prisma", "schema.prisma");
    const schema = readFileSync(schemaPath, "utf-8");
    const modelsWithPracticeId = findModelsWithPracticeId(schema);

    const missing = [...modelsWithPracticeId].filter(
      (m) => !TENANT_SCOPED_MODELS.has(m) && !DELIBERATE_EXCEPTIONS.has(m),
    );

    expect(missing, `These models have a practiceId column but are missing from TENANT_SCOPED_MODELS in tenant.ts — every scopedDb() call against them currently runs UNSCOPED: ${missing.join(", ")}`).toEqual([]);
  });

  it("has no stale entries for models that no longer exist in the schema", () => {
    const schemaPath = join(__dirname, "prisma", "schema.prisma");
    const schema = readFileSync(schemaPath, "utf-8");
    const modelBlockRe = /^model\s+(\w+)\s*\{/gm;
    const allModelNames = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = modelBlockRe.exec(schema))) {
      const name = match[1]!;
      allModelNames.add(name[0]!.toLowerCase() + name.slice(1));
    }

    const stale = [...TENANT_SCOPED_MODELS].filter((m) => !allModelNames.has(m));
    expect(stale, `These entries in TENANT_SCOPED_MODELS don't match any model in schema.prisma — likely a rename left behind: ${stale.join(", ")}`).toEqual([]);
  });
});
