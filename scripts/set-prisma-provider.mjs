/**
 * Sets the Prisma datasource `provider` based on DATABASE_URL so the same repo
 * runs on SQLite locally and PostgreSQL in production (e.g. Vercel) with no
 * manual schema edits.
 *
 *   file:./dev.db            -> sqlite
 *   postgres(ql)://...       -> postgresql
 *   mysql://...              -> mysql
 *
 * Runs before `prisma generate` / `prisma db push` (see package.json + vercel.json).
 * It is idempotent — writing the same provider is a no-op for git.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (no dependency): .env.local then .env, never overriding
// variables already present in the environment (so Vercel's env wins).
for (const file of [".env.local", ".env"]) {
  const p = path.join(root, file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || m[1].startsWith("#")) continue;
    if (process.env[m[1]] !== undefined) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

const url = process.env.DATABASE_URL ?? "";
const provider = /^postgres(ql)?:\/\//i.test(url)
  ? "postgresql"
  : /^mysql:\/\//i.test(url)
  ? "mysql"
  : "sqlite";

const schemaPath = path.join(root, "prisma", "schema.prisma");
const schema = readFileSync(schemaPath, "utf8");
const re = /(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"[^"]*"/s;

if (!re.test(schema)) {
  console.warn("[set-prisma-provider] Could not find datasource provider line.");
  process.exit(0);
}

const next = schema.replace(re, `$1"${provider}"`);
if (next !== schema) {
  writeFileSync(schemaPath, next);
  console.log(`[set-prisma-provider] provider -> "${provider}" (from DATABASE_URL).`);
} else {
  console.log(`[set-prisma-provider] provider already "${provider}".`);
}
