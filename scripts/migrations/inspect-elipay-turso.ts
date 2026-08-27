// READ-ONLY inspection of the old ElioPay ("aurapay") Turso database.
// Uses a read-only auth token (confirmed by the user when creating it in the
// Turso dashboard) — this script only ever runs SELECT statements against
// sqlite_master and row counts, never a write.
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

async function main() {
  const url = process.env.OLD_ELIOPAY_TURSO_URL;
  const authToken = process.env.OLD_ELIOPAY_TURSO_TOKEN;
  if (!url || !authToken) throw new Error("OLD_ELIOPAY_TURSO_URL / OLD_ELIOPAY_TURSO_TOKEN not set in .env.local");

  const client = createClient({ url, authToken });

  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  console.log("Tables found:", tables.rows.map((r) => r.name));

  for (const row of tables.rows) {
    const tableName = row.name as string;
    const countRes = await client.execute(`SELECT COUNT(*) as count FROM "${tableName}"`);
    const schemaRes = await client.execute(`PRAGMA table_info("${tableName}")`);
    const columns = schemaRes.rows.map((c) => `${c.name}:${c.type}`);
    console.log(`\n--- ${tableName} ---`);
    console.log("row count:", countRes.rows[0]?.count);
    console.log("columns:", columns.join(", "));
  }

  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
