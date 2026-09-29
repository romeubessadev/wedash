import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Badge, DataTable, Modal, type DataTableColumn, type SortDir } from "@/components/ui";
import { Tooltip } from "@/components/ui/Tooltip";
import { StockProductsSkeleton } from "@/components/wedash/LoadingSkeletons";
import { MobileSortBar } from "@/components/wedash/MobileSortBar";
import { composePrice, costCentsFor, type PriceComposition, type StockProductRow } from "@/data/wedash/stockProducts";
import type { Store } from "@/data/wedash/stores";
import { cn } from "@/lib/cn";
import { brlCent, num } from "@/lib/format";
import { usePrintMode } from "@/lib/printMode";
import { useMinSkeleton } from "@/lib/useMinSkeleton";
import { TABLE_PAGE_SIZE } from "@/lib/usePagedRows";
import { EmptyBlock } from "@/pages/dashboard/EmptyBlock";
import { ReportHeader, useExportPdf } from "@/pages/dashboard/ReportHeader";
import { SectionHeader } from "@/pages/operation/shared";
import { ExportButton, HeaderFilters, ProductCell, TableFooter, TipHelp, UpdatedLine, money, pct, pctRate } from "./shared";
import { HeaderFilter, HeaderSearch } from "@/pages/dashboard/HeaderFilter";
import { tableLabel, uniqueIds, useStockData } from "./useStockData";

type SortKey = "nome" | "preco" | "lucro" | "margem";

export function SaleTablesPage() {
  const { lojas, storeKey, data, view, loading, syncing, salePrices, tabelaAtiva, tabelaNome, escolherTabela, todasTabelas, usadas, atualizadoTexto } =
    useStockData({ prices: true });
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const printing = usePrintMode();
  const showSkeleton = useMinSkeleton(loading);
  const exportar = useExportPdf("Tabelas de venda", tabelaNome, { periodo: false });

  const lojasSemTabela = lojas.filter((s) => s.costTableId == null);
  const semTabelaDeCusto = lojas.length > 0 && lojasSemTabela.length === lojas.length;
  const comPreco = useMemo(() => (view?.rows ?? []).filter((r) => r.preco != null), [view]);
  const categorias = useMemo(() => [...new Set(comPreco.map((r) => r.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR")), [comPreco]);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const out = comPreco.filter(
      (r) => (!categoria || r.categoria === categoria) && (!q || r.nome.toLowerCase().includes(q) || r.codigo.toLowerCase().includes(q)),
    );
    const dir = sortDir === "asc" ? 1 : -1;
    const valor = (r: StockProductRow) => (sortKey === "preco" ? r.preco : sortKey === "lucro" ? r.lucro : r.margemPct);
    out.sort((a, b) => {
      if (sortKey === "nome") return a.nome.localeCompare(b.nome, "pt-BR") * dir;
      const va = valor(a);
      const vb = valor(b);
      if (va == null && vb == null) return a.nome.localeCompare(b.nome, "pt-BR");
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * dir || a.nome.localeCompare(b.nome, "pt-BR");
    });
    return out;
  }, [comPreco, busca, categoria, sortKey, sortDir]);

  useEffect(() => setPage(1), [busca, categoria, sortKey, sortDir, storeKey, tabelaAtiva]);

  const totalPages = Math.max(1, Math.ceil(linhas.length / TABLE_PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = printing ? linhas : linhas.slice((pageSafe - 1) * TABLE_PAGE_SIZE, pageSafe * TABLE_PAGE_SIZE);

  const columns: DataTableColumn<StockProductRow>[] = [
    {
      key: "produto",
      header: "Produto",
      render: (r) => (
        <ProductCell
          r={r}
          extra={
            r.custo == null && !semTabelaDeCusto ? (
              <Tooltip label="A tabela de custo da loja não tem o custo deste produto.">
                <span className="mt-1 inline-block">
                  <Badge variant="neutral">Sem custo</Badge>
                </span>
              </Tooltip>
            ) : r.variaPorLoja ? (
              <p className="text-[11px] text-t2">Média das lojas</p>
            ) : null
          }
        />
      ),
    },
    { key: "custo", header: "Preço de custo", align: "right", render: (r) => <span className="tabular-nums text-t1">{money(r.custo)}</span> },
    { key: "preco", header: "Preço de venda", align: "right", render: (r) => <span className="font-bold tabular-nums text-t0">{money(r.preco)}</span> },
    {
      key: "lucro",
      header: "Lucro por peça",
      align: "right",
      render: (r) => <span className={cn("font-extrabold tabular-nums", r.lucro == null ? "text-t2" : r.lucro < 0 ? "text-bad" : "text-ok")}>{money(r.lucro)}</span>,
    },
    { key: "margem", header: "Margem", align: "right", render: (r) => <span className="tabular-nums text-t1">{pct(r.margemPct)}</span> },
    { key: "minimo", header: "Preço mínimo", align: "right", render: (r) => <span className="tabular-nums text-t2">{money(r.precoMinimo)}</span> },
  ];

  const produtoDetalhe = detalhe ? (view?.rows.find((r) => r.codigo === detalhe) ?? null) : null;
  const tabelaOpcoes = data ? todasTabelas.map((id) => ({ value: String(id), label: tableLabel(id, data.saleTables, data.usageNames) })) : [];

  return (
    <div className="flex flex-col p-4 sm:p-6 print:p-0">
      <ReportHeader
        periodo={false}
        atualizado={atualizadoTexto}
        filtros={[...(data ? [{ label: "Tabela de venda", valor: tabelaNome }] : []), ...(categoria ? [{ label: "Categoria", valor: categoria }] : [])]}
      />
      <SectionHeader
        section="Estoque"
        title="Tabelas de venda"
        subtitle="Compare o preço e o lucro por peça de cada produto na tabela escolhida. O lucro já desconta impostos, royalties, marketing e aluguel."
        actions={
          <HeaderFilters
            updated={
              <UpdatedLine
                text={atualizadoTexto}
                tip="Preços buscados no Millennium uma vez por dia ao abrir a tela e no botão Atualizar do topo. A tabela sugerida é a mais usada nas vendas dos últimos 30 dias."
              />
            }
          >
            <HeaderSearch value={busca} onChange={setBusca} />
            {tabelaOpcoes.length > 0 && (
              <HeaderFilter
                label="Tabela de venda"
                value={String(tabelaAtiva ?? "")}
                onChange={(v) => escolherTabela(Number(v))}
                options={tabelaOpcoes}
              />
            )}
            {categorias.length > 1 && (
              <HeaderFilter
                label="Categoria"
                value={categoria}
                onChange={setCategoria}
                options={[{ value: "", label: "Todas as categorias" }, ...categorias.map((c) => ({ value: c, label: c }))]}
              />
            )}
            <ExportButton onClick={exportar} />
          </HeaderFilters>
        }
        notices={
          !showSkeleton && view && lojasSemTabela.length > 0 ? (
            <Alert
              variant="warning"
              title={
                lojasSemTabela.length === 1
                  ? `A loja ${lojasSemTabela[0].fantasia} está sem tabela de custo.`
                  : `${lojasSemTabela.length} lojas estão sem tabela de custo.`
              }
            >
              Sem ela não dá para calcular o custo e o lucro dos produtos.
            </Alert>
          ) : undefined
        }
      />

      {showSkeleton || !view ? (
        <StockProductsSkeleton />
      ) : (
        <>
          {linhas.length > 1 && (
            <MobileSortBar
              always
              className="mb-3"
              options={[
                { key: "nome", label: "Produto", text: true },
                { key: "preco", label: "Preço" },
                { key: "lucro", label: "Lucro" },
                { key: "margem", label: "Margem" },
              ]}
              sortKey={sortKey}
              sortDir={sortDir}
              onChange={(k, d) => {
                setSortKey(k);
                setSortDir(d);
              }}
            />
          )}

          <DataTable
            columns={columns}
            data={pageRows}
            rowKey={(r) => r.codigo}
            onRowClick={(r) => setDetalhe(r.codigo)}
            empty={
              <div className="flex rounded-[var(--radius-vela-lg)] border border-line bg-bg-2 p-4">
                {comPreco.length === 0 ? (
                  <EmptyBlock
                    icon="💲"
                    title="Sem preços"
                    description={syncing ? "Buscando os preços no Millennium…" : `Nenhum produto com preço na tabela ${tabelaNome}.`}
                  />
                ) : (
                  <EmptyBlock icon="🔍" title="Nenhum produto encontrado" description="Tente buscar por outro nome ou código." />
                )}
              </div>
            }
          />
          {linhas.length > 0 && <TableFooter shown={pageRows.length} total={linhas.length} page={pageSafe} totalPages={totalPages} onPage={setPage} />}
        </>
      )}

      {produtoDetalhe && data && (
        <PriceDetailModal
          row={produtoDetalhe}
          tabelaAtiva={tabelaAtiva}
          tabelas={uniqueIds([tabelaAtiva, ...usadas])}
          nomeTabela={(id) => tableLabel(id, data.saleTables, data.usageNames)}
          salePrices={salePrices}
          costCents={(store) => costCentsFor(data.costPrices, store, produtoDetalhe.codigo)}
          onClose={() => setDetalhe(null)}
        />
      )}
    </div>
  );
}

export default SaleTablesPage;

function PriceDetailModal({
  row,
  tabelaAtiva,
  tabelas,
  nomeTabela,
  salePrices,
  costCents,
  onClose,
}: {
  row: StockProductRow;
  tabelaAtiva: number | null;
  tabelas: number[];
  nomeTabela: (id: number | null) => string;
  salePrices: Map<number, Map<string, number>>;
  costCents: (store: Store) => number | null;
  onClose: () => void;
}) {
  const [lojaId, setLojaId] = useState(row.lojas[0]?.store.id ?? "");
  const loja = row.lojas.find((l) => l.store.id === lojaId) ?? row.lojas[0];
  if (!loja) return null;
  const comp = loja.composicao;
  const cost = costCents(loja.store);
  const comparacao = tabelas.map((id) => ({
    id,
    comp: composePrice(loja.store, row.codigo, salePrices.get(id)?.get(row.codigo) ?? null, cost),
  }));

  return (
    <Modal open onClose={onClose} title={row.nome} size="lg">
      <p className="-mt-1 text-[12px] text-t2">
        {row.codigo}
        {row.categoria && ` · ${row.categoria}`}
      </p>

      {row.lojas.length > 1 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-t2">Por loja · {nomeTabela(tabelaAtiva)}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[11px] text-t2">
                  <th className="px-2 py-1.5 text-left font-semibold">Loja</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Custo total</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Lucro por peça</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Margem</th>
                </tr>
              </thead>
              <tbody>
                {row.lojas.map((l) => (
                  <tr
                    key={l.store.id}
                    onClick={() => setLojaId(l.store.id)}
                    className={cn("cursor-pointer border-b border-line last:border-b-0 hover:bg-bg-3", l.store.id === loja.store.id && "bg-acc-soft")}
                  >
                    <td className="px-2 py-1.5 font-semibold uppercase text-t0">{l.store.fantasia}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-t1">{money(l.composicao.custoTotal)}</td>
                    <td className={cn("px-2 py-1.5 text-right font-semibold tabular-nums", l.composicao.lucro == null ? "text-t2" : l.composicao.lucro < 0 ? "text-bad" : "text-ok")}>
                      {money(l.composicao.lucro)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-t1">{pct(l.composicao.margemPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-t2">
          Composição do preço{row.lojas.length > 1 && ` · ${loja.store.fantasia}`}
        </p>
        {comp.custo == null ? (
          <p className="rounded-[var(--radius-vela-sm)] bg-bg-inset px-3 py-2.5 text-[12.5px] text-t1">
            {loja.store.costTableId == null
              ? "A loja está sem tabela de custo. Escolha a tabela em Configurações > Produtos e impostos."
              : "Este produto não tem custo na tabela de custo da loja."}
          </p>
        ) : (
          <Composicao comp={comp} tabela={nomeTabela(tabelaAtiva)} />
        )}
      </div>

      {comparacao.length > 1 && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-t2">Tabelas usadas nos últimos 30 dias</p>
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[11px] text-t2">
                <th className="px-2 py-1.5 text-left font-semibold">Tabela</th>
                <th className="px-2 py-1.5 text-right font-semibold">Preço</th>
                <th className="px-2 py-1.5 text-right font-semibold">Lucro por peça</th>
                <th className="px-2 py-1.5 text-right font-semibold">Margem</th>
              </tr>
            </thead>
            <tbody>
              {comparacao.map(({ id, comp: c }) => (
                <tr key={id} className={cn("border-b border-line last:border-b-0", id === tabelaAtiva && "bg-acc-soft")}>
                  <td className="px-2 py-1.5 font-semibold text-t0">{nomeTabela(id)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-t1">{money(c.preco)}</td>
                  <td className={cn("px-2 py-1.5 text-right font-semibold tabular-nums", c.lucro == null ? "text-t2" : c.lucro < 0 ? "text-bad" : "text-ok")}>
                    {money(c.lucro)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-t1">{pct(c.margemPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-t2">Preço praticado · últimos 30 dias</p>
        {loja.praticado ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Preço médio" value={brlCent(loja.praticado.preco)} />
            <Mini label="Peças vendidas" value={num(loja.praticado.itens)} />
            <Mini label="Lucro por peça" value={money(loja.praticado.lucro)} cor={loja.praticado.lucro != null && loja.praticado.lucro < 0 ? "text-bad" : "text-ok"} />
            <Mini label="Margem" value={pct(loja.praticado.margemPct)} />
          </div>
        ) : (
          <p className="text-[12.5px] text-t2">Sem vendas deste produto na loja nos últimos 30 dias.</p>
        )}
      </div>
    </Modal>
  );
}

function Mini({ label, value, cor = "text-t0" }: { label: string; value: string; cor?: string }) {
  return (
    <div className="rounded-[var(--radius-vela-sm)] bg-bg-inset px-3 py-2">
      <p className="text-[11px] text-t2">{label}</p>
      <p className={cn("mt-0.5 text-[13.5px] font-bold tabular-nums", cor)}>{value}</p>
    </div>
  );
}

function Composicao({ comp, tabela }: { comp: PriceComposition; tabela: string }) {
  const linha = (label: ReactNode, valor: string, opts: { forte?: boolean; cor?: string; sub?: boolean } = {}) => (
    <div className={cn("flex items-center justify-between gap-3 py-1.5", opts.forte && "border-t border-line pt-2 font-bold", opts.sub && "pl-3 text-t1")}>
      <span className={cn(opts.forte ? "text-t0" : "text-t1")}>{label}</span>
      <span className={cn("tabular-nums", opts.cor ?? (opts.forte ? "text-t0" : "text-t1"))}>{valor}</span>
    </div>
  );
  return (
    <div className="text-[12.5px]">
      {linha(
        <>
          Preço de venda <span className="text-t2">· {tabela}</span>
        </>,
        money(comp.preco),
        { cor: "font-semibold text-t0" },
      )}
      {linha("Custo do produto", money(comp.custo))}
      {comp.icmsStPct > 0 && linha(`ICMS ST (${pctRate(comp.icmsStPct)} do custo)`, money(comp.icmsSt), { sub: true })}
      {comp.preco == null ? (
        <p className="mt-2 text-t2">Este produto não tem preço na tabela de venda selecionada.</p>
      ) : (
        <>
          {comp.despesas.map((d) => (
            <Fragment key={d.label}>{linha(`${d.label} (${pctRate(d.pct)} do preço)`, brlCent(d.valor), { sub: true })}</Fragment>
          ))}
          {linha("Custo total", money(comp.custoTotal), { forte: true })}
          {linha("Lucro por peça", `${money(comp.lucro)} · ${pct(comp.margemPct)}`, {
            forte: true,
            cor: comp.lucro != null && comp.lucro < 0 ? "text-bad" : "text-ok",
          })}
          {linha(
            <span className="inline-flex items-center gap-1">
              Preço mínimo <TipHelp label="Menor preço de venda que não dá prejuízo com os custos desta loja." />
            </span>,
            money(comp.precoMinimo),
          )}
        </>
      )}
    </div>
  );
}
