import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  console.log("FAIL: .env ausente");
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const url = (env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const key = env.VITE_SUPABASE_ANON_KEY || "";
const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url);
const keyOk = key.startsWith("sb_publishable_") || key.startsWith("eyJ");

console.log("URL format:", urlOk ? "ok" : "BAD");
console.log("KEY format:", keyOk ? "ok" : "BAD", "| prefix:", key.slice(0, 16) + "…");
if (!urlOk || !keyOk) process.exit(1);

const health = await fetch(`${url}/auth/v1/health`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
console.log("Auth health:", health.status, health.ok ? "ok" : "FAIL");
console.log("Auth body:", (await health.text()).slice(0, 100));

const sb = createClient(url, key);
const { data, error } = await sb.from("tenant").select("id").limit(1);
if (error?.code === "42501") {
  console.log("tenant query: ok (sem acesso anônimo, esperado)");
} else if (error) {
  console.log("tenant query:", error.code || "", error.message);
  if (/schema cache|does not exist|PGRST/i.test(error.message + (error.code || ""))) {
    console.log("HINT: rode supabase/migrations/20260919120000_auth_core.sql no SQL Editor");
  }
} else {
  console.log("tenant query: ok | rows:", (data || []).length);
}

const { error: sErr } = await sb.auth.getSession();
console.log("getSession:", sErr ? sErr.message : "ok");
