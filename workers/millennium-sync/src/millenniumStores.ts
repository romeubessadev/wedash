/**
 * Lojas que o usuário ERP enxerga: millenium.FILIAIS.Lista.
 * Mesmo parse de `supabase/functions/_shared/millennium.ts` (mapStore) — manter iguais.
 */
import { millenniumBaseUrl } from "./millenniumAuth.ts";

export type ErpStore = {
  millenniumStoreId: number;
  code: string;
  name: string;
  tradeName: string;
  taxId: string | null;
  /** DATA_INAUGURACAO (YYYY-MM-DD) ou null. */
  openedAt: string | null;
};

const STORE_PATHS = ["millenium.filiais.lista", "millennium.filiais.lista", "Millennium.FILIAIS.Lista"];

function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] != null) return o[k];
  const lower = Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v != null) return v;
  }
  return undefined;
}

const asStr = (v: unknown) => (v == null ? "" : String(v).trim());

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function extractList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const o = payload as Record<string, unknown>;
  for (const k of ["value", "Value", "data", "Data", "items", "Items", "filiais", "Filiais", "d"]) {
    if (Array.isArray(o[k])) return o[k] as unknown[];
  }
  if (typeof o.value === "string") {
    try {
      const inner = JSON.parse(o.value);
      if (Array.isArray(inner)) return inner;
    } catch {
      /* ignore */
    }
  }
  return [];
}

export function parseFiliaisLista(payload: unknown): ErpStore[] {
  const out: ErpStore[] = [];
  for (const raw of extractList(payload)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = asNum(pick(o, "FILIAL", "COD", "filial", "cod"));
    if (id == null) continue;
    const name = asStr(pick(o, "NOME", "nome"));
    const opened = asStr(pick(o, "DATA_INAUGURACAO", "data_inauguracao", "dataInauguracao")).slice(0, 10);
    out.push({
      millenniumStoreId: id,
      code: asStr(pick(o, "COD_FILIAL", "cod_filial", "codFilial")) || String(id).padStart(5, "0"),
      name,
      tradeName: asStr(pick(o, "FANTASIA", "fantasia")) || name,
      taxId: asStr(pick(o, "CGC", "CNPJ", "cgc", "cnpj")) || null,
      openedAt: /^\d{4}-\d{2}-\d{2}$/.test(opened) ? opened : null,
    });
  }
  return out;
}

export async function fetchErpStores(opts: {
  session: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<ErpStore[]> {
  const base = (opts.baseUrl ?? millenniumBaseUrl()).replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  let lastErr = "";
  for (const path of STORE_PATHS) {
    const res = await fetchImpl(`${base}/${path}?$format=json&$dateformat=iso&$top=0`, {
      method: "GET",
      headers: { Accept: "application/json", "WTS-Session": opts.session },
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    if (!res.ok) {
      lastErr = `${path} → ${res.status} ${text.slice(0, 240)}`;
      if (res.status === 401) break;
      continue;
    }
    try {
      return parseFiliaisLista(text ? JSON.parse(text) : []);
    } catch {
      lastErr = `${path} JSON inválido: ${text.slice(0, 200)}`;
    }
  }
  throw new Error(`FILIAIS.Lista falhou: ${lastErr}`);
}
