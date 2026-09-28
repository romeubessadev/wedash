import { useMemo, useState } from "react";
import { Button, Card, CardTitle, PageHeader, Pagination, ThSort, type SortDir } from "@/components/ui";
import { goals } from "@/data/wedash/goals";
import { stores } from "@/data/wedash/stores";
import { brl } from "@/lib/format";
import { usePagedRows } from "@/lib/usePagedRows";

function nomeFilial(filialId: string) {
  return stores.find((f) => f.id === filialId)?.fantasia ?? filialId;
}

type SortKey = "competencia" | "loja" | "nome" | "valor" | "niveis";

/**
 * CRUD de Metas (fora do Dashboard).
 * Esqueleto para evolução — listagem a partir do fixture; formulário/plano do mês amanhã.
 */
export default function GoalsPage() {
  const [sortKey, setSortKey] = useState<SortKey>("competencia");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const ordenadas = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...goals].sort((a, b) => {
      if (sortKey === "loja") return nomeFilial(a.filialId).localeCompare(nomeFilial(b.filialId)) * dir;
      if (sortKey === "nome") return a.nome.localeCompare(b.nome) * dir;
      if (sortKey === "valor") return (a.valorLoja - b.valorLoja) * dir;
      if (sortKey === "niveis") return (a.degraus.length - b.degraus.length) * dir;
      // competencia: padrão desc (mais recente primeiro)
      return a.competencia.localeCompare(b.competencia) * dir || nomeFilial(a.filialId).localeCompare(nomeFilial(b.filialId));
    });
  }, [sortKey, sortDir]);
  const paged = usePagedRows(ordenadas, `${sortKey}|${sortDir}`);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "loja" || key === "nome" ? "asc" : "desc");
    }
  }

  return (
    <div className="flex flex-col p-4 sm:p-6">
      <PageHeader
        crumbs={[{ label: "Gestão" }, { label: "Metas" }]}
        title="Metas"
        subtitle="Metas mensais, níveis de premiação e distribuição individual."
        actions={
          <Button size="sm" disabled title="Em breve">
            Nova meta
          </Button>
        }
      />

      <Card className="mt-4" padding="lg">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle>Metas cadastradas</CardTitle>
          </div>
          <span className="text-[12px] font-semibold text-t2">
            {ordenadas.length} {ordenadas.length === 1 ? "meta" : "metas"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-t2">
                <ThSort label="Competência" active={sortKey === "competencia"} dir={sortDir} onClick={() => toggleSort("competencia")} align="left" className="px-1 pb-3" />
                <ThSort label="Loja" active={sortKey === "loja"} dir={sortDir} onClick={() => toggleSort("loja")} align="left" className="px-1 pb-3" />
                <ThSort label="Nome" active={sortKey === "nome"} dir={sortDir} onClick={() => toggleSort("nome")} align="left" className="px-1 pb-3" />
                <ThSort label="Meta da loja" active={sortKey === "valor"} dir={sortDir} onClick={() => toggleSort("valor")} className="px-1 pb-3" />
                <ThSort label="Níveis de premiação" active={sortKey === "niveis"} dir={sortDir} onClick={() => toggleSort("niveis")} className="px-1 pb-3" />
              </tr>
            </thead>
            <tbody>
              {ordenadas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-1 py-8 text-center text-[13px] text-t2">
                    Nenhuma meta cadastrada.
                  </td>
                </tr>
              ) : (
                paged.pageRows.map((m) => (
                  <tr key={m.id} className="border-b border-line last:border-b-0">
                    <td className="px-1 py-3 font-mono text-[13px] font-semibold text-t1">{m.competencia}</td>
                    <td className="px-1 py-3 text-[13px] font-bold text-t0">{nomeFilial(m.filialId)}</td>
                    <td className="px-1 py-3 text-[13px] text-t1">{m.nome}</td>
                    <td className="px-1 py-3 text-right font-mono text-[13px] font-bold text-t0">{brl(m.valorLoja)}</td>
                    <td className="px-1 py-3 text-right text-[12.5px] text-t2">{m.degraus.length}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {paged.totalPages > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
            <span className="text-[12.5px] text-t2">
              Mostrando {paged.pageRows.length} de {paged.total} metas
            </span>
            <Pagination page={paged.page} totalPages={paged.totalPages} onChange={paged.setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
