import { collaboratorName, fimDoMes, shiftName } from "@/lib/format";
import { goals as fixtureGoals, type Tier } from "./goals";
import { SELLER_ROLE } from "./stores";

/** Meta gravada (tabela `goal`): 1 por loja por período, valores em reais. */
export interface GoalRecord {
  id: string;
  storeId: string;
  name: string;
  /** ISO YYYY-MM-DD (inclusive). */
  startsOn: string;
  endsOn: string;
  /** Meta da loja no período (R$). */
  target: number;
  /** INDIVIDUAL = cada pessoa pela própria meta (meta ÷ pessoas); GROUP = a equipe sobe junta. */
  tierMode: "INDIVIDUAL" | "GROUP";
  tiers: Tier[];
  /** % da meta de cada grupo da loja (soma 100); vazio = sem grupos de distribuição. */
  groups: GoalGroup[];
}

export interface GoalGroup {
  shiftId: string;
  name: string;
  pct: number;
}

/** Pessoa da equipe da loja (store_seller) para a meta. */
export interface GoalTeamMember {
  storeId: string;
  employeeId: number;
  /** Código de gerador no Millennium (liga os itens por pessoa dos desafios). */
  geradorId?: number | null;
  name: string;
  /** Nomes normalizados já vistos (liga venda gravada só pelo nome). */
  nameKeys: string[];
  /** Ativo com cargo VENDEDOR = na equipe de vendas agora. */
  salesPerson: boolean;
  /** Grupo da pessoa (Gestão > Vendedores). */
  shiftId: string | null;
  shiftName: string | null;
}

type TierJson = {
  name?: string;
  minPct?: number;
  commissionPct?: number;
  bonusCents?: number;
  managerCommissionPct?: number;
  managerBonusCents?: number;
};

function parseTiers(raw: unknown): Tier[] {
  if (!Array.isArray(raw)) return [];
  return (raw as TierJson[])
    .map((t): Tier => ({
      nome: String(t.name ?? "").trim(),
      atingimentoMinPct: Number(t.minPct ?? 0),
      comissaoPct: Number(t.commissionPct ?? 0),
      bonus: Number(t.bonusCents ?? 0) / 100,
      ...(t.managerCommissionPct != null
        ? { gerenciaPct: Number(t.managerCommissionPct), gerenciaBonus: Number(t.managerBonusCents ?? 0) / 100 }
        : {}),
    }))
    .filter((t) => t.nome && Number.isFinite(t.atingimentoMinPct))
    .sort((a, b) => a.atingimentoMinPct - b.atingimentoMinPct);
}

function parseGroups(raw: unknown): GoalGroup[] {
  if (!Array.isArray(raw)) return [];
  return (raw as { shiftId?: string; name?: string; pct?: number }[])
    .map((g) => ({ shiftId: String(g.shiftId ?? ""), name: String(g.name ?? ""), pct: Number(g.pct ?? 0) }))
    .filter((g) => g.shiftId && Number.isFinite(g.pct));
}

type GoalRow = {
  id: string;
  store_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  target_cents: number;
  tier_mode: string;
  tiers: unknown;
  groups: unknown;
};

function fromRow(r: GoalRow): GoalRecord {
  return {
    id: r.id,
    storeId: r.store_id,
    name: r.name,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    target: Number(r.target_cents) / 100,
    tierMode: r.tier_mode === "GROUP" ? "GROUP" : "INDIVIDUAL",
    tiers: parseTiers(r.tiers),
    groups: parseGroups(r.groups),
  };
}

/** Demo sem Supabase: metas fixture (lojas f1/f2), só a meta principal de cada mês. */
function fixtureRecords(): GoalRecord[] {
  return fixtureGoals
    .filter((g) => g.marcas.length !== 1)
    .map((g) => ({
      id: g.id,
      storeId: g.filialId,
      name: g.nome,
      startsOn: `${g.competencia}-01`,
      endsOn: fimDoMes(`${g.competencia}-01`),
      target: g.valorLoja,
      tierMode: g.tipo === "individual" ? "INDIVIDUAL" : "GROUP",
      tiers: g.degraus,
      groups: [],
    }));
}

const COLS = "id, store_id, name, starts_on, ends_on, target_cents, tier_mode, tiers, groups";

export type GoalInput = Omit<GoalRecord, "id">;

/** Cria (sem id) ou atualiza a meta. `overlap` = já existe meta da loja com datas que se cruzam. */
export async function saveGoal(
  tenantId: string,
  id: string | null,
  g: GoalInput,
): Promise<{ ok: true; id: string } | { ok: false; reason: "overlap" | "error" }> {
  const { getSupabase } = await import("@/lib/supabase");
  const sb = getSupabase();
  if (!sb) return { ok: true, id: id ?? "demo" };
  const row = {
    store_id: g.storeId,
    name: g.name.trim(),
    starts_on: g.startsOn,
    ends_on: g.endsOn,
    target_cents: Math.round(g.target * 100),
    tier_mode: g.tierMode,
    tiers: g.tiers.map((t) => ({
      name: t.nome,
      minPct: t.atingimentoMinPct,
      commissionPct: t.comissaoPct,
      bonusCents: Math.round(t.bonus * 100),
      ...(t.gerenciaPct != null
        ? { managerCommissionPct: t.gerenciaPct, managerBonusCents: Math.round((t.gerenciaBonus ?? 0) * 100) }
        : {}),
    })),
    groups: g.groups.map((x) => ({ shiftId: x.shiftId, name: x.name, pct: x.pct })),
  };
  const res = id
    ? await sb
        .from("goal")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", id)
        .select("id")
        .single()
    : await sb
        .from("goal")
        .insert({ ...row, tenant_id: tenantId })
        .select("id")
        .single();
  if (res.error) {
    console.warn("saveGoal:", res.error.message);
    return { ok: false, reason: res.error.code === "23P01" ? "overlap" : "error" };
  }
  return { ok: true, id: (res.data as { id: string }).id };
}

/** Metas das lojas com período que cruza [from, to]; mais recentes primeiro. */
export async function fetchGoals(q: { tenantId: string; storeIds: string[]; from: string; to: string }): Promise<GoalRecord[]> {
  if (q.storeIds.length === 0) return [];
  const { getSupabase } = await import("@/lib/supabase");
  const sb = getSupabase();
  if (!sb) {
    return fixtureRecords()
      .filter((g) => q.storeIds.includes(g.storeId) && g.startsOn <= q.to && g.endsOn >= q.from)
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  }
  const { data, error } = await sb
    .from("goal")
    .select(COLS)
    .eq("tenant_id", q.tenantId)
    .in("store_id", q.storeIds)
    .lte("starts_on", q.to)
    .gte("ends_on", q.from)
    .order("starts_on", { ascending: false });
  if (error) {
    console.warn("fetchGoals:", error.message);
    return [];
  }
  return ((data ?? []) as GoalRow[]).map(fromRow);
}

export async function fetchGoal(tenantId: string, id: string): Promise<GoalRecord | null> {
  const { getSupabase } = await import("@/lib/supabase");
  const sb = getSupabase();
  if (!sb) return fixtureRecords().find((g) => g.id === id) ?? null;
  const { data, error } = await sb.from("goal").select(COLS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) {
    console.warn("fetchGoal:", error.message);
    return null;
  }
  return data ? fromRow(data as GoalRow) : null;
}

export async function deleteGoal(tenantId: string, id: string): Promise<{ ok: boolean }> {
  const { getSupabase } = await import("@/lib/supabase");
  const sb = getSupabase();
  if (!sb) return { ok: true };
  const { error } = await sb.from("goal").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) {
    console.warn("deleteGoal:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

/** Funcionários das lojas (store_seller) com turno — elegibilidade da meta e nome/turno na escada. */
export async function fetchGoalTeam(tenantId: string, storeIds: string[]): Promise<GoalTeamMember[]> {
  if (storeIds.length === 0) return [];
  const { getSupabase } = await import("@/lib/supabase");
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("store_seller")
    .select(
      "store_id, millennium_employee_id, millennium_gerador_id, name, name_keys, active, erp_role, shift_id, store_shift(name)",
    )
    .eq("tenant_id", tenantId)
    .in("store_id", storeIds)
    .limit(2000);
  if (error) {
    console.warn("fetchGoalTeam:", error.message);
    return [];
  }
  type Row = {
    store_id: string;
    millennium_employee_id: number;
    millennium_gerador_id: number | null;
    name: string;
    name_keys: string[] | null;
    active: boolean;
    erp_role: string | null;
    shift_id: string | null;
    store_shift: { name: string } | { name: string }[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const shift = Array.isArray(r.store_shift) ? r.store_shift[0] : r.store_shift;
    return {
      storeId: r.store_id,
      employeeId: r.millennium_employee_id,
      geradorId: r.millennium_gerador_id == null ? null : Number(r.millennium_gerador_id),
      name: collaboratorName(r.name),
      nameKeys: r.name_keys ?? [],
      salesPerson: r.active && (r.erp_role == null || r.erp_role === SELLER_ROLE),
      shiftId: r.shift_id,
      shiftName: shift?.name ? shiftName(shift.name) : null,
    };
  });
}
