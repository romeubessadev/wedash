/**
 * Custos do Millennium sob demanda (Edge `erp-products-sync`): tela Produtos e impostos e
 * "Atualizar custos" do aviso de produtos sem custo. O catálogo de produtos se atualiza sozinho no worker.
 */

async function client() {
  const { getSupabase } = await import("@/lib/supabase");
  return getSupabase();
}

const SYNC_PRODUCTS_ERRORS: Record<string, string> = {
  credential_missing: "Não foi possível acessar o Millennium. Verifique os dados da integração.",
  credential_invalid: "Não foi possível acessar o Millennium. Verifique os dados da integração.",
  integration_paused: "A conexão com o Millennium está desconectada. Verifique a integração para continuar.",
  erp_busy: "Este usuário do Millennium está conectado em outro local. Encerre a outra sessão e tente novamente.",
  busy: "Os produtos já estão sendo atualizados. Tente novamente em alguns minutos.",
  forbidden: "Você não tem permissão para atualizar os custos.",
  invalid_table: "Esta tabela de custo não está mais disponível. Atualize as tabelas e escolha outra.",
  invalid_period: "Período inválido.",
};

export type ProductsSyncScope =
  | { scope: "tables" }
  | { scope: "registry" }
  | { scope: "table"; tableId: number }
  | { scope: "costs"; storeIds: string[]; from: string; to: string };

type SyncResponse = { ok?: boolean; error?: string; fixed?: number; missing?: number };

/**
 * Busca no Millennium agora: `tables` = só a lista de tabelas de custo; `table` = preços de uma tabela;
 * `costs` = produtos sem custo nas lojas/período (tabela da loja + margem) — `missing` = seguem sem custo.
 */
export async function syncProductsNow(
  request: ProductsSyncScope,
): Promise<{ ok: true; fixed: number; missing: number } | { ok: false; message: string }> {
  const sb = await client();
  if (!sb) return { ok: false, message: "Sem conexão com o servidor." };
  const { data, error } = await sb.functions.invoke("erp-products-sync", { body: request });
  let body = data as SyncResponse | null;
  if ((!body || typeof body !== "object") && error && typeof error === "object") {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        body = (await ctx.json()) as typeof body;
      } catch {
        /* ignore */
      }
    }
  }
  if (body?.ok === true) return { ok: true, fixed: body.fixed ?? 0, missing: body.missing ?? 0 };
  return {
    ok: false,
    message:
      SYNC_PRODUCTS_ERRORS[body?.error ?? ""] ??
      (request.scope === "costs"
        ? "Não foi possível atualizar os custos. Tente novamente."
        : request.scope === "tables"
          ? "Não foi possível atualizar as tabelas de custo. Tente novamente."
          : request.scope === "registry"
            ? "Não foi possível atualizar os cadastros. Tente novamente."
            : "Não foi possível buscar os custos no Millennium. Tente novamente."),
  };
}
