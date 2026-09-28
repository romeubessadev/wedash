import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Avatar,
  Badge,
  DataTable,
  type DataTableColumn,
  Breadcrumbs,
  Button,
  Card,
  CardHeader,
  CardSubtitle,
  CardTitle,
  FormField,
  Input,
  Segmented,
  EmptyState,
  Select,
  Switch,
  useToast,
} from "@/components/ui";
import { StoreDetailSkeleton, TeamTableSkeleton } from "@/components/wedash/LoadingSkeletons";
import { useActiveSession } from "@/session/SessionProvider";
import { isGestor } from "@/layout/nav-wedash";
import {
  EMPTY_STORE_COSTS,
  deleteStoreShift,
  fetchCostTables,
  fetchStoreSellers,
  fetchStoreShifts,
  hydrateSessionStores,
  isActiveSalesPerson,
  saveStoreShift,
  setSellerShift,
  storesForSession,
  syncStoreSellersNow,
  updateStoreCosts,
  updateStoreCostTable,
  updateStoreSchedule,
  type CostTable,
  type Store,
  type StoreCosts,
  type StoreSeller,
  type StoreShift,
} from "@/data/wedash/stores";
import { syncProductsNow } from "@/data/wedash/productCatalog";
import {
  DOW_LABELS,
  STORE_TIMEZONES,
  canonicalStoreTimezone,
  halfHourOptions,
  parseWeekHours,
  type Dow,
  type StoreWeekHours,
} from "@/data/wedash/storeHours";
import { Icon, icons } from "@/pages/users/Icons";
import { paths } from "@/router/paths";
import { cn } from "@/lib/cn";
import { titleName } from "@/lib/format";

const TIME_OPTS = halfHourOptions();
const DOWS: Dow[] = [0, 1, 2, 3, 4, 5, 6];

/** Linha editável do card Turnos; `id` ausente = turno novo ainda não salvo. */
type ShiftDraft = { key: string; id?: string; name: string; start: string; end: string };

function shiftToDraft(s: StoreShift): ShiftDraft {
  return { key: s.id, id: s.id, name: s.name, start: s.start, end: s.end };
}

function draftToShift(d: ShiftDraft): StoreShift {
  return { id: d.id ?? "", name: titleName(d.name), start: d.start, end: d.end };
}

/** Custos em % editáveis aqui. Aluguel % vale para a loja toda (grava igual nas duas marcas); fixos ficam fora. */
type PctKey =
  | "royaltiesWepinkPct"
  | "marketingWepinkPct"
  | "royaltiesWpinkPct"
  | "marketingWpinkPct"
  | "rentPct"
  | "icmsPct"
  | "icmsStPct";
type SaveResult = { ok: true } | { ok: false; error: string };
function pctText(v: number | null): string {
  return v == null ? "" : String(v).replace(".", ",");
}

function parseNum(txt: string): number | null {
  const raw = txt.trim();
  const t = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function custosParaTexto(c: StoreCosts): Record<PctKey, string> {
  return {
    royaltiesWepinkPct: pctText(c.royaltiesWepinkPct),
    marketingWepinkPct: pctText(c.marketingWepinkPct),
    royaltiesWpinkPct: pctText(c.royaltiesWpinkPct),
    marketingWpinkPct: pctText(c.marketingWpinkPct),
    rentPct: pctText(c.rentWepinkPct ?? c.rentWpinkPct),
    icmsPct: pctText(c.icmsPct),
    icmsStPct: pctText(c.icmsStPct),
  };
}

/** null = algum campo inválido (não numérico, negativo ou > 100). Mantém o aluguel fixo de `base`. */
function parseCosts(txt: Record<PctKey, string>, base: StoreCosts): StoreCosts | null {
  const n = {} as Record<PctKey, number | null>;
  for (const k of Object.keys(txt) as PctKey[]) {
    const v = parseNum(txt[k]);
    if (Number.isNaN(v) || (v != null && (v < 0 || v > 100))) return null;
    n[k] = v;
  }
  return {
    royaltiesWepinkPct: n.royaltiesWepinkPct,
    marketingWepinkPct: n.marketingWepinkPct,
    royaltiesWpinkPct: n.royaltiesWpinkPct,
    marketingWpinkPct: n.marketingWpinkPct,
    rentWepinkPct: n.rentPct,
    rentWpinkPct: n.rentPct,
    rentFixed: base.rentFixed,
    icmsPct: n.icmsPct,
    icmsStPct: n.icmsStPct,
  };
}

/** Configurações > Lojas > detalhe — funcionamento (fuso + horário) e configuração da operação. Cada card salva no seu botão. */
export function StoreDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = useActiveSession();
  const [catalogTick, setCatalogTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [equipe, setEquipe] = useState<StoreSeller[]>([]);
  const [equipeLoaded, setEquipeLoaded] = useState(false);

  const store = useMemo(
    () => storesForSession(session.stores).find((s) => s.id === id) ?? null,
    [session.stores, id, catalogTick], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (session.stores.length > 0) {
        await hydrateSessionStores(session.tenantId, session.stores);
        if (!cancelled) setCatalogTick((n) => n + 1);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [session.tenantId, session.stores]);

  const [sellersTick, setSellersTick] = useState(0);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void fetchStoreSellers(session.tenantId, [id])
      .then((m) => {
        if (!cancelled) setEquipe(m.get(id) ?? []);
      })
      .finally(() => {
        if (!cancelled) setEquipeLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session.tenantId, id, sellersTick]);

  const voltar = () => navigate(paths.settings.stores);

  if (!store) {
    return (
      <div>
        <DetailHeader nome="Loja" onBack={voltar} />
        {loading ? (
          <StoreDetailSkeleton showCosts={isGestor(session.role)} />
        ) : (
          <span className="block py-6 text-center text-[12px] text-t2">Loja não encontrada no seu escopo.</span>
        )}
      </div>
    );
  }

  return (
    <StoreDetailForm
      key={store.id}
      tenantId={session.tenantId}
      store={store}
      equipe={equipe}
      equipeLoaded={equipeLoaded}
      canEdit={session.role === "OWNER" || session.role === "MANAGER" || session.role === "ADMIN_GLOBAL"}
      showCosts={isGestor(session.role)}
      onBack={voltar}
      onSaved={() => setCatalogTick((n) => n + 1)}
      onSellersSynced={() => setSellersTick((n) => n + 1)}
    />
  );
}

function DetailHeader({ nome, onBack }: { nome: string; onBack: () => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="sm" icon={<Icon d={icons.arrowLeft} size={14} />} onClick={onBack}>
        Voltar
      </Button>
      <Breadcrumbs items={[{ label: "Lojas", to: paths.settings.stores }, { label: nome }]} />
    </div>
  );
}

function StoreDetailForm({
  tenantId,
  store,
  equipe,
  equipeLoaded,
  canEdit,
  showCosts,
  onBack,
  onSaved,
  onSellersSynced,
}: {
  tenantId: string;
  store: Store;
  equipe: StoreSeller[];
  equipeLoaded: boolean;
  canEdit: boolean;
  showCosts: boolean;
  onBack: () => void;
  onSaved: () => void;
  onSellersSynced: () => void;
}) {
  const { show } = useToast();
  const [syncingSellers, setSyncingSellers] = useState(false);
  const ativos = useMemo(() => equipe.filter(isActiveSalesPerson), [equipe]);
  const desligados = useMemo(() => equipe.filter((s) => !s.active), [equipe]);
  const [teamTab, setTeamTab] = useState<"ativos" | "desligados">("ativos");
  const teamRows = teamTab === "ativos" ? ativos : desligados;

  async function atualizarVendedoras() {
    setSyncingSellers(true);
    const r = await syncStoreSellersNow(store.id);
    setSyncingSellers(false);
    if (r.ok) onSellersSynced();
    else show(r.message, "danger");
  }
  const [savedSchedule, setSavedSchedule] = useState(() => ({
    timezone: canonicalStoreTimezone(store.fuso),
    hours: parseWeekHours(store.horas),
  }));
  const [timezone, setTimezone] = useState(savedSchedule.timezone);
  const [hours, setHours] = useState<StoreWeekHours>(savedSchedule.hours);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const scheduleDirty =
    timezone !== savedSchedule.timezone || JSON.stringify(hours) !== JSON.stringify(savedSchedule.hours);

  const [savedCostsTxt, setSavedCostsTxt] = useState(() => custosParaTexto(store.custos ?? EMPTY_STORE_COSTS));
  const [custosTxt, setCustosTxt] = useState(savedCostsTxt);
  const [costTables, setCostTables] = useState<CostTable[]>([]);
  const [savedCostTable, setSavedCostTable] = useState<number | null>(store.costTableId ?? null);
  const [costTable, setCostTable] = useState<number | null>(savedCostTable);
  const [savingOperation, setSavingOperation] = useState(false);
  const [syncingTables, setSyncingTables] = useState(false);
  const costsDirty = JSON.stringify(custosTxt) !== JSON.stringify(savedCostsTxt);
  const costTableDirty = costTable !== savedCostTable;
  const operationDirty = costsDirty || costTableDirty;

  useEffect(() => {
    if (!showCosts) return;
    let cancelled = false;
    void fetchCostTables().then((list) => {
      if (!cancelled) setCostTables(list);
    });
    return () => {
      cancelled = true;
    };
  }, [showCosts]);

  const [savedShifts, setSavedShifts] = useState<StoreShift[]>([]);
  const [shifts, setShifts] = useState<ShiftDraft[]>([]);
  const [savingShifts, setSavingShifts] = useState(false);
  const shiftsDirty = JSON.stringify(shifts.map(draftToShift)) !== JSON.stringify(savedShifts);
  const [sellerShift, setSellerShiftState] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    void fetchStoreShifts(tenantId, store.id).then((list) => {
      if (cancelled) return;
      setSavedShifts(list);
      setShifts(list.map(shiftToDraft));
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, store.id]);

  function addShift() {
    const last = shifts[shifts.length - 1];
    const start = last?.end ?? "09:00";
    const end = TIME_OPTS.find((t) => t > start) ?? start;
    setShifts([...shifts, { key: crypto.randomUUID(), name: "", start, end }]);
  }

  function changeShift(key: string, patch: Partial<ShiftDraft>) {
    setShifts(shifts.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  async function saveShifts() {
    const nomes = new Set<string>();
    for (const s of shifts) {
      const nome = s.name.trim();
      if (!nome) return show("Dê um nome para cada turno.", "danger");
      if (nomes.has(nome.toLowerCase())) return show(`Turno "${nome}" repetido.`, "danger");
      nomes.add(nome.toLowerCase());
      if (s.start >= s.end) return show(`${nome}: início deve ser antes do fim.`, "danger");
    }
    setSavingShifts(true);
    const ok = await run(async () => {
      const keep = new Set(shifts.map((s) => s.id).filter(Boolean));
      for (const old of savedShifts) {
        if (keep.has(old.id)) continue;
        const r = await deleteStoreShift(old.id);
        if (!r.ok) return r;
      }
      for (const s of shifts) {
        const antes = savedShifts.find((x) => x.id === s.id);
        if (antes && JSON.stringify(antes) === JSON.stringify(draftToShift(s))) continue;
        const r = await saveStoreShift({ tenantId, storeId: store.id, shift: draftToShift(s) });
        if (!r.ok) return r;
      }
      return { ok: true };
    });
    const list = await fetchStoreShifts(tenantId, store.id);
    setSavedShifts(list);
    setShifts(list.map(shiftToDraft));
    setSavingShifts(false);
    if (ok) {
      // Turno excluído → vendedoras dele ficam sem turno no banco; recarrega a equipe.
      setSellerShiftState({});
      onSellersSynced();
    }
  }

  async function changeSellerShift(sellerId: string, shiftId: string | null) {
    const antes = sellerShift[sellerId];
    setSellerShiftState((m) => ({ ...m, [sellerId]: shiftId }));
    const r = await setSellerShift(sellerId, shiftId);
    if (!r.ok) {
      setSellerShiftState((m) => {
        const next = { ...m };
        if (antes === undefined) delete next[sellerId];
        else next[sellerId] = antes;
        return next;
      });
      show(`Não foi possível trocar o turno: ${r.error}`, "danger");
    }
  }

  const sellerColumns = useMemo<DataTableColumn<StoreSeller>[]>(
    () => [
      ...SELLER_COLUMNS,
      {
        key: "shift",
        header: "Turno",
        render: (v) => {
          const atual = v.id in sellerShift ? sellerShift[v.id] : v.shiftId;
          return (
            <Select
              className="h-9! min-w-[150px]"
              value={atual ?? ""}
              disabled={!canEdit || savedShifts.length === 0}
              onChange={(e) => void changeSellerShift(v.id, e.target.value || null)}
              aria-label={`Turno de ${v.name}`}
            >
              <option value="">{savedShifts.length === 0 ? "Cadastre um turno" : "Sem turno"}</option>
              {savedShifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {titleName(s.name)} · {s.start}–{s.end}
                </option>
              ))}
            </Select>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedShifts, sellerShift, canEdit],
  );

  async function run(task: () => Promise<SaveResult>): Promise<boolean> {
    const r = await task().catch(
      (e: unknown): SaveResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    if (!r.ok) {
      show(`Não foi possível salvar: ${r.error}`, "danger");
      return false;
    }
    onSaved();
    show("Alterações salvas.", "success");
    return true;
  }

  async function saveSchedule() {
    const invalid = DOWS.find((d) => {
      const day = hours[d];
      return day != null && day.open >= day.close;
    });
    if (invalid != null) {
      show(`${DOW_LABELS[invalid]}: abertura deve ser antes do fechamento.`, "danger");
      return;
    }
    setSavingSchedule(true);
    const ok = await run(() => updateStoreSchedule({ storeId: store.id, timezone, hours }));
    setSavingSchedule(false);
    if (ok) setSavedSchedule({ timezone, hours });
  }

  function resetSchedule() {
    setTimezone(savedSchedule.timezone);
    setHours(savedSchedule.hours);
  }

  function changeHours(next: StoreWeekHours) {
    setHours(next);
  }

  function toggleDow(d: Dow) {
    const next = { ...hours };
    if (next[d]) {
      next[d] = null;
    } else {
      const template = DOWS.map((x) => hours[x]).find((x) => x != null) ?? { open: "09:00", close: "21:00" };
      next[d] = { ...template };
    }
    changeHours(next);
  }

  function setDayTime(d: Dow, field: "open" | "close", value: string) {
    const cur = hours[d];
    if (!cur) return;
    changeHours({ ...hours, [d]: { ...cur, [field]: value } });
  }

  function copyToAll(from: Dow) {
    const src = hours[from];
    if (!src) return;
    const next = { ...hours };
    for (const d of DOWS) if (next[d]) next[d] = { ...src };
    changeHours(next);
  }

  /** Percentuais + tabela de custo num botão só. Tabela nova busca os preços no ERP antes; falhou = nada é gravado. */
  async function saveOperation() {
    const custos = parseCosts(custosTxt, store.custos ?? EMPTY_STORE_COSTS);
    if (!custos) {
      show("Confira os percentuais: use valores entre 0 e 100 (ex.: 5 ou 2,5).", "danger");
      return;
    }
    setSavingOperation(true);
    if (costTableDirty && costTable != null) {
      const prices = await syncProductsNow({ scope: "table", tableId: costTable });
      if (!prices.ok) {
        setSavingOperation(false);
        show(prices.message, "danger");
        return;
      }
    }
    const ok = await run(async () => {
      if (costsDirty) {
        const r = await updateStoreCosts(store.id, custos);
        if (!r.ok) return r;
      }
      if (costTableDirty) return updateStoreCostTable(store.id, costTable);
      return { ok: true };
    });
    setSavingOperation(false);
    if (ok) {
      const txt = custosParaTexto(custos);
      setSavedCostsTxt(txt);
      setCustosTxt(txt);
      setSavedCostTable(costTable);
    }
  }

  function resetOperation() {
    setCustosTxt(savedCostsTxt);
    setCostTable(savedCostTable);
  }

  async function atualizarTabelas() {
    setSyncingTables(true);
    const r = await syncProductsNow({ scope: "tables" });
    if (r.ok) setCostTables(await fetchCostTables());
    setSyncingTables(false);
    if (!r.ok) {
      show(r.message, "danger");
      return;
    }
    show("Tabelas de custo atualizadas.", "success");
  }

  const copySource = DOWS.find((d) => hours[d] != null);

  const pctField = (k: PctKey, label: string, hint?: string) => (
    <FormField label={label} hint={hint}>
      <div className="relative">
        <Input
          inputMode="decimal"
          placeholder="0"
          value={custosTxt[k]}
          disabled={!canEdit}
          onChange={(e) => setCustosTxt((p) => ({ ...p, [k]: e.target.value }))}
          className="pr-8"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-t2">%</span>
      </div>
    </FormField>
  );

  return (
    <div>
      <DetailHeader nome={store.fantasia} onBack={onBack} />

      <div className="flex max-w-[720px] flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Funcionamento</CardTitle>
          </CardHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveSchedule();
            }}
          >
            <FormField
              label="Fuso horário"
              hint={(() => {
                const tz = STORE_TIMEZONES.find((t) => t.value === timezone);
                return tz ? `Vale para: ${tz.states}` : undefined;
              })()}
            >
              <Select value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!canEdit}>
                {!STORE_TIMEZONES.some((t) => t.value === timezone) && <option value={timezone}>{timezone}</option>}
                {STORE_TIMEZONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Horário">
              <div>
                {DOWS.map((d) => {
                  const day = hours[d];
                  return (
                    <Fragment key={d}>
                      <div className="flex min-h-[44px] items-center gap-2 py-1 sm:gap-3">
                        <span className="w-9 shrink-0 text-[13px] font-semibold text-t0 sm:w-28">
                          <span className="sm:hidden">{DOW_LABELS[d].slice(0, 3)}</span>
                          <span className="hidden sm:inline">{DOW_LABELS[d]}</span>
                        </span>
                        <div className={cn("shrink-0 sm:w-[92px]", !canEdit && "pointer-events-none opacity-60")}>
                          <Switch
                            checked={day != null}
                            onChange={() => toggleDow(d)}
                            label={
                              <span className={cn("text-t2", day && "hidden sm:inline")}>
                                {day ? "Aberto" : "Fechado"}
                              </span>
                            }
                          />
                        </div>
                        {day && (
                          <>
                            <TimeSelect
                              value={day.open}
                              disabled={!canEdit}
                              onChange={(v) => setDayTime(d, "open", v)}
                            />
                            <span className="text-t2">–</span>
                            <TimeSelect
                              value={day.close}
                              disabled={!canEdit}
                              onChange={(v) => setDayTime(d, "close", v)}
                            />
                          </>
                        )}
                      </div>
                      {canEdit && d === copySource && (
                        <button
                          type="button"
                          onClick={() => copyToAll(d)}
                          className="mb-1 pl-[96px] text-left text-[12.5px] font-semibold text-acc hover:underline sm:pl-[228px]"
                        >
                          Copiar para os outros dias abertos
                        </button>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </FormField>
            {canEdit && (
              <FormActions
                dirty={scheduleDirty}
                saving={savingSchedule}
                onReset={resetSchedule}
              />
            )}
          </form>
        </Card>

        {showCosts && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Configuração da operação</CardTitle>
              <CardSubtitle>Parâmetros utilizados pelo WeDash para calcular custos, margens e resultados da operação.</CardSubtitle>
            </div>
          </CardHeader>
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void saveOperation();
            }}
          >
            <OperationSection title="Franquia">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {pctField("royaltiesWepinkPct", store.temWpink ? "Royalties WEPINK" : "Royalties")}
                {pctField("marketingWepinkPct", store.temWpink ? "Taxa de marketing WEPINK" : "Taxa de marketing")}
                {store.temWpink && pctField("royaltiesWpinkPct", "Royalties WPINK")}
                {store.temWpink && pctField("marketingWpinkPct", "Taxa de marketing WPINK")}
              </div>
            </OperationSection>

            <OperationSection title="Aluguel">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {pctField("rentPct", "Aluguel percentual", "Sobre o faturamento total")}
              </div>
            </OperationSection>

            <OperationSection
              title="Produtos e impostos"
              action={
                canEdit ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void atualizarTabelas()}
                    disabled={syncingTables}
                    title="Busca no Millennium a lista de tabelas de custo"
                    icon={syncingTables ? undefined : <RefreshIcon />}
                  >
                    {syncingTables ? "Atualizando…" : "Atualizar tabelas"}
                  </Button>
                ) : undefined
              }
            >
              <div className="flex flex-col gap-4">
                <FormField
                  label="Tabela de custo dos produtos"
                  hint="Usada quando o Millennium traz um produto vendido sem custo. Escolhida automaticamente pela tabela mais próxima dos custos da loja."
                >
                  <Select
                    value={costTable == null ? "" : String(costTable)}
                    disabled={!canEdit || (costTables.length === 0 && costTable == null)}
                    onChange={(e) => setCostTable(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">{costTables.length === 0 ? "Aguardando sincronização" : "Nenhuma"}</option>
                    {costTable != null && !costTables.some((t) => t.id === costTable) && (
                      <option value={String(costTable)}>Tabela {costTable}</option>
                    )}
                    {costTables.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.code} · {t.description}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {pctField("icmsPct", "ICMS", "Sobre o faturamento")}
                  {pctField("icmsStPct", "ICMS ST", "Sobre o custo dos produtos (CMV)")}
                </div>
              </div>
            </OperationSection>

            {canEdit && <FormActions dirty={operationDirty} saving={savingOperation} onReset={resetOperation} />}
          </form>
        </Card>
        )}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Turnos</CardTitle>
              <CardSubtitle>Defina o turno de cada pessoa na Equipe abaixo</CardSubtitle>
            </div>
          </CardHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveShifts();
            }}
          >
            {shifts.length === 0 ? (
              <EmptyState
                framed={false}
                className="py-4!"
                icon="🕒"
                title="Nenhum turno cadastrado"
                description="Crie os turnos da loja para definir o turno de cada pessoa da equipe."
                action={
                  canEdit ? (
                    <Button type="button" size="sm" icon={<Icon d={icons.plus} size={14} />} onClick={addShift}>
                      Adicionar turno
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="flex flex-col gap-2.5">
                {shifts.map((s) => (
                  <div key={s.key} className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
                    <Input
                      className="h-9! min-w-0 flex-1 basis-full sm:basis-auto"
                      placeholder="Nome (ex.: Manhã)"
                      value={s.name}
                      disabled={!canEdit}
                      onChange={(e) => changeShift(s.key, { name: e.target.value })}
                      aria-label="Nome do turno"
                    />
                    <TimeSelect value={s.start} disabled={!canEdit} onChange={(v) => changeShift(s.key, { start: v })} />
                    <span className="text-t2">–</span>
                    <TimeSelect value={s.end} disabled={!canEdit} onChange={(v) => changeShift(s.key, { end: v })} />
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setShifts(shifts.filter((x) => x.key !== s.key))}
                        aria-label={`Excluir turno ${s.name || ""}`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-t2 hover:bg-bg-3 hover:text-bad"
                      >
                        <Icon d={icons.trash} size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canEdit && shifts.length > 0 && (
              <button
                type="button"
                onClick={addShift}
                className="flex items-center gap-1.5 self-start text-[12.5px] font-semibold text-acc hover:underline"
              >
                <Icon d={icons.plus} size={14} />
                Adicionar turno
              </button>
            )}
            {canEdit && (shifts.length > 0 || shiftsDirty) && (
              <FormActions
                dirty={shiftsDirty}
                saving={savingShifts}
                onReset={() => setShifts(savedShifts.map(shiftToDraft))}
              />
            )}
          </form>
        </Card>

        <Card padding="none">
          <CardHeader className="mb-0 px-5 pt-5 pb-4">
            <div>
              <CardTitle>Equipe</CardTitle>
              <CardSubtitle>Sincronizada do Millennium</CardSubtitle>
            </div>
            {canEdit && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void atualizarVendedoras()}
                disabled={syncingSellers}
                title="Busca a equipe de vendas desta loja no Millennium"
                icon={syncingSellers ? undefined : <RefreshIcon />}
              >
                {syncingSellers ? "Atualizando…" : "Atualizar"}
              </Button>
            )}
          </CardHeader>
          <div className="px-5 pb-4">
            <Segmented
              options={[
                { value: "ativos", label: `Ativos (${ativos.length})` },
                { value: "desligados", label: `Desligados (${desligados.length})` },
              ]}
              value={teamTab}
              onChange={(v) => v && setTeamTab(v)}
            />
          </div>
          {!equipeLoaded ? (
            <TeamTableSkeleton withShift={teamTab === "ativos"} />
          ) : teamRows.length === 0 ? (
            teamTab === "ativos" ? (
              <EmptyState
                framed={false}
                className="pt-4!"
                icon="👥"
                title="Ninguém na equipe"
                description="A equipe vem do Millennium. Use Atualizar para buscar as pessoas desta loja."
              />
            ) : (
              <EmptyState
                framed={false}
                className="pt-4!"
                icon="👥"
                title="Nenhum desligado"
                description="Pessoas desativadas no Millennium aparecem aqui."
              />
            )
          ) : (
            <DataTable
              className="rounded-none! border-x-0! border-b-0! bg-transparent!"
              columns={teamTab === "ativos" ? sellerColumns : SELLER_COLUMNS}
              data={teamRows}
              rowKey={(v) => v.id}
              paginate="pessoas"
            />
          )}
        </Card>
      </div>
    </div>
  );
}

/** Grupo do card Configuração da operação: título + ação opcional, divisória entre grupos. */
function OperationSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h3 className="text-[13px] font-bold text-t0">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function FormActions({ dirty, saving, onReset }: { dirty: boolean; saving: boolean; onReset: () => void }) {
  return (
    <div className="flex gap-2.5 pt-1">
      <Button variant="outline" type="button" onClick={onReset} disabled={!dirty || saving}>
        Resetar
      </Button>
      <Button type="submit" disabled={!dirty || saving}>
        {saving ? "Salvando…" : "Salvar alterações"}
      </Button>
    </div>
  );
}

const SELLER_COLUMNS: DataTableColumn<StoreSeller>[] = [
  {
    key: "seller",
    header: "Nome",
    render: (v) => (
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={v.name} />
        <span className="truncate text-[13.5px] font-bold text-t0">{v.name}</span>
      </div>
    ),
  },
  {
    key: "code",
    header: "Código ERP",
    render: (v) => <span className="tabular-nums text-t1">{v.code || "—"}</span>,
  },
  {
    key: "status",
    header: "Status",
    render: (v) =>
      v.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="neutral">Desligado</Badge>,
  },
];

function RefreshIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

function TimeSelect({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      className="h-9! w-[80px]! bg-[position:right_0.45rem_center]! pl-2.5! pr-7! sm:w-[96px]! sm:pl-3.5! sm:pr-8!"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {TIME_OPTS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </Select>
  );
}
export default StoreDetailPage;
