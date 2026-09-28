/**
 * Volta um usuário para o "primeiro acesso" (tela Crie seu acesso) sem mexer em dados do ERP.
 * Marca temporary_password = true e limpa nome/sobrenome/celular. A senha atual vira a "temporária".
 * Usa a service role de workers/millennium-sync/.env.
 *
 *   npx tsx scripts/reset-first-access.mjs email@exemplo.com
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const EMAIL = process.argv[2];
if (!EMAIL) {
  console.error("uso: npx tsx scripts/reset-first-access.mjs email@exemplo.com");
  process.exit(1);
}

function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return env;
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const env = { ...loadEnv(path.join(root, ".env")), ...loadEnv(path.join(root, "workers/millennium-sync/.env")) };
const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("FAIL: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await sb
  .from("identity")
  .update({ temporary_password: true, first_name: null, last_name: null, avatar_url: null })
  .ilike("email", EMAIL)
  .select("email, name, temporary_password, first_name, last_name, phone");
if (error || !data?.length) {
  console.error("identity:", error?.message ?? "not found");
  process.exit(1);
}
console.log(data);
