import { useState } from "react";
import { useToast } from "@/components/ui";
import type { ProductWithoutCost } from "@/data/wedash/dashboard";
import { syncProductsNow } from "@/data/wedash/productCatalog";
import { isGestor } from "@/layout/nav-wedash";
import { brlCent, num } from "@/lib/format";
import { useActiveSession } from "@/session/SessionProvider";
import { AlertTriangleIcon } from "@/pages/dashboards/icons";
import { SALES_SYNCED_EVENT } from "@/pages/dashboard/useForceRefresh";

/**
 * Aviso (warn) quando produtos vendidos no período ficam sem custo: R$ 0 na margem do Millennium
 * e sem preço na tabela de custo da loja — CMV e margem ficam otimistas.
 * "Atualizar custos" (Gestor): depois que o custo é cadastrado no Millennium, busca de novo a tabela
 * de custo e a margem das lojas afetadas no período da tela.
 */
export function ProductsWithoutCostNotice({
  produtos,
  storeIds,
  from,
  to,
}: {
  produtos?: ProductWithoutCost[];
  storeIds: string[];
  from: string;
  to: string;
}) {
  const session = useActiveSession();
  const { show } = useToast();
  const [aberto, setAberto] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  if (!produtos || produtos.length === 0) return null;
  const n = produtos.length;

  async function atualizarCustos() {
    if (atualizando) return;
    setAtualizando(true);
    const r = await syncProductsNow({ scope: "costs", storeIds, from, to });
    setAtualizando(false);
    if (!r.ok) {
      show(r.message, "danger");
      return;
    }
    window.dispatchEvent(new Event(SALES_SYNCED_EVENT));
    if (r.missing === 0) show("Custos atualizados.", "success");
    else
      show(
        r.missing === 1
          ? "O Millennium ainda está sem custo para 1 produto."
          : `O Millennium ainda está sem custo para ${r.missing} produtos.`,
        "warning",
      );
  }

  return (
    <div className="mt-4 rounded-[var(--radius-vela-md)] border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-t0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="flex min-w-0 items-center gap-2">
          <AlertTriangleIcon size={16} className="shrink-0 text-warn" />
          <span>
            <span className="font-semibold">
              {n === 1 ? "1 produto está sem custo no Millennium." : `${n} produtos estão sem custo no Millennium.`}
            </span>
            <span className="text-t1"> Isso pode deixar o CMV e a margem incorretos.</span>
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-3 text-[12px] font-semibold">
          <button type="button" onClick={() => setAberto((v) => !v)} className="text-t0 underline-offset-2 hover:underline">
            {aberto ? "Ocultar" : "Ver produtos"}
          </button>
          {isGestor(session.role) && (
            <button
              type="button"
              onClick={() => void atualizarCustos()}
              disabled={atualizando}
              title="Depois de cadastrar os custos no Millennium, atualize para buscar os novos valores."
              className="text-t0 underline-offset-2 hover:underline disabled:cursor-default disabled:text-t2 disabled:no-underline"
            >
              {atualizando ? "Atualizando…" : "Atualizar custos"}
            </button>
          )}
        </div>
      </div>
      {aberto && (
        <ul className="mt-2 divide-y divide-warn/20 border-t border-warn/20">
          {produtos.map((p) => (
            <li key={p.codigo} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate">
                <span className="font-mono text-t2">{p.codigo}</span>
                {p.nome ? <span> · {p.nome}</span> : null}
              </span>
              <span className="shrink-0 tabular-nums text-t1">
                {num(p.itens)} {p.itens === 1 ? "item" : "itens"} · {brlCent(p.faturamento)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
