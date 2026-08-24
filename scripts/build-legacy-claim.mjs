import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const newUserId = process.argv[2];
if (!newUserId || !/^[0-9a-f-]{30,40}$/i.test(newUserId)) {
  throw new Error("Usage: node scripts/build-legacy-claim.mjs <supabase-user-uuid>");
}

const encoded = (await readFile(path.resolve(".migration/sites-data-export.b64"), "utf8")).trim();
const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
const legacyUserIds = [...new Set(Object.values(payload.tables).flatMap((rows) => rows.map((row) => row.user_id).filter(Boolean)))].filter((id) => id !== "demo-user");
if (legacyUserIds.length !== 1) throw new Error(`Expected one legacy account, found ${legacyUserIds.length}`);
const legacyUserId = legacyUserIds[0];
const userTables = Object.entries(payload.tables).filter(([, rows]) => rows.some((row) => Object.hasOwn(row, "user_id"))).map(([table]) => table);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const statements = ["PRAGMA foreign_keys = OFF;"];

for (const table of userTables) {
  if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error(`Unsafe table name: ${table}`);
  statements.push(`DELETE FROM "${table}" WHERE user_id = ${quote(newUserId)};`);
}
for (const table of userTables) {
  statements.push(`UPDATE "${table}" SET user_id = ${quote(newUserId)} WHERE user_id = ${quote(legacyUserId)};`);
}
statements.push("PRAGMA optimize;");
await writeFile(path.resolve(".migration/claim-legacy-user.sql"), `${statements.join("\n")}\n`, { mode: 0o600 });
console.log(`Prepared legacy data claim across ${userTables.length} tables.`);
