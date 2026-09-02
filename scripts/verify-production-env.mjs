#!/usr/bin/env node
/**
 * Part 12 — production env readiness check (local deploy samples).
 * Run: node scripts/verify-production-env.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, "../../elio-deploy-env");

const REQUIRED = {
  "shell.env": [
    "DATABASE_URL",
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "DENTALLY_API_KEY",
    "CRON_SECRET",
    "ENCRYPTION_KEY",
    "PAY_APP_ORIGIN",
    "PLANS_APP_ORIGIN",
    "FLOW_APP_ORIGIN",
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
  ],
  "pay.env": ["DATABASE_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET", "DENTALLY_API_KEY", "DENTALLY_SITE_ID", "BLOB_READ_WRITE_TOKEN"],
  "plans.env": ["DATABASE_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET", "GOCARDLESS_ACCESS_TOKEN", "GOCARDLESS_WEBHOOK_SECRET", "CRON_SECRET"],
  "flow.env": ["DATABASE_URL", "NEXTAUTH_URL", "NEXTAUTH_SECRET", "DENTALLY_API_KEY"],
};

function parseEnvFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const vars = new Set();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars.add(trimmed.slice(0, eq).trim());
  }
  return vars;
}

function isUnset(filePath, key) {
  const text = fs.readFileSync(filePath, "utf8");
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const match = text.match(re);
  if (!match) return true;
  const value = match[1].trim().replace(/^["']|["']$/g, "");
  return value.length === 0;
}

let failed = false;

for (const [file, keys] of Object.entries(REQUIRED)) {
  const filePath = path.join(deployDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`MISSING FILE: ${file}`);
    failed = true;
    continue;
  }
  const present = parseEnvFile(filePath);
  console.log(`\n${file}`);
  for (const key of keys) {
    if (!present.has(key)) {
      console.error(`  ✗ missing key: ${key}`);
      failed = true;
    } else if (isUnset(filePath, key)) {
      console.error(`  ✗ empty value: ${key}`);
      failed = true;
    } else {
      console.log(`  ✓ ${key}`);
    }
  }
}

if (failed) {
  console.error("\nProduction env check FAILED — fix elio-deploy-env before go-live.");
  process.exit(1);
}

console.log("\nProduction env check passed (deploy samples).");
