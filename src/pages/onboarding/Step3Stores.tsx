import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui";
import { listErpStores, logoutErp, type StoreErp } from "@/data/wedash/erp";
import { StoreIcon } from "@/pages/dashboards/icons";

const btnPrimario =
  "h-[46px] w-full rounded-xl bg-acc text-sm font-bold text-white transition-colors hover:bg-acc-2 disabled:cursor-not-allowed disabled:opacity-50";

function CardFilial({ f }: { f: StoreErp }) {
  return (
    <div className="flex items-center gap-3.5 rounded-[13px] border border-line bg-bg-inset px-4 py-3.5">
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-acc-soft text-acc">
        <StoreIcon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-t0">{f.tradeName}</p>
        <p className="mt-0.5 text-[11.5px] text-t2">
          {f.type === "M" ? "Matriz" : "Filial"}
          {f.taxId ? ` · ${f.taxId}` : ""}
        </p>
      </div>
    </div>
  );
}

/**
 * Etapa 3 — confirma lojas. Ao Voltar, logout ERP; ao confirmar, mantém token e o botão fica
 * "Sincronizando…" até as vendas de hoje chegarem (Atualizar de todas as lojas, segundos).
 */
export function Step3Stores({
  session,
  filiaisPre,
  sincronizando = false,
  erroSync = null,
  onTentarSync,
  onConcluir,
  onVoltar,
}: {
  session?: string;
  filiaisPre?: StoreErp[];
  sincronizando?: boolean;
  erroSync?: string | null;
  onTentarSync?: () => void;
  onConcluir: (stores: StoreErp[]) => void;
  onVoltar: () => void;
}) {
  const [stores, setFiliais] = useState<StoreErp[] | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    setFiliais(null);
    listErpStores(filiaisPre).then(setFiliais);
  }, [filiaisPre]);

  useEffect(() => {
    let ativo = true;
    setFiliais(null);
    listErpStores(filiaisPre).then((fs) => {
      if (ativo) setFiliais(fs);
    });
    return () => {
      ativo = false;
    };
  }, [filiaisPre]);

  const pode = stores !== null && stores.length > 0 && !salvando;
  const vazio = stores !== null && stores.length === 0;

  async function concluir() {
    if (!pode || !stores) return;
    setSalvando(true);
    // Não faz logout — o token segue no tenant p/ o SEED do worker.
    onConcluir(stores);
  }

  async function voltar() {
    setSalvando(true);
    await logoutErp(session);
    onVoltar();
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-t0">Confirme suas lojas</h1>
      <p className="mb-7 text-sm text-t2">
        Confira as lojas vinculadas a este usuário no Millennium. Todas serão adicionadas à WeDash para sincronizar vendas e equipe.
      </p>

      <div className="flex flex-col gap-3.5">
        <div className="mb-3.5">
          {stores === null ? (
            <div className="flex flex-col gap-2.5">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-[13px] border border-line bg-bg-inset px-4 py-3.5">
                  <Skeleton className="h-[38px] w-[38px] shrink-0 rounded-[11px]" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="mb-2 h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
              <p className="text-center text-[12px] text-t2">Buscando lojas no Millennium…</p>
            </div>
          ) : vazio ? (
            <div className="rounded-xl border border-warn/30 bg-warn-soft p-4 text-[13px] text-t0">
              Este usuário não possui lojas vinculadas no Millennium. Verifique os vínculos no ERP e tente novamente.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {stores.map((f) => (
                <CardFilial key={f.storeId} f={f} />
              ))}
            </div>
          )}
        </div>

        {erroSync ? (
          <div className="rounded-xl border border-bad/30 bg-bad-soft p-4 text-[13px] text-t0">{erroSync}</div>
        ) : null}

        {vazio ? (
          <button type="button" disabled={salvando} onClick={carregar} className={btnPrimario} style={{ boxShadow: "0 8px 24px -8px var(--acc)" }}>
            Tentar novamente
          </button>
        ) : erroSync ? (
          <button type="button" onClick={onTentarSync} className={btnPrimario} style={{ boxShadow: "0 8px 24px -8px var(--acc)" }}>
            Tentar novamente
          </button>
        ) : (
          <button
            type="button"
            disabled={!pode}
            onClick={concluir}
            className={btnPrimario}
            style={{ boxShadow: "0 8px 24px -8px var(--acc)" }}
          >
            {salvando || sincronizando ? "Sincronizando…" : "Confirmar e continuar"}
          </button>
        )}
        {sincronizando ? (
          <p className="text-center text-[12px] text-t2">
            Buscando as vendas de hoje no Millennium. Os dias anteriores do mês continuam carregando depois que você entrar.
          </p>
        ) : !salvando && !erroSync ? (
          <button type="button" onClick={voltar} className="text-center text-[13px] font-semibold text-t2 hover:text-t0">
            Voltar
          </button>
        ) : null}
      </div>
    </div>
  );
}
