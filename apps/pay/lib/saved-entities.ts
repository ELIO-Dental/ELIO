import { scopedDb } from "@elio/db";
import { normalizeBankDetails } from "./saved-entity-bank";

export interface SavedEntityInput {
  name: string;
  accountName?: string | null;
  sortCode?: string | null;
  accountNumber?: string | null;
  account_name?: string | null;
  sort_code?: string | null;
  account_number?: string | null;
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("name is required");
  return trimmed;
}

export async function listSavedEntities(practiceId: string) {
  const db = scopedDb(practiceId);
  const [labs, suppliers] = await Promise.all([
    db.savedLab.findMany({ orderBy: { name: "asc" } }),
    db.savedSupplier.findMany({ orderBy: { name: "asc" } }),
  ]);
  return { labs, suppliers };
}

export async function createSavedEntity(
  practiceId: string,
  type: "lab" | "supplier",
  input: SavedEntityInput
) {
  const db = scopedDb(practiceId);
  const name = normalizeName(input.name);
  const bank = normalizeBankDetails(input);
  const data = { practiceId, name, ...bank };

  try {
    if (type === "lab") return { type, entity: await db.savedLab.create({ data }) };
    return { type, entity: await db.savedSupplier.create({ data }) };
  } catch {
    throw new Error("Name already exists");
  }
}

export async function updateSavedEntity(
  practiceId: string,
  type: "lab" | "supplier",
  id: string,
  input: SavedEntityInput
) {
  const db = scopedDb(practiceId);
  const name = normalizeName(input.name);
  const bank = normalizeBankDetails(input);
  const data = { name, ...bank };

  if (type === "lab") {
    const existing = await db.savedLab.findFirst({ where: { id, practiceId } });
    if (!existing) throw new Error("Saved lab not found");
    return { type, entity: await db.savedLab.update({ where: { id }, data }) };
  }

  const existing = await db.savedSupplier.findFirst({ where: { id, practiceId } });
  if (!existing) throw new Error("Saved supplier not found");
  return { type, entity: await db.savedSupplier.update({ where: { id }, data }) };
}

export async function deleteSavedEntity(practiceId: string, type: "lab" | "supplier", id: string) {
  const db = scopedDb(practiceId);
  if (type === "lab") {
    const existing = await db.savedLab.findFirst({ where: { id, practiceId } });
    if (!existing) throw new Error("Saved lab not found");
    await db.savedLab.delete({ where: { id } });
    return { ok: true };
  }

  const existing = await db.savedSupplier.findFirst({ where: { id, practiceId } });
  if (!existing) throw new Error("Saved supplier not found");
  await db.savedSupplier.delete({ where: { id } });
  return { ok: true };
}
