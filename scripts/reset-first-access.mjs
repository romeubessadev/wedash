/**
 * Volta um usuário para o "primeiro acesso" (tela Crie seu acesso) sem mexer em dados do ERP.
 * Marca temporary_password = true; a senha atual vira a "temporária".
 * Com --onboarding (só dono): reabre o onboarding na etapa Integração ERP (onboarding_step = 2).
 * Reconectar com o mesmo usuário Millennium não apaga dados; outro usuário apaga os dados de venda do tenant.
 * Usa a service role de workers/millennium-sync/.env.
 *
 *   node scripts/reset-first-access.mjs email@exemplo.com [--onboarding]
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const EMAIL = process.argv[2];
const REOPEN_ONBOARDING = process.argv.includes("--onboarding");
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
  .update({ temporary_password: true })
  .ilike("email", EMAIL)
  .select("id, email, name, temporary_password");
if (error || !data?.length) {
  console.error("identity:", error?.message ?? "not found");
  process.exit(1);
}
console.log(data);

const membQuery = sb.from("membership");
const { data: memb } = REOPEN_ONBOARDING
  ? await membQuery
      .update({ onboarding_step: 2 })
      .eq("identity_id", data[0].id)
      .eq("is_owner", true)
      .select("role, status, is_owner, onboarding_step")
  : await membQuery.select("role, status, is_owner, onboarding_step").eq("identity_id", data[0].id);
console.log("membership:", memb);
