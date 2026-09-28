import { getSupabase } from "@/lib/supabase";
import { stores as demoStores } from "@/data/wedash/stores";
import { companyNameCase, titleName } from "@/lib/format";

/** Papéis de quem acessa o sistema (fora a equipe de vendas). */
export type SystemRole = "OWNER" | "MANAGER";
export type SystemUserStatus = "PENDING" | "ACTIVE" | "SUSPENDED";

export interface SystemUser {
  membershipId: string;
  /** Vazio enquanto o convite não foi aceito (o nome vem do "Crie seu acesso"). */
  name: string;
  email: string;
  role: SystemRole;
  status: SystemUserStatus;
  /** Gestor principal (criou a conta) — não pode ser editado nem suspenso. */
  isOwner: boolean;
  isSelf: boolean;
  /** Vazio = todas as lojas (inclui lojas novas). */
  storeIds: string[];
  invitedAt: string | null;
  lastSignInAt: string | null;
  acceptedAt: string | null;
}

export interface SystemUserStore {
  id: string;
  code: string;
  name: string;
}

export interface SystemUsersData {
  members: SystemUser[];
  stores: SystemUserStore[];
}

export interface InviteInput {
  email: string;
  role: SystemRole;
  /** Vazio = todas as lojas (inclusive as que abrirem depois). */
  storeIds: string[];
}

export type ActionResult = { ok: true } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  invalid_email: "Informe um e-mail válido.",
  invalid_role: "Escolha o papel.",
  invalid_stores: "Escolha ao menos uma loja.",
  already_invited: "Essa pessoa já tem um convite pendente. Use Reenviar na aba Convites.",
  already_member: "Essa pessoa já tem acesso.",
  email_in_use: "Esse e-mail já é usado em outra empresa no WeDash.",
  rate_limited: "Muitos e-mails em pouco tempo. Aguarde um minuto e tente de novo.",
  email_failed: "Não foi possível enviar o e-mail do convite. Tente novamente.",
  invite_failed: "Não foi possível criar o convite. Se o e-mail chegou, ignore-o e envie o convite de novo.",
  update_failed: "Não foi possível salvar a alteração. Tente novamente.",
  revoke_failed: "Não foi possível cancelar o convite. Tente novamente.",
  protected_member: "O gestor principal e o seu próprio acesso não podem ser alterados aqui.",
  not_pending: "Esse convite já foi aceito ou cancelado.",
  forbidden: "Só o gestor pode gerenciar usuários.",
};

function messageFor(code: string | undefined): string {
  return (code && MESSAGES[code]) || "Não foi possível concluir. Tente novamente.";
}

async function invoke<T>(body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: "Supabase não configurado." };
  const { data, error } = await sb.functions.invoke("team-members", {
    body: { ...body, origin: window.location.origin },
  });
  if (error) {
    let code: string | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      code = ctx ? ((await ctx.json()) as { error?: string }).error : undefined;
    } catch {
      /* ignore */
    }
    return { ok: false, message: messageFor(code) };
  }
  const res = data as { ok?: boolean; error?: string } & T;
  if (!res?.ok) return { ok: false, message: messageFor(res?.error) };
  return { ok: true, data: res };
}

/* ---------- Demo (sem Supabase) ---------- */

let demo: SystemUser[] | null = null;

function demoMembers(): SystemUser[] {
  if (!demo) {
    const now = new Date().toISOString();
    demo = [
      { membershipId: "d-owner", name: "Você", email: "gestor@wedash.app", role: "OWNER", status: "ACTIVE", isOwner: true, isSelf: true, storeIds: [], invitedAt: now, lastSignInAt: now, acceptedAt: now },
      { membershipId: "d-mgr", name: "Marcos Lima", email: "marcos@exemplo.com", role: "MANAGER", status: "ACTIVE", isOwner: false, isSelf: false, storeIds: [demoStores[0]?.id ?? "f1"], invitedAt: now, lastSignInAt: now, acceptedAt: now },
      { membershipId: "d-inv", name: "", email: "paula@exemplo.com", role: "MANAGER", status: "PENDING", isOwner: false, isSelf: false, storeIds: [demoStores[1]?.id ?? "f2"], invitedAt: now, lastSignInAt: null, acceptedAt: null },
    ];
  }
  return demo;
}

function demoPatch(id: string, patch: Partial<SystemUser> | null): ActionResult {
  const list = demoMembers();
  demo = patch === null ? list.filter((m) => m.membershipId !== id) : list.map((m) => (m.membershipId === id ? { ...m, ...patch } : m));
  return { ok: true };
}

/* ---------- API ---------- */

export async function fetchSystemUsers(): Promise<{ ok: true; data: SystemUsersData } | { ok: false; message: string }> {
  if (!getSupabase()) {
    return {
      ok: true,
      data: {
        members: demoMembers().map((m) => ({ ...m, name: titleName(m.name) })),
        stores: demoStores.map((s) => ({ id: s.id, code: String(s.codFilial), name: s.fantasia })),
      },
    };
  }
  const r = await invoke<SystemUsersData>({ action: "list" });
  if (!r.ok) return r;
  const members = (r.data.members ?? []).map((m) => ({ ...m, name: titleName(m.name) }));
  return { ok: true, data: { members, stores: r.data.stores ?? [] } };
}

export async function inviteSystemUser(input: InviteInput): Promise<ActionResult> {
  if (!getSupabase()) {
    demoMembers().push({
      membershipId: `d-${Date.now()}`,
      name: "",
      email: input.email.trim().toLowerCase(),
      role: input.role,
      status: "PENDING",
      isOwner: false,
      isSelf: false,
      storeIds: input.storeIds,
      invitedAt: new Date().toISOString(),
      lastSignInAt: null,
      acceptedAt: null,
    });
    return { ok: true };
  }
  const r = await invoke({ action: "invite", ...input, allStores: input.storeIds.length === 0 });
  return r.ok ? { ok: true } : r;
}

/** `storeIds` vazio = todas as lojas. */
export async function updateSystemUser(membershipId: string, role: SystemRole, storeIds: string[]): Promise<ActionResult> {
  if (!getSupabase()) return demoPatch(membershipId, { role, storeIds });
  const r = await invoke({ action: "update", membershipId, role, storeIds, allStores: storeIds.length === 0 });
  return r.ok ? { ok: true } : r;
}

type MemberAction = "resend" | "suspend" | "reactivate" | "revoke";

export async function systemUserAction(action: MemberAction, membershipId: string): Promise<ActionResult> {
  if (!getSupabase()) {
    if (action === "revoke") return demoPatch(membershipId, null);
    if (action === "suspend") return demoPatch(membershipId, { status: "SUSPENDED" });
    if (action === "reactivate") return demoPatch(membershipId, { status: "ACTIVE" });
    return demoPatch(membershipId, { invitedAt: new Date().toISOString() });
  }
  const r = await invoke({ action, membershipId });
  return r.ok ? { ok: true } : r;
}

/* ---------- Pessoa convidada ---------- */

export interface InviteInfo {
  email: string;
  role: SystemRole;
  companyName: string;
}

export async function fetchInviteInfo(): Promise<{ ok: true; info: InviteInfo } | { ok: false; code: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, code: "not_found" };
  const { data, error } = await sb.functions.invoke("team-members", { body: { action: "invite_info" } });
  const res = data as ({ ok?: boolean; error?: string } & InviteInfo) | null;
  if (error || !res?.ok) return { ok: false, code: res?.error ?? "not_found" };
  return { ok: true, info: { email: res.email, role: res.role, companyName: companyNameCase(res.companyName) } };
}

/** Ativa o convite gravando o nome e o sobrenome informados no "Crie seu acesso". */
export async function acceptInvite(personal: { firstName: string; lastName: string }): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.functions.invoke("team-members", {
    body: { action: "accept", firstName: titleName(personal.firstName), lastName: titleName(personal.lastName) },
  });
  return !error && Boolean((data as { ok?: boolean } | null)?.ok);
}
