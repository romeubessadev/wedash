import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Breadcrumbs,
  Button,
  Card,
  CardHeader,
  CardTitle,
  DatePicker,
  FormField,
  Input,
  Segmented,
  Select,
  Switch,
  useToast,
} from "@/components/ui";
import { ChallengeEditorSkeleton } from "@/components/wedash/LoadingSkeletons";
import { ProductNameCell } from "@/components/wedash/ProductNameCell";
import {
  challengeFormToInput,
  challengeToForm,
  emptyChallengeForm,
  emptyPrize,
  MAX_PODIUM,
  usesMinSales,
  validateChallengeForm,
  type ChallengeForm,
  type ChallengeFormErrors,
  type PrizeForm,
} from "@/data/wedash/challengeForm";
import {
  fetchChallenge,
  fetchChallengeCatalog,
  PRIZE_LABEL_MAX,
  saveChallenge,
  usesScope,
  type ChallengeCatalog,
  type ChallengeMetric,
  type ChallengeMode,
  type ChallengeScope,
} from "@/data/wedash/challengesRepo";
import { copyChallenge } from "@/data/wedash/challengeView";
import { storesForSession } from "@/data/wedash/stores";
import { cn } from "@/lib/cn";
import { useMinSkeleton } from "@/lib/useMinSkeleton";
import { EmptyBlock } from "@/pages/dashboard/EmptyBlock";
import { useScope } from "@/pages/dashboard/useScope";
import { NumberInput, SAVE_ERROR_MSG } from "@/pages/operation/shared";
import { Icon, icons } from "@/pages/users/Icons";
import { paths } from "@/router/paths";
import { useActiveSession } from "@/session/SessionProvider";

const METRIC_HELP: Record<ChallengeMetric, string> = {
  QUANTITY: "Itens vendidos por cada pessoa no período.",
  VALUE: "Valor vendido por cada pessoa no período.",
  PA: "Itens por venda de cada pessoa no período.",
  TICKET: "Valor médio por venda (faturamento ÷ número de vendas) de cada pessoa no período.",
};

const SCOPE_HELP: Record<ChallengeScope, string> = {
  PRODUCTS: "Só os produtos escolhidos (todas as cores e tamanhos de cada código).",
  CATEGORIES: "Só os produtos das categorias escolhidas.",
  ALL: "Tudo o que a pessoa vender no período.",
};

const MODE_HELP: Record<ChallengeMode, string> = {
  CONTEST: "Ganha quem fizer mais. Empate leva o prêmio da posição e a posição seguinte é pulada.",
  MINIMUM: "Ganha todo mundo que chegar ao mínimo.",
};

const MIN_LABEL: Record<ChallengeMetric, string> = {
  QUANTITY: "Quantidade mínima",
  VALUE: "Valor mínimo",
  PA: "P.A. mínimo",
  TICKET: "Ticket médio mínimo",
};

const MANAGER_TARGET_HELP: Record<ChallengeMetric, string> = {
  QUANTITY: "Média de itens por pessoa: total da equipe ÷ pessoas do desafio (inclui quem não vendeu).",
  VALUE: "Média vendida por pessoa: total da equipe ÷ pessoas do desafio (inclui quem não vendeu).",
  PA: "P.A. da equipe toda: total de itens ÷ total de vendas.",
  TICKET: "Ticket médio da equipe toda: faturamento ÷ total de vendas.",
};

const PODIUM_LABEL = ["Prêmio do 1º lugar", "Prêmio do 2º lugar", "Prêmio do 3º lugar"];

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR");

/** Gestão > Desafios — criar, editar e duplicar (`?copy=`). */
export default function ChallengeEditorPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const copyId = id ? null : searchParams.get("copy");
  const navigate = useNavigate();
  const session = useActiveSession();
  const toast = useToast();
  const titulo = id ? "Editar desafio" : "Novo desafio";
  const voltar = () => navigate(id ? paths.management.challengeDetail(id) : paths.management.challenges);

  const { escopo } = useScope();
  const lojas = useMemo(() => storesForSession(session.stores), [session.stores]);
  const lojaFiltro = escopo.filialIds[0];
  const [form, setForm] = useState<ChallengeForm>(() =>
    emptyChallengeForm(lojaFiltro ?? (lojas.length === 1 ? lojas[0]!.id : "")),
  );
  const set = (patch: Partial<ChallengeForm>) => setForm((f) => ({ ...f, ...patch }));
  useEffect(() => {
    if (!id && lojaFiltro) setForm((f) => ({ ...f, storeId: lojaFiltro }));
  }, [id, lojaFiltro]);
  /** Loja já definida (StorePicker numa loja, usuário de 1 loja ou edição): sem combo, a loja vai abaixo do título. */
  const lojaFixa = Boolean(id) || Boolean(lojaFiltro) || lojas.length === 1;
  const lojaAtual = lojas.find((l) => l.id === form.storeId);

  const sourceId = id ?? copyId;
  const [loadingSource, setLoadingSource] = useState(Boolean(sourceId));
  const [notFound, setNotFound] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  useEffect(() => {
    if (!sourceId) return;
    let cancelled = false;
    setLoadingSource(true);
    void fetchChallenge(session.tenantId, sourceId).then((c) => {
      if (cancelled) return;
      if (!c) setNotFound(true);
      else if (copyId) {
        setForm({ ...challengeToForm(copyChallenge(c)), storeId: lojaFiltro ?? c.storeId });
        setCopiedFrom(c.name);
      } else setForm(challengeToForm(c));
      setLoadingSource(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a loja do filtro só vale no momento em que a cópia abre
  }, [sourceId, copyId, session.tenantId]);
  const showSkeleton = useMinSkeleton(loadingSource);

  const [catalog, setCatalog] = useState<ChallengeCatalog | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchChallengeCatalog().then((c) => {
      if (!cancelled) setCatalog(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Erros só aparecem depois da 1ª tentativa de salvar; daí somem conforme o campo é corrigido. */
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors: ChallengeFormErrors = tried ? validateChallengeForm(form) : {};
  const submit = async () => {
    setTried(true);
    if (Object.keys(validateChallengeForm(form)).length > 0) {
      toast.show("Revise os campos destacados.", "danger");
      return;
    }
    setSaving(true);
    const res = await saveChallenge(session.tenantId, id ?? null, challengeFormToInput(form));
    setSaving(false);
    if (!res.ok) {
      toast.show(SAVE_ERROR_MSG, "danger");
      return;
    }
    toast.show(id ? "Alterações salvas." : "Desafio criado.", "success");
    navigate(paths.management.challengeDetail(res.id));
  };

  const setMetric = (metric: ChallengeMetric) =>
    setForm((f) =>
      f.metric === metric
        ? f
        : { ...f, metric, target: "", managerTarget: "", minSales: usesMinSales(metric) && !f.minSales.trim() ? "10" : f.minSales },
    );
  const setPrize = (i: number, p: PrizeForm) => setForm((f) => ({ ...f, prizes: f.prizes.map((x, j) => (j === i ? p : x)) }));

  const header = (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" icon={<Icon d={icons.arrowLeft} size={14} />} onClick={voltar}>
          Voltar
        </Button>
        <Breadcrumbs
          items={[{ label: "Gestão" }, { label: "Desafios", to: paths.management.challenges }, { label: titulo }]}
        />
      </div>
      <div className="mb-5">
        <h1 className="text-[22px] font-extrabold tracking-tight text-t0">{titulo}</h1>
        {((lojaFixa && lojaAtual) || copiedFrom) && (
          <p className="mt-1 text-[13px] text-t2">
            {lojaFixa && lojaAtual && (
              <>
                Loja: <span className="font-semibold text-t1">{lojaAtual.fantasia}</span>
                {" · "}Filial {lojaAtual.codFilial}
              </>
            )}
            {lojaFixa && lojaAtual && copiedFrom && " · "}
            {copiedFrom && (
              <>
                Cópia de <span className="font-semibold text-t1">{copiedFrom}</span>
              </>
            )}
          </p>
        )}
      </div>
    </>
  );

  if (notFound) {
    return (
      <div>
        {header}
        <Card className="flex min-h-[280px] flex-col">
          <EmptyBlock
            icon="🔍"
            title="Desafio não encontrado"
            description="O desafio pode ter sido excluído."
            action={
              <Button size="sm" variant="outline" onClick={() => navigate(paths.management.challenges)}>
                Voltar para Desafios
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  if (showSkeleton) {
    return (
      <div>
        {header}
        <ChallengeEditorSkeleton />
      </div>
    );
  }

  const usaVendas = usesMinSales(form.metric);
  const usaEscopo = usesScope(form.metric);
  const podio = form.mode === "CONTEST" ? form.prizes.slice(0, MAX_PODIUM) : form.prizes.slice(0, 1);

  return (
    <div>
      {header}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Informações gerais</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <FormField label="Nome do desafio" required error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Ex.: Body Splash — quem vender mais"
              maxLength={80}
              className={errors.name ? "border-bad!" : undefined}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Data de início" required error={errors.startsOn}>
              <DatePicker
                value={form.startsOn}
                onChange={(d) => set({ startsOn: d, ...(form.endsOn && form.endsOn < d ? { endsOn: null } : {}) })}
                invalid={Boolean(errors.startsOn)}
                aria-label="Data de início"
              />
            </FormField>
            <FormField label="Data de fim" required error={errors.endsOn}>
              <DatePicker
                value={form.endsOn}
                onChange={(d) => set({ endsOn: d })}
                minDate={form.startsOn}
                invalid={Boolean(errors.endsOn)}
                aria-label="Data de fim"
              />
            </FormField>
          </div>
          {!lojaFixa && (
            <FormField label="Loja" required error={errors.storeId}>
              <Select
                value={form.storeId}
                onChange={(e) => set({ storeId: e.target.value })}
                className={cn(!form.storeId && "text-t2", errors.storeId && "border-bad!")}
              >
                {!form.storeId && <option value="">Selecione a loja</option>}
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.fantasia} · Filial {l.codFilial}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tipo de desafio</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <FormField label="Tipo" required>
            <Segmented<ChallengeMetric>
              options={[
                { value: "QUANTITY", label: "Quantidade" },
                { value: "VALUE", label: "Valor" },
                { value: "PA", label: "P.A." },
                { value: "TICKET", label: "Ticket médio" },
              ]}
              value={form.metric}
              onChange={(v) => v && setMetric(v)}
            />
            <p className="mt-1.5 text-[11.5px] text-t2">{METRIC_HELP[form.metric]}</p>
          </FormField>
          {usaEscopo && (
            <FormField label="O que conta" required>
              <Segmented<ChallengeScope>
                options={[
                  { value: "PRODUCTS", label: "Produtos escolhidos" },
                  { value: "CATEGORIES", label: "Categorias escolhidas" },
                  { value: "ALL", label: "Tudo o que vender" },
                ]}
                value={form.scope}
                onChange={(v) => v && set({ scope: v })}
              />
              <p className="mt-1.5 text-[11.5px] text-t2">{SCOPE_HELP[form.scope]}</p>
            </FormField>
          )}
          {usaEscopo && form.scope === "PRODUCTS" && (
            <ProductPicker
              catalog={catalog}
              selected={form.products}
              onChange={(products) => set({ products })}
              error={errors.products}
            />
          )}
          {usaEscopo && form.scope === "CATEGORIES" && (
            <CategoryPicker
              catalog={catalog}
              selected={form.categories}
              onChange={(categories) => set({ categories })}
              error={errors.categories}
            />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Premiação</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <FormField label="Quem ganha" required>
            <Segmented<ChallengeMode>
              options={[
                { value: "CONTEST", label: "Quem fizer mais" },
                { value: "MINIMUM", label: "Quem chegar ao mínimo" },
              ]}
              value={form.mode}
              onChange={(v) => v && set({ mode: v })}
            />
            <p className="mt-1.5 text-[11.5px] text-t2">{MODE_HELP[form.mode]}</p>
          </FormField>
          <div className="flex flex-col gap-4">
            <FormField
              label={MIN_LABEL[form.metric]}
              required={form.mode === "MINIMUM"}
              error={errors.target}
              hint={
                form.mode === "MINIMUM"
                  ? "Quem chegar a esse valor no período ganha o prêmio."
                  : "Opcional. Abaixo dele a pessoa não leva prêmio, mesmo em 1º lugar."
              }
            >
              <TargetInput metric={form.metric} value={form.target} onChange={(target) => set({ target })} invalid={Boolean(errors.target)} />
            </FormField>
            {usaVendas && (
              <FormField
                label="Vendas mínimas para participar"
                required
                error={errors.minSales}
                hint="Quem tiver menos vendas no período não concorre ao prêmio."
              >
                <Input
                  inputMode="numeric"
                  value={form.minSales}
                  onChange={(e) => set({ minSales: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                  className={errors.minSales ? "border-bad!" : undefined}
                  aria-label="Vendas mínimas para participar"
                />
              </FormField>
            )}
          </div>

          {podio.map((p, i) => (
            <FormField
              key={i}
              label={form.mode === "MINIMUM" ? "Prêmio por pessoa" : PODIUM_LABEL[i]}
              required
              error={errors.prizes?.[i]}
            >
              <div className="flex items-start gap-2">
                <PrizeField prize={p} onChange={(np) => setPrize(i, np)} invalid={Boolean(errors.prizes?.[i])} />
                {form.mode === "CONTEST" && i > 0 && i === podio.length - 1 && (
                  <button
                    type="button"
                    onClick={() => set({ prizes: form.prizes.slice(0, i) })}
                    aria-label={`Remover ${i + 1}º lugar`}
                    className="mt-10 grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-vela-md)] text-t2 transition-colors hover:bg-bad-soft hover:text-bad"
                  >
                    <Icon d={icons.trash} size={15} />
                  </button>
                )}
              </div>
            </FormField>
          ))}
          {form.mode === "CONTEST" && podio.length < MAX_PODIUM && (
            <div>
              <Button
                variant="secondary"
                size="sm"
                icon={<Icon d={icons.plus} size={14} />}
                onClick={() => set({ prizes: [...podio, emptyPrize()] })}
              >
                Adicionar {podio.length + 1}º lugar
              </Button>
            </div>
          )}

          <Divider />
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12.5px] font-bold text-t0">Prêmio da gerência</p>
              <Switch
                checked={form.managerOn}
                onChange={(v) =>
                  set(v && !form.managerTarget.trim() ? { managerOn: v, managerTarget: form.target } : { managerOn: v })
                }
              />
            </div>
            <p className="mt-1.5 text-[11.5px] text-t2">A gerência ganha se a equipe chegar à meta da gerência.</p>
            {form.managerOn && (
              <div className="mt-3 flex flex-col gap-4">
                <FormField
                  label="Meta da gerência"
                  required
                  error={errors.managerTarget}
                  hint={MANAGER_TARGET_HELP[form.metric]}
                >
                  <TargetInput
                    metric={form.metric}
                    value={form.managerTarget}
                    onChange={(managerTarget) => set({ managerTarget })}
                    invalid={Boolean(errors.managerTarget)}
                  />
                </FormField>
                <FormField label="Prêmio da gerência" required error={errors.managerPrize}>
                  <PrizeField
                    prize={form.managerPrize}
                    onChange={(managerPrize) => set({ managerPrize })}
                    invalid={Boolean(errors.managerPrize)}
                  />
                </FormField>
              </div>
            )}
          </div>
        </div>
      </Card>
      </div>

      <div className="mt-5 flex justify-end gap-2.5">
        <Button variant="outline" onClick={voltar}>
          Cancelar
        </Button>
        <Button onClick={() => void submit()} disabled={saving}>
          {saving ? "Salvando…" : id ? "Salvar alterações" : "Criar desafio"}
        </Button>
      </div>
    </div>
  );
}

const Divider = () => <div className="border-t border-line" />;

/** Mínimo na unidade do tipo: itens (inteiro), P.A. (2 casas) ou R$. */
function TargetInput({
  metric,
  value,
  onChange,
  invalid,
}: {
  metric: ChallengeMetric;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
}) {
  if (metric === "TICKET" || metric === "VALUE")
    return (
      <NumberInput
        value={value}
        onChange={onChange}
        unit="R$"
        invalid={invalid}
        aria-label={metric === "TICKET" ? "Valor do ticket médio" : "Valor vendido"}
      />
    );
  const itens = metric === "QUANTITY";
  return (
    <div className="relative">
      <Input
        inputMode={itens ? "numeric" : "decimal"}
        placeholder={itens ? "0" : "0,00"}
        value={value}
        onChange={(e) => onChange(itens ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value.replace(/[^\d,]/g, "").slice(0, 6))}
        className={cn(itens && "pr-12", invalid && "border-bad!")}
        aria-label={itens ? "Quantidade de itens" : "P.A."}
      />
      {itens && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-t2">itens</span>
      )}
    </div>
  );
}

/** Prêmio: valor em R$ ou descrição livre ("Combo KFC"). */
function PrizeField({ prize, onChange, invalid }: { prize: PrizeForm; onChange: (p: PrizeForm) => void; invalid: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <Segmented<PrizeForm["kind"]>
        options={[
          { value: "MONEY", label: "Valor em R$" },
          { value: "ITEM", label: "Prêmio" },
        ]}
        value={prize.kind}
        onChange={(v) => v && onChange({ ...prize, kind: v })}
      />
      {prize.kind === "MONEY" ? (
        <NumberInput value={prize.amount} onChange={(amount) => onChange({ ...prize, amount })} unit="R$" invalid={invalid} aria-label="Valor do prêmio" />
      ) : (
        <Input
          value={prize.label}
          onChange={(e) => onChange({ ...prize, label: e.target.value })}
          placeholder="Ex.: Combo KFC"
          maxLength={PRIZE_LABEL_MAX}
          className={invalid ? "border-bad!" : undefined}
          aria-label="Descrição do prêmio"
        />
      )}
    </div>
  );
}

function PickerShell({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <FormField label={label} required error={error}>
      {children}
    </FormField>
  );
}

/** Multi-select com tags (padrão Select Components do Vela): escolhidos como tags + busca no catálogo por nome ou código. */
function ProductPicker({
  catalog,
  selected,
  onChange,
  error,
}: {
  catalog: ChallengeCatalog | null;
  selected: { code: string; name: string }[];
  onChange: (v: { code: string; name: string }[]) => void;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const escolhidos = useMemo(() => new Set(selected.map((p) => p.code)), [selected]);
  const resultados = useMemo(() => {
    const q = semAcento(query.trim());
    if (!catalog || !q) return [];
    return catalog.products.filter((p) => !escolhidos.has(p.code) && (semAcento(p.name).includes(q) || semAcento(p.code).includes(q))).slice(0, 8);
  }, [catalog, query, escolhidos]);
  const adicionar = (p: { code: string; name: string }) => {
    onChange([...selected, { code: p.code, name: p.name }]);
    setQuery("");
  };

  return (
    <PickerShell label="Produtos" error={error}>
      <div className="relative">
        <div
          className={cn(
            "flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-[var(--radius-vela-md)] border bg-bg-inset px-2.5 py-1.5 transition-colors",
            error ? "border-bad" : "border-line focus-within:border-acc",
          )}
        >
          {selected.map((p) => (
            <span
              key={p.code}
              title={`${p.code} · ${p.name}`}
              className="flex max-w-full items-center gap-1.5 rounded-lg bg-acc-soft px-2.5 py-1 text-xs font-semibold text-acc"
            >
              <span className="truncate">{p.name}</span>
              <button
                type="button"
                onClick={() => onChange(selected.filter((x) => x.code !== p.code))}
                aria-label={`Remover ${p.name}`}
                className="shrink-0 cursor-pointer"
              >
                <Icon d={icons.x} size={11} />
              </button>
            </span>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && resultados[0]) {
                e.preventDefault();
                adicionar(resultados[0]);
              } else if (e.key === "Backspace" && !query && selected.length > 0) {
                onChange(selected.slice(0, -1));
              }
            }}
            placeholder={!catalog ? "Carregando produtos…" : selected.length > 0 ? "Adicionar produto…" : "Buscar por produto ou código…"}
            disabled={!catalog}
            aria-label="Buscar produto"
            className="h-7 min-w-[120px] flex-1 bg-transparent px-1 text-[13px] text-t0 outline-none placeholder:text-t2"
          />
        </div>
        {query.trim() && catalog && (
          <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-bg-2 p-1 shadow-[var(--shadow-vela)]">
            {resultados.length === 0 ? (
              <p className="px-3 py-2.5 text-[12.5px] text-t2">Nenhum produto encontrado.</p>
            ) : (
              resultados.map((p, i) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => adicionar(p)}
                  className="flex w-full items-center rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-bg-3"
                >
                  <ProductNameCell nome={p.name} idx={i} sub={[p.code, p.category].filter(Boolean).join(" · ")} />
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <p className="mt-1.5 text-[11.5px] text-t2">
          {selected.length} {selected.length === 1 ? "produto escolhido" : "produtos escolhidos"}
        </p>
      )}
    </PickerShell>
  );
}

/** Categorias do catálogo como botões liga/desliga. */
function CategoryPicker({
  catalog,
  selected,
  onChange,
  error,
}: {
  catalog: ChallengeCatalog | null;
  selected: { typeId: number; name: string }[];
  onChange: (v: { typeId: number; name: string }[]) => void;
  error?: string;
}) {
  const escolhidas = new Set(selected.map((c) => c.typeId));
  const opcoes = catalog?.categories ?? [];
  const fora = selected.filter((s) => !opcoes.some((o) => o.typeId === s.typeId));
  return (
    <PickerShell label="Categorias" error={error}>
      {!catalog ? (
        <p className="text-[12.5px] text-t2">Carregando categorias…</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {[...opcoes, ...fora].map((c) => {
            const ativa = escolhidas.has(c.typeId);
            return (
              <button
                key={c.typeId}
                type="button"
                aria-pressed={ativa}
                onClick={() =>
                  onChange(ativa ? selected.filter((s) => s.typeId !== c.typeId) : [...selected, { typeId: c.typeId, name: c.name }])
                }
                className={cn(
                  "h-8 cursor-pointer rounded-[9px] border px-3 text-xs font-semibold transition-colors",
                  ativa ? "border-acc bg-acc-soft text-acc" : "border-line text-t1 hover:border-acc",
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </PickerShell>
  );
}
