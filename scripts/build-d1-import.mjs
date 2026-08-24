import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const exportPath = path.resolve(".migration/sites-data-export.b64");
const outputPath = path.resolve(".migration/sites-data-import.sql");
const allowedTables = new Set([
  "app_users", "body_models", "feedback", "garment_sources", "garments", "inspirations",
  "intake_items", "intake_jobs", "outfit_cards", "outfit_diaries", "outfit_plans", "outfits",
  "preference_profiles", "reminder_preferences", "shopping_assessments", "style_twin_sessions",
  "tryon_sessions", "usage_daily", "usage_events", "wear_events",
]);

function quoteIdentifier(value) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number in export");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

const encoded = (await readFile(exportPath, "utf8")).trim();
const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
if (payload.format !== "muse-closet-sites-d1-export-v1" || !payload.tables) {
  throw new Error("Unsupported or invalid Sites export");
}

const statements = ["PRAGMA foreign_keys = OFF;"];
let rowCount = 0;
for (const [table, rows] of Object.entries(payload.tables)) {
  if (!allowedTables.has(table)) throw new Error(`Unexpected table in export: ${table}`);
  for (const row of rows) {
    const columns = Object.keys(row);
    if (!columns.length) continue;
    statements.push(
      `INSERT OR REPLACE INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map((column) => sqlValue(row[column])).join(", ")});`,
    );
    rowCount += 1;
  }
}
statements.push("PRAGMA optimize;");
await writeFile(outputPath, `${statements.join("\n")}\n`, { mode: 0o600 });
console.log(`Prepared ${rowCount} rows for D1 import.`);
