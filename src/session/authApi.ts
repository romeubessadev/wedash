import { getSupabase } from "@/lib/supabase";
import { validarSenha } from "@/lib/password";
import { prepararAvatar } from "@/lib/avatar";
import { companyNameCase, titleName } from "@/lib/format";
import { stores } from "@/data/wedash/stores";
import { userByEmail, type User } from "@/data/wedash/team";
import { sessionFromUser, type Session } from "@/session/session";
import { paths } from "@/router/paths";

export const MENSAGEM_LOGIN = "E-mail ou senha incorretos.";
export const MENSAGEM_SENHA_GENERICA = "Não foi possível salvar sua senha. Tente novamente.";
export const MENSAGEM_OTP_INVALIDO = "Código inválido ou expirado. Solicite um novo código.";
export const MENSAGEM_OTP_GENERICA = "Não foi possível verificar o código. Tente novamente.";
/** Tamanho do OTP de recovery — alinhar com Auth → Providers → Email → OTP length. */
export const RECOVERY_OTP_LENGTH = 6;
/** Aceita letra+número (A–Z / 0–9). Se o Dashboard só gerar dígitos, continua válido. */
export const RECOVERY_OTP_PATTERN = new RegExp(`^[A-Z0-9]{${RECOVERY_OTP_LENGTH}}$`);

export function normalizeRecoveryOtp(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, RECOVERY_OTP_LENGTH);
}

/** Traduz erros do Supabase Auth (inglês) para copy PT da tela Nova senha. */
export function mensagemErroSenhaAuth(error: { code?: string; message?: string } | null): string {
  if (!error) return MENSAGEM_SENHA_GENERICA;
  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();

  if (code === "same_password" || msg.includes("different from the old password") || msg.includes("same password")) {
    return "A nova senha precisa ser diferente da senha atual.";
  }
  if (code === "weak_password" || msg.includes("weak password") || msg.includes("password should be")) {
    return "Essa senha é fraca demais. Use pelo menos 8 caracteres e 1 caractere especial.";
  }
  if (code === "session_not_found" || (msg.includes("session") && msg.includes("not found"))) {
    return MENSAGEM_OTP_INVALIDO;
  }
  if (msg.includes("rate limit") || code.includes("over_request")) {
    return MENSAGEM_SENHA_GENERICA;
  }
  // Nunca exibir inglês cru na UI.
  return MENSAGEM_SENHA_GENERICA;
}

/** Traduz erros do Auth na etapa de OTP (recovery). */
export function mensagemErroOtpAuth(error: { code?: string; message?: string } | null): string {
  if (!error) return MENSAGEM_OTP_GENERICA;
  const code = (error.code ?? "").toLowerCase();
  const msg = (error.message ?? "").toLowerCase();

  if (
    code === "otp_expired" ||
    code === "otp_disabled" ||
    msg.includes("token has expired") ||
    msg.includes("otp") ||
    msg.includes("invalid") ||
    code === "session_not_found" ||
    (msg.includes("session") && msg.includes("not found"))
  ) {
    return MENSAGEM_OTP_INVALIDO;
  }
  return MENSAGEM_OTP_GENERICA;
}

/** sessionStorage: fluxo de recuperação ativo (não hidratar app Session). */
export const CHAVE_RECOVERY = "wedash-password-recovery";
/** E-mail para o qual o OTP de recovery foi pedido. */
export const CHAVE_RECOVERY_EMAIL = "wedash-recovery-email";

export type AuthResult =
  | { ok: true; session: Session }
  | { ok: false; error: string };

function emailOk(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function marcarRecovery(): void {
  try {
    sessionStorage.setItem(CHAVE_RECOVERY, "1");
  } catch {
    /* ignore */
  }
}

export function limparRecovery(): void {
  try {
    sessionStorage.removeItem(CHAVE_RECOVERY);
    sessionStorage.removeItem(CHAVE_RECOVERY_EMAIL);
  } catch {
    /* ignore */
  }
}

export function emRecovery(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_RECOVERY) === "1";
  } catch {
    return false;
  }
}

export function saveRecoveryEmail(email: string): void {
  try {
    sessionStorage.setItem(CHAVE_RECOVERY_EMAIL, email.trim().toLowerCase());
  } catch {
    /* ignore */
  }
}

export function readRecoveryEmail(): string | null {
  try {
    return sessionStorage.getItem(CHAVE_RECOVERY_EMAIL);
  } catch {
    return null;
  }
}

/** @deprecated callback de link — OTP não depende disso; mantido por compat. */
export function urlRedefinirSenha(): string {
  return `${window.location.origin}${paths.access.reset}`;
}

/** Login: Supabase Auth se configurado; senão mock por e-mail (demo). */
export async function loginWithEmail(email: string, senha: string): Promise<AuthResult> {
  const e = email.trim().toLowerCase();
  if (!emailOk(e) || !senha) return { ok: false, error: MENSAGEM_LOGIN };

  const sb = getSupabase();
  if (!sb) {
    await delay(400);
    const u = userByEmail(e);
    if (!u) return { ok: false, error: MENSAGEM_LOGIN };
    return { ok: true, session: sessionFromUser(u) };
  }

  limparRecovery();
  const { data, error } = await sb.auth.signInWithPassword({ email: e, password: senha });
  if (error || !data.user) return { ok: false, error: MENSAGEM_LOGIN };

  const session = await hydrateSessionFromAuth(data.user.id, e);
  if (!session) {
    await sb.auth.signOut();
    return { ok: false, error: MENSAGEM_LOGIN };
  }
  return { ok: true, session };
}

export async function logoutAuth(): Promise<void> {
  limparRecovery();
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}

/**
 * Pedido de recuperação por OTP (código no e-mail).
 * Sempre resolve OK na UI (anti-enumeration).
 * Demo sem Supabase: grava e-mail + flag para aceitar qualquer código de 6 dígitos.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  const sb = getSupabase();
  if (!sb) {
    await delay(600);
    if (emailOk(e)) {
      saveRecoveryEmail(e);
      marcarRecovery();
    }
    return;
  }
  if (!emailOk(e)) {
    await delay(600);
    return;
  }
  saveRecoveryEmail(e);
  marcarRecovery();
  // Dispara e-mail de recovery. O template no Dashboard deve mostrar {{ .Token }} (OTP).
  await sb.auth.resetPasswordForEmail(e);
}

/**
 * Valida o OTP de recovery (abre sessão Auth; app Session continua bloqueada por emRecovery).
 */
export async function verifyRecoveryOtp(
  email: string,
  otp: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase();
  const code = normalizeRecoveryOtp(otp);
  if (!emailOk(e) || !RECOVERY_OTP_PATTERN.test(code)) {
    return { ok: false, error: MENSAGEM_OTP_INVALIDO };
  }

  const sb = getSupabase();
  if (!sb) {
    await delay(400);
    if (!emRecovery()) return { ok: false, error: MENSAGEM_OTP_INVALIDO };
    return { ok: true };
  }

  marcarRecovery();
  const { error } = await sb.auth.verifyOtp({
    email: e,
    token: code,
    type: "recovery",
  });
  if (error) return { ok: false, error: mensagemErroOtpAuth(error) };
  return { ok: true };
}

/**
 * @deprecated preferir verifyRecoveryOtp + updatePassword (telas separadas).
 * Mantido por compat — valida OTP e define senha numa chamada.
 */
export async function resetPasswordWithOtp(
  email: string,
  otp: string,
  novaSenha: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const verified = await verifyRecoveryOtp(email, otp);
  if (!verified.ok) return verified;
  const updated = await updatePassword(novaSenha);
  if (!updated.ok) return { ok: false, error: updated.error ?? MENSAGEM_SENHA_GENERICA };
  return { ok: true };
}

/**
 * Há sessão Auth válida para redefinir senha sem OTP?
 * (compat: link antigo do e-mail ainda pode abrir sessão de recovery)
 */
export async function canResetPassword(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return emRecovery();
  const { data } = await sb.auth.getSession();
  if (data.session) return true;
  return emRecovery();
}

/** Redefine senha quando já existe sessão de recovery (OTP ou link legado). */
export async function updatePassword(novaSenha: string): Promise<{ ok: boolean; error?: string }> {
  const check = validarSenha(novaSenha);
  if (!check.ok) return { ok: false, error: check.erro };
  const sb = getSupabase();
  if (!sb) {
    await delay(500);
    limparRecovery();
    return { ok: true };
  }
  const { error } = await sb.auth.updateUser({ password: novaSenha });
  if (error) return { ok: false, error: mensagemErroSenhaAuth(error) };

  // Recovery define senha definitiva — limpa a flag de provisória antes do signOut.
  const { data: userData } = await sb.auth.getUser();
  const uid = userData.user?.id;
  if (uid) {
    const { error: flagErr } = await sb
      .from("identity")
      .update({ temporary_password: false })
      .eq("auth_user_id", uid);
    if (flagErr) console.warn("updatePassword temporary_password:", flagErr.message);
  }

  limparRecovery();
  await sb.auth.signOut();
  return { ok: true };
}

/** Restaura Session a partir da session Supabase (reload). Ignora se em recovery. */
export async function sessionFromPersistedAuth(): Promise<Session | null> {
  if (emRecovery()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user?.email) return null;
  return hydrateSessionFromAuth(user.id, user.email);
}

async function hydrateSessionFromAuth(authUserId: string, email: string): Promise<Session | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: ident } = await sb
    .from("identity")
    .select("id, name, email, cpf, avatar_url, status, temporary_password")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (!ident || ident.status !== "ACTIVE") return null;

  const { data: memb } = await sb
    .from("membership")
    .select("id, role, is_owner, onboarding_step, status, tenant_id")
    .eq("identity_id", ident.id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!memb) {
    const u = userByEmail(email);
    return u ? sessionFromUser(u) : null;
  }

  const { data: ten } = await sb
    .from("tenant")
    .select("name")
    .eq("id", memb.tenant_id)
    .maybeSingle();

  const { data: storeRows } = await sb.from("membership_store").select("store_id").eq("membership_id", memb.id);
  let storeIds = (storeRows ?? []).map((r) => r.store_id as string);
  // Sem lojas vinculadas = todas as lojas da empresa (Gestor/Gerente convidado com "Todas as lojas").
  if (storeIds.length === 0 && memb.role !== "SELLER") {
    const { data: tenantStores } = await sb
      .from("store")
      .select("id")
      .eq("tenant_id", memb.tenant_id)
      .eq("active", true);
    storeIds = (tenantStores ?? []).map((r) => r.id as string);
    if (storeIds.length === 0) storeIds = stores.map((f) => f.id);
  }

  return {
    membershipId: memb.id,
    name: titleName(ident.name),
    cpf: ident.cpf ?? "",
    email: ident.email,
    avatarUrl: ident.avatar_url ?? null,
    role: memb.role as Session["role"],
    isOwner: memb.is_owner,
    stores: storeIds,
    collaboratorId: null,
    onboardingStep: memb.onboarding_step,
    temporaryPassword: Boolean(ident.temporary_password),
    tenantId: memb.tenant_id,
    companyName: companyNameCase(ten?.name ?? ""),
    appInstalled: false,
  };
}

/**
 * Sobe a foto de perfil (já reduzida) para `avatars/{auth.uid}/…` e devolve a URL pública.
 * Nome único por envio: evita cache antigo do navegador/CDN ao trocar de foto.
 */
export async function uploadAvatar(photo: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: true, url: URL.createObjectURL(photo) };
  const { data: userData } = await sb.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { ok: false, error: "Sua sessão expirou. Entre de novo." };
  let blob: Blob;
  try {
    blob = await prepararAvatar(photo);
  } catch {
    return { ok: false, error: "Não foi possível ler essa imagem. Tente outra foto." };
  }
  const path = `${uid}/${Date.now()}.jpg`;
  const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
  if (error) {
    console.warn("uploadAvatar:", error.message);
    return { ok: false, error: "Não foi possível enviar a foto. Tente novamente ou continue sem foto." };
  }
  return { ok: true, url: sb.storage.from("avatars").getPublicUrl(path).data.publicUrl };
}

/**
 * Primeiro acesso: troca a senha temporária no Auth e desliga a flag na identity.
 * Sessão permanece (diferente do recovery, que faz signOut).
 */
export async function createPassword(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const check = validarSenha(password);
  if (!check.ok) return { ok: false, error: check.erro };

  const sb = getSupabase();
  if (!sb) {
    await delay(400);
    return { ok: true };
  }

  const { data: userData } = await sb.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { ok: false, error: "Sua sessão expirou. Entre de novo com a senha temporária." };

  const { error } = await sb.auth.updateUser({ password });
  if (error) return { ok: false, error: mensagemErroSenhaAuth(error) };

  await sb.from("identity").update({ temporary_password: false }).eq("auth_user_id", uid);
  return { ok: true };
}

/** Destino após login / troca de senha / raiz. */
export function destinationAfterAuth(s: Session, de?: string | null): string {
  if (s.temporaryPassword) return paths.access.createPassword;
  if (s.onboardingStep !== null) return paths.onboarding;
  // Pós-onboarding: não manda pro Dash enquanto a carga inicial não terminou.
  try {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("wedash.awaitingInitialSync") === "1") {
      return paths.syncing;
    }
  } catch {
    /* ignore */
  }
  if (de && de !== "/" && !de.startsWith(paths.access.login)) return de;
  if (s.role === "SELLER") return paths.seller.myGoal;
  return paths.overview;
}

/** Persiste progresso/conclusão do onboarding no membership (null = concluído). */
export async function saveOnboardingStep(membershipId: string, step: number | null): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("membership").update({ onboarding_step: step }).eq("id", membershipId);
  if (error) console.warn("saveOnboardingStep:", error.message);
}

/** Substitui o escopo de lojas do membership (ids do catálogo local, ex.: f1 / erp-8). */
export async function saveMembershipStores(membershipId: string, storeIds: string[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error: delErr } = await sb.from("membership_store").delete().eq("membership_id", membershipId);
  if (delErr) {
    console.warn("saveMembershipStores delete:", delErr.message);
    return;
  }
  if (storeIds.length === 0) return;
  const rows = storeIds.map((store_id) => ({ membership_id: membershipId, store_id }));
  const { error } = await sb.from("membership_store").insert(rows);
  if (error) console.warn("saveMembershipStores insert:", error.message);
}

export type PersistErpInput = {
  tenantId: string;
  membershipId: string;
  username: string;
  password: string;
  dedicated: boolean;
  /** Sessão Millennium já aberta no Step2 — grava p/ o worker reusar. */
  millenniumSession?: string;
  /** Troca de usuário mantendo dados: remove só as lojas que o usuário novo não enxerga. */
  userChange?: { mode: "keep"; removeMillenniumStoreIds: number[] };
  /** Vazio no Step2 (só credencial); preenchido ao concluir lojas. */
  stores?: Array<{
    storeId: number;
    code?: string;
    name?: string;
    tradeName?: string;
    taxId?: string;
    openedAt?: string;
    hasWpink?: boolean;
  }>;
};

export type PersistErpResult =
  | { ok: true; storeIds: string[]; lightIntervalMin: number }
  | { ok: false; error: string };

/**
 * Persiste erp_credential (senha cifrada no Edge) + store rows e remapeia membership_store.
 * light_interval_min = 5 (mesmo ritmo do botão Atualizar / FORCE).
 */
export async function persistErpCredentialAndStores(
  input: PersistErpInput,
): Promise<PersistErpResult> {
  const sb = getSupabase();
  if (!sb) {
    const storeIds = (input.stores ?? []).map((s) => `erp-${s.storeId}`);
    return {
      ok: true,
      storeIds,
      lightIntervalMin: 5,
    };
  }

  const { data, error } = await sb.functions.invoke("erp-credential-persist", {
    body: {
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      username: input.username,
      password: input.password,
      dedicated: input.dedicated,
      stores: input.stores ?? [],
      ...(input.millenniumSession
        ? { millenniumSession: input.millenniumSession }
        : {}),
      ...(input.userChange ? { userChange: input.userChange } : {}),
    },
  });

  if (error) {
    console.warn("erp-credential-persist:", error.message);
    return { ok: false, error: error.message };
  }

  const body = data as {
    ok?: boolean;
    storeIds?: string[];
    lightIntervalMin?: number;
    error?: string;
  } | null;

  if (!body?.ok || !Array.isArray(body.storeIds)) {
    return { ok: false, error: body?.error ?? "persist_failed" };
  }

  return {
    ok: true,
    storeIds: body.storeIds,
    lightIntervalMin: body.lightIntervalMin ?? 5,
  };
}

/** Marca o usuário logado como ativo (coluna Último acesso em Configurações > Usuários). */
export async function touchLastSeen(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.rpc("touch_last_seen");
  if (error) console.warn("touch_last_seen:", error.message);
}

/** Para seed/manual: monta Session a partir de User fixture. */
export function mockSessionFromUser(u: User): Session {
  return sessionFromUser(u);
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
