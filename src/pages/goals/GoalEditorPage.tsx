import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Avatar,
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
  Skeleton,
  Switch,
  useToast,
} from "@/components/ui";
import {
  fetchGoal,
  fetchGoalTeam,
  saveGoal,
  type GoalGroup,
  type GoalTeamMember,
} from "@/data/wedash/goalsRepo";
import { fetchStoreShifts, storesForSession } from "@/data/wedash/stores";
import { brlCent, deIso, paraIso } from "@/lib/format";
import { cn } from "@/lib/cn";
import { EmptyBlock } from "@/pages/dashboard/EmptyBlock";
import { useScope } from "@/pages/dashboard/useScope";
import {
  NumberInput,
  numText,
  parseNum,
  SAVE_ERROR_MSG,
} from "@/pages/operation/shared";
import { Icon, icons } from "@/pages/users/Icons";
import { paths } from "@/router/paths";
import { useActiveSession } from "@/session/SessionProvider";

/** Grupo da loja (Gestão > Grupos): na meta só muda o % da meta global. */
type GroupRow = {
  key: string;
  name: string;
  pct: string;
  /** Ordem da última edição manual; 0 = % ajustado automaticamente. */
  editedAt: number;
};
/** Nível da comissão progressiva: meta = % da meta a atingir; premiação = % sobre as vendas; bônus = R$ fixo por atingir. */
type TierRow = {
  key: number;
  name: string;
  meta: string;
  commission: string;
  bonus: string;
};
/** Individual = cada pessoa sobre a própria meta (meta do grupo ÷ pessoas); Grupo = o grupo todo sobre a meta do grupo. */
type PrizeMode = "INDIVIDUAL" | "GROUP";

type TierErrors = { meta?: string; commission?: string };
type FormErrors = {
  name?: string;
  startsOn?: string;
  endsOn?: string;
  storeId?: string;
  target?: string;
  groups?: string;
  /** Por `TierRow.key`. */
  tiers?: Record<number, TierErrors>;
};

const REQUIRED = "Campo obrigatório.";

/** Erros do formulário; objeto vazio = pode salvar. */
function validateGoal(f: {
  name: string;
  startsOn: Date | null;
  endsOn: Date | null;
  storeId: string;
  target: number | null;
  groupsOn: boolean;
  groups: GroupRow[] | null;
  tiersOn: boolean;
  tiers: TierRow[];
}): FormErrors {
  const e: FormErrors = {};
  if (!f.name.trim()) e.name = REQUIRED;
  if (!f.startsOn) e.startsOn = REQUIRED;
  if (!f.endsOn) e.endsOn = REQUIRED;
  else if (f.startsOn && f.endsOn < f.startsOn)
    e.endsOn = "A data fim precisa ser depois da data início.";
  if (!f.storeId) e.storeId = REQUIRED;
  if (f.target == null) e.target = "Informe a meta global.";

  if (f.groupsOn && f.storeId) {
    if (f.groups == null) e.groups = "Aguarde os grupos da loja carregarem.";
    else if (f.groups.length === 0)
      e.groups = "Crie os grupos da loja ou desligue Grupos de distribuição.";
    else {
      const total = f.groups.reduce((s, g) => s + (groupPct(g) ?? 0), 0);
      if (Math.abs(total - 100) >= 0.005)
        e.groups = `A soma dos grupos precisa fechar 100% (está em ${numText(Math.round(total * 10) / 10)}%).`;
    }
  }

  if (f.tiersOn) {
    const tiers: Record<number, TierErrors> = {};
    let anterior: number | null = null;
    for (const t of f.tiers) {
      const te: TierErrors = {};
      const meta = positive(t.meta);
      if (meta == null) te.meta = REQUIRED;
      else if (anterior != null && meta <= anterior)
        te.meta = `Precisa ser maior que o nível anterior (${numText(anterior)}%).`;
      if (positive(t.commission) == null) te.commission = REQUIRED;
      if (te.meta || te.commission) tiers[t.key] = te;
      if (meta != null) anterior = meta;
    }
    if (Object.keys(tiers).length > 0) e.tiers = tiers;
  }
  return e;
}

/** Valor > 0 digitado, ou null. */
function positive(txt: string): number | null {
  const v = parseNum(txt);
  return v != null && !Number.isNaN(v) && v > 0 ? v : null;
}

/** "Atingir", premiação (% sobre o total vendido) e bônus de cada nível sobre uma base (meta global ou meta do grupo). */
function tierResults(
  tiers: TierRow[],
  base: number | null,
): { atingir: number | null; comissao: number | null; bonus: number | null }[] {
  return tiers.map((t) => {
    const m = positive(t.meta);
    const atingir = m != null && base ? (base * m) / 100 : null;
    const c = positive(t.commission);
    const comissao = c != null && atingir != null ? (atingir * c) / 100 : null;
    return { atingir, comissao, bonus: positive(t.bonus) };
  });
}

let groupEditSeq = 1;
/**
 * Grava o % digitado num grupo e distribui o que falta para 100% entre os grupos automáticos
 * (sem edição manual). Sem grupo automático, quem se ajusta é o editado há mais tempo.
 */
function distributeGroups(
  gs: GroupRow[],
  key: string,
  pct: string,
): GroupRow[] {
  const rows = gs.map((g) =>
    g.key === key ? { ...g, pct, editedAt: groupEditSeq++ } : g,
  );
  const outros = rows.filter((g) => g.key !== key);
  if (outros.length === 0) return rows;
  let autos = outros.filter((g) => g.editedAt === 0);
  if (autos.length === 0) {
    const maisAntigo = outros.reduce((a, b) =>
      b.editedAt < a.editedAt ? b : a,
    );
    autos = [maisAntigo];
  }
  const autoKeys = new Set(autos.map((g) => g.key));
  const manual = rows
    .filter((g) => !autoKeys.has(g.key))
    .reduce((s, g) => s + (groupPct(g) ?? 0), 0);
  const resto = Math.max(0, Math.round((100 - manual) * 10));
  const parte = Math.floor(resto / autos.length);
  let sobra = resto - parte * autos.length;
  return rows.map((g) => {
    if (!autoKeys.has(g.key)) return g;
    const decimos = parte + (sobra-- > 0 ? 1 : 0);
    return { ...g, pct: numText(decimos / 10), editedAt: 0 };
  });
}

/** % informado > 0, ou null. */
function groupPct(g: GroupRow): number | null {
  const v = parseNum(g.pct);
  return v != null && !Number.isNaN(v) && v > 0 ? v : null;
}
/** Meta do grupo (R$) = % × meta global. */
function groupTarget(g: GroupRow, target: number | null): number | null {
  const v = groupPct(g);
  return v != null && target ? (target * v) / 100 : null;
}

let nextKey = 1;
const newTier = (index: number, meta = "", commission = ""): TierRow => ({
  key: nextKey++,
  name: `Nível ${index + 1}`,
  meta,
  commission,
  bonus: "",
});

const DEFAULT_TIERS = () => [
  newTier(0, "100", "1,5"),
  newTier(1, "120", "2"),
  newTier(2, "150", "2,5"),
  newTier(3, "180", "3"),
];

/** Gestão > Metas > criar / editar — informações gerais à esquerda; grupos, comissão progressiva e simulação em 3 cards. */
export default function GoalEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = useActiveSession();
  const toast = useToast();
  const titulo = id ? "Editar meta" : "Nova meta";
  const voltar = () => navigate(id ? paths.goalDetail(id) : paths.goals);

  const { escopo } = useScope();
  const lojas = useMemo(
    () => storesForSession(session.stores),
    [session.stores],
  );
  const [storeId, setStoreId] = useState(
    () => escopo.filialIds[0] ?? (lojas.length === 1 ? lojas[0]!.id : ""),
  );
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState<Date | null>(null);
  const [endsOn, setEndsOn] = useState<Date | null>(null);
  const [target, setTarget] = useState("");
  const [groupsOn, setGroupsOn] = useState(false);
  const [tiersOn, setTiersOn] = useState(false);
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [tiers, setTiers] = useState<TierRow[]>(DEFAULT_TIERS);
  const [prizeMode, setPrizeMode] = useState<PrizeMode>("INDIVIDUAL");
  /** % gravado de cada grupo (edição); aplicado quando os grupos da loja carregam. */
  const savedGroups = useRef<GoalGroup[]>([]);
  const applySavedGroups = (rows: GroupRow[]): GroupRow[] =>
    rows.map((r) => {
      const s = savedGroups.current.find((x) => x.shiftId === r.key);
      return s ? { ...r, pct: numText(s.pct), editedAt: groupEditSeq++ } : r;
    });
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void fetchGoal(session.tenantId, id).then((g) => {
      if (cancelled || !g) return;
      setStoreId(g.storeId);
      setName(g.name);
      setStartsOn(deIso(g.startsOn));
      setEndsOn(deIso(g.endsOn));
      setTarget(numText(g.target, "R$"));
      setPrizeMode(g.tierMode);
      if (g.tiers.length > 0) {
        setTiersOn(true);
        setTiers(
          g.tiers.map((t, i) => ({
            ...newTier(i, numText(t.atingimentoMinPct), numText(t.comissaoPct)),
            name: t.nome,
            bonus: t.bonus > 0 ? numText(t.bonus, "R$") : "",
          })),
        );
      }
      savedGroups.current = g.groups;
      if (g.groups.length > 0) {
        setGroupsOn(true);
        setGroups((gs) => gs && applySavedGroups(gs));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, session.tenantId]);

  const [team, setTeam] = useState<GoalTeamMember[] | null>(null);
  useEffect(() => {
    setTeam(null);
    setGroups(null);
    if (!storeId) return;
    let cancelled = false;
    void fetchGoalTeam(session.tenantId, [storeId]).then((t) => {
      if (!cancelled) setTeam(t.filter((m) => m.salesPerson));
    });
    void fetchStoreShifts(session.tenantId, storeId).then((shifts) => {
      if (!cancelled)
        setGroups(
          applySavedGroups(
            shifts.map((s) => ({
              key: s.id,
              name: s.name,
              pct: "",
              editedAt: 0,
            })),
          ),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [session.tenantId, storeId]);
  const teamSize = team?.length ?? null;

  const parsedTarget = parseNum(target);
  const targetValue =
    parsedTarget != null && !Number.isNaN(parsedTarget) && parsedTarget > 0
      ? parsedTarget
      : null;
  /** Erros só aparecem depois da 1ª tentativa de salvar; daí somem conforme o campo é corrigido. */
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overlap, setOverlap] = useState(false);
  useEffect(() => setOverlap(false), [startsOn, endsOn, storeId]);
  const campos = {
    name,
    startsOn,
    endsOn,
    storeId,
    target: targetValue,
    groupsOn,
    groups,
    tiersOn,
    tiers,
  };
  const errors: FormErrors = tried ? validateGoal(campos) : {};
  const overlapMsg = "Já existe uma meta desta loja nesse período.";
  const dateError = (e?: string) => e ?? (overlap ? overlapMsg : undefined);

  const submit = async () => {
    setTried(true);
    if (Object.keys(validateGoal(campos)).length > 0) {
      toast.show("Revise os campos destacados.", "danger");
      return;
    }
    setSaving(true);
    const res = await saveGoal(session.tenantId, id ?? null, {
      storeId,
      name,
      startsOn: paraIso(startsOn!),
      endsOn: paraIso(endsOn!),
      target: targetValue!,
      tierMode: prizeMode,
      tiers: tiersOn
        ? tiers.map((t, i) => ({
            nome: t.name.trim() || `Nível ${i + 1}`,
            atingimentoMinPct: positive(t.meta)!,
            comissaoPct: positive(t.commission)!,
            bonus: positive(t.bonus) ?? 0,
          }))
        : [],
      groups:
        groupsOn && groups
          ? groups.map((g) => ({
              shiftId: g.key,
              name: g.name,
              pct: groupPct(g) ?? 0,
            }))
          : [],
    });
    setSaving(false);
    if (!res.ok) {
      if (res.reason === "overlap") {
        setOverlap(true);
        toast.show(overlapMsg, "danger");
      } else toast.show(SAVE_ERROR_MSG, "danger");
      return;
    }
    toast.show(id ? "Alterações salvas." : "Meta criada.", "success");
    navigate(paths.goalDetail(res.id));
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon d={icons.arrowLeft} size={14} />}
          onClick={voltar}
        >
          Voltar
        </Button>
        <Breadcrumbs
          items={[
            { label: "Gestão" },
            { label: "Metas", to: paths.goals },
            { label: titulo },
          ]}
        />
      </div>
      <h1 className="mb-5 text-[22px] font-extrabold tracking-tight text-t0">
        {titulo}
      </h1>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Informações gerais</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-4">
            <FormField label="Nome da meta" required error={errors.name}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Meta outubro 2026"
                className={errors.name ? "border-bad!" : undefined}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="Data início"
                required
                error={dateError(errors.startsOn)}
              >
                <DatePicker
                  value={startsOn}
                  onChange={(d) => {
                    setStartsOn(d);
                    if (endsOn && endsOn < d) setEndsOn(null);
                  }}
                  invalid={Boolean(dateError(errors.startsOn))}
                  aria-label="Data início"
                />
              </FormField>
              <FormField
                label="Data fim"
                required
                error={overlap ? undefined : errors.endsOn}
              >
                <DatePicker
                  value={endsOn}
                  onChange={setEndsOn}
                  minDate={startsOn}
                  invalid={Boolean(dateError(errors.endsOn))}
                  aria-label="Data fim"
                />
              </FormField>
            </div>
            <FormField label="Loja" required error={errors.storeId}>
              <Select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className={cn(
                  !storeId && "text-t2",
                  errors.storeId && "border-bad!",
                )}
              >
                {!storeId && <option value="">Selecione a loja</option>}
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.fantasia} · Filial {l.codFilial}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label="Meta global da equipe"
              required
              error={errors.target}
            >
              <NumberInput
                value={target}
                onChange={setTarget}
                unit="R$"
                invalid={Boolean(errors.target)}
                aria-label="Meta global da equipe"
              />
              <GlobalSplit target={targetValue} teamSize={teamSize} />
            </FormField>
            <FormField label="Modo de premiação" required>
              <Segmented<PrizeMode>
                options={[
                  { value: "INDIVIDUAL", label: "Individual" },
                  { value: "GROUP", label: "Grupo" },
                ]}
                value={prizeMode}
                onChange={(v) => v && setPrizeMode(v)}
              />
              <p className="mt-1.5 text-[11.5px] text-t2">
                {prizeMode === "INDIVIDUAL"
                  ? "Cada pessoa sobe de nível e ganha a premiação sobre o que ela vender. O bônus também é individual."
                  : "O grupo sobe de nível junto, pela soma das vendas. A premiação é dividida igualmente entre as pessoas do grupo e o bônus vale para cada uma."}
              </p>
            </FormField>
          </div>
        </Card>

        <SideCard
          title="Grupos de distribuição"
          active={groupsOn}
          onToggle={setGroupsOn}
          emptyIcon="👥"
          emptyTitle="Divisão por grupos"
          emptyText="Divide a meta global entre os grupos da loja (ex.: Manhã 60%, Tarde 40%)."
        >
          <GroupsEditor
            storeId={storeId}
            groups={groups}
            setGroups={setGroups}
            team={team}
            target={targetValue}
            onCreate={() => navigate(paths.management.shifts)}
            error={errors.groups}
          />
        </SideCard>
        <SideCard
          title="Comissão progressiva"
          active={tiersOn}
          onToggle={setTiersOn}
          emptyIcon="📈"
          emptyTitle="Comissão por faixas"
          emptyText="Níveis de atingimento (ex.: 100%, 120%, 150%) com comissões crescentes. Quanto mais vender, maior a comissão."
          action={
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon d={icons.plus} size={14} />}
              onClick={() => setTiers((ts) => [...ts, newTier(ts.length)])}
            >
              Nível
            </Button>
          }
        >
          <TiersEditor
            tiers={tiers}
            setTiers={setTiers}
            target={targetValue}
            errors={errors.tiers}
          />
        </SideCard>
        <SideCard
          title="Simulação"
          active={groupsOn && tiersOn}
          emptyIcon="🧮"
          emptyTitle="Simulação da meta"
          emptyText="Ative Grupos e Comissão Progressiva para ver a simulação combinada."
        >
          <Simulation
            groups={groups ?? []}
            team={team}
            tiers={tiers}
            target={targetValue}
            mode={prizeMode}
          />
        </SideCard>
      </div>

      <div className="mt-5 flex justify-end gap-2.5">
        <Button variant="outline" onClick={voltar}>
          Cancelar
        </Button>
        <Button onClick={() => void submit()} disabled={saving}>
          {saving ? "Salvando…" : id ? "Salvar alterações" : "Criar meta"}
        </Button>
      </div>
    </div>
  );
}

/** Meta global ÷ equipe de vendas ativa da loja. */
function GlobalSplit({
  target,
  teamSize,
}: {
  target: number | null;
  teamSize: number | null;
}) {
  if (target == null || teamSize == null) return null;
  if (teamSize === 0) {
    return (
      <p className="mt-1.5 text-[12px] font-semibold text-warn">
        Nenhuma pessoa na equipe de vendas desta loja.
      </p>
    );
  }
  return (
    <p className="mt-1.5 text-[12px] font-semibold text-acc">
      → Cada pessoa: {brlCent(target / teamSize)} ({teamSize}{" "}
      {teamSize === 1 ? "pessoa" : "pessoas"} na equipe)
    </p>
  );
}

function SideCard({
  title,
  active,
  onToggle,
  emptyIcon,
  emptyTitle,
  emptyText,
  action,
  children,
}: {
  title: string;
  active: boolean;
  /** Liga/desliga o recurso pela chave no cabeçalho. */
  onToggle?: (v: boolean) => void;
  emptyIcon: string;
  emptyTitle: string;
  emptyText: string;
  /** Botão no canto do cabeçalho (só com o recurso ativo). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="flex min-h-[320px] flex-col">
      <CardHeader className="items-center">
        <CardTitle>{title}</CardTitle>
        {((active && action) || onToggle) && (
          <div className="flex shrink-0 items-center gap-2.5">
            {active && action}
            {onToggle && <Switch checked={active} onChange={onToggle} />}
          </div>
        )}
      </CardHeader>
      {active ? (
        children
      ) : (
        <EmptyBlock
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyText}
        />
      )}
    </Card>
  );
}

function RemoveButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Remover"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-vela-md)] text-t2 transition-colors hover:bg-bad-soft hover:text-bad disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon d={icons.trash} size={15} />
    </button>
  );
}

/** Grupos da loja (Gestão > Grupos): nome e lista fixos; muda só o valor e o tipo (% ou R$). Soma ≤ 100% da meta global. */
function GroupsEditor({
  storeId,
  groups,
  setGroups,
  team,
  target,
  onCreate,
  error,
}: {
  storeId: string;
  groups: GroupRow[] | null;
  setGroups: (fn: (g: GroupRow[] | null) => GroupRow[] | null) => void;
  team: GoalTeamMember[] | null;
  target: number | null;
  onCreate: () => void;
  error?: string;
}) {
  if (!storeId) {
    return (
      <EmptyBlock
        icon="🏬"
        title="Selecione a loja"
        description="Os grupos vêm da loja escolhida em Informações gerais."
      />
    );
  }
  if (groups == null) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <>
        <EmptyBlock
          icon="👥"
          title="Nenhum grupo cadastrado"
          description="Crie os grupos da loja para dividir a meta entre eles."
          action={
            <Button
              size="sm"
              icon={<Icon d={icons.plus} size={14} />}
              onClick={onCreate}
            >
              Criar grupo
            </Button>
          }
        />
        {error && (
          <p className="text-center text-[11.5px] font-medium text-bad">
            {error}
          </p>
        )}
      </>
    );
  }

  const update = (key: string, pct: string) =>
    setGroups((gs) => gs && distributeGroups(gs, key, pct));
  const preenchidos = groups.filter((g) => groupPct(g) != null);
  const total = preenchidos.reduce((s, g) => s + (groupPct(g) ?? 0), 0);
  const totalTxt = `${numText(Math.round(total * 10) / 10)}%`;
  const passou = total > 100.005;
  const fechou = Math.abs(total - 100) < 0.005;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <p className="text-[11.5px] text-t2">
        Informe o % da meta global de um grupo e o restante é distribuído
        automaticamente entre os demais. A soma precisa fechar 100%.
      </p>
      {groups.map((g) => (
        <div key={g.key} className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-t0">
            {g.name}
          </p>
          <NumberInput
            value={g.pct}
            onChange={(v) => update(g.key, v)}
            unit="%"
            compact
            invalid={Boolean(error)}
            className="w-[92px] shrink-0"
            aria-label={`% da meta do grupo ${g.name}`}
          />
        </div>
      ))}

      {error ? (
        <p className="text-[12px] font-semibold text-bad">{error}</p>
      ) : (
        preenchidos.length > 0 && (
          <p
            className={cn(
              "text-[12px] font-semibold",
              passou ? "text-bad" : fechou ? "text-ok" : "text-warn",
            )}
          >
            {passou
              ? `Total ${totalTxt} · passa de 100% da meta global. Ajuste os valores.`
              : fechou
                ? "Total 100% · meta global toda distribuída."
                : `Total ${totalTxt} · faltam ${numText(Math.round((100 - total) * 10) / 10)}% da meta global.`}
          </p>
        )
      )}

      <GroupsSimulation groups={groups} team={team} target={target} />
    </div>
  );
}

/** Meta de cada grupo e as pessoas dele (o grupo de cada pessoa é definido em Gestão > Colaboradores). */
function GroupsSimulation({
  groups,
  team,
  target,
}: {
  groups: GroupRow[];
  team: GoalTeamMember[] | null;
  target: number | null;
}) {
  const nomes = new Set(groups.map((g) => g.name));
  const pessoas = [...(team ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
  const semGrupo = pessoas.filter(
    (p) => !p.shiftName || !nomes.has(p.shiftName),
  );
  const pessoaRow = (p: GoalTeamMember, meta: string | null) => (
    <div
      key={`${p.storeId}:${p.employeeId}`}
      className="flex items-center gap-2.5 py-1"
    >
      <Avatar name={p.name} size="sm" />
      <p className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-t0">
        {p.name}
      </p>
      {meta && (
        <span className="shrink-0 font-mono text-[12px] text-t1">{meta}</span>
      )}
    </div>
  );
  return (
    <div className="mt-auto rounded-[var(--radius-vela-md)] bg-bg-1 p-3">
      <p className="mb-2.5 text-[12.5px] font-bold text-t0">Simulação</p>
      {team == null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {groups.map((g) => {
            const meta = groupTarget(g, target);
            const pct = groupPct(g);
            const membros = pessoas.filter((p) => p.shiftName === g.name);
            const cada =
              meta != null && membros.length > 0
                ? brlCent(meta / membros.length)
                : null;
            return (
              <div key={g.key} className="py-2.5 first:pt-0 last:pb-0">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <p className="truncate text-[12.5px] font-bold text-t0">
                    {g.name}
                    {pct != null && (
                      <span className="font-semibold text-t2">
                        {" "}
                        · {numText(Math.round(pct * 10) / 10)}%
                      </span>
                    )}
                  </p>
                  <span className="shrink-0 font-mono text-[12.5px] font-semibold text-t0">
                    {meta != null ? brlCent(meta) : "—"}
                  </span>
                </div>
                {membros.length === 0 ? (
                  <p className="text-[11.5px] text-warn">
                    Nenhuma pessoa neste grupo.
                  </p>
                ) : (
                  membros.map((p) => pessoaRow(p, cada))
                )}
              </div>
            );
          })}
          {semGrupo.length > 0 && (
            <div className="py-2.5 last:pb-0">
              <p className="mb-1 text-[12.5px] font-bold text-warn">
                Sem grupo
              </p>
              {semGrupo.map((p) => pessoaRow(p, null))}
              <p className="mt-1 text-[11.5px] text-warn">
                {semGrupo.length === 1 ? "Fica" : "Ficam"} fora da divisão por
                grupos. Defina o grupo em Gestão &gt; Colaboradores.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Informações do nível: uma por linha quando o card é estreito (celular e colunas lado a lado no desktop); em linha com "·" no meio. */
function InfoLine({
  items,
  className,
}: {
  items: ReactNode[];
  className?: string;
}) {
  const visiveis = items.filter((it) => it != null && it !== false);
  return (
    <div
      className={cn(
        "flex flex-col text-[11.5px] text-t2 sm:flex-row sm:flex-wrap lg:flex-col",
        className,
      )}
    >
      {visiveis.map((it, i) => (
        <span key={i}>
          {i > 0 && <span className="hidden sm:inline lg:hidden">{" · "}</span>}
          {it}
        </span>
      ))}
    </div>
  );
}

/** Linha "rótulo + valor" do nível. */
function TierField({
  label,
  value,
  unit,
  onChange,
  required = false,
  error,
}: {
  label: string;
  value: string;
  unit: "%" | "R$";
  onChange: (v: string) => void;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
      <span className="text-[12px] font-semibold text-t1">
        {label}
        {required && <span className="text-bad"> *</span>}
      </span>
      <NumberInput
        value={value}
        onChange={onChange}
        unit={unit}
        compact
        invalid={Boolean(error)}
        aria-label={label}
      />
      {error && (
        <p className="col-start-2 text-[11.5px] font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

function TiersEditor({
  tiers,
  setTiers,
  target,
  errors,
}: {
  tiers: TierRow[];
  setTiers: (fn: (t: TierRow[]) => TierRow[]) => void;
  target: number | null;
  errors?: Record<number, TierErrors>;
}) {
  const update = (key: number, patch: Partial<TierRow>) =>
    setTiers((ts) => ts.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const resultados = tierResults(tiers, target);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px] text-t2">
        <span className="font-semibold text-t1">Meta:</span> quanto da meta é
        preciso atingir para chegar ao nível (ex.: 120% = vender 20% acima da
        meta). <span className="font-semibold text-t1">Premiação:</span> % pago
        sobre as vendas quando o nível é alcançado.{" "}
        <span className="font-semibold text-t1">Bônus:</span> valor fixo em R$
        pago a mais por atingir o nível (opcional).
      </p>
      {tiers.map((t, i) => {
        const r = resultados[i]!;
        return (
          <div
            key={t.key}
            className="flex flex-col gap-2.5 rounded-[var(--radius-vela-md)] border border-line p-3"
          >
            <div className="flex items-center gap-2">
              <Input
                value={t.name}
                onChange={(e) => update(t.key, { name: e.target.value })}
                placeholder={`Nível ${i + 1}`}
                className="h-9! min-w-0 flex-1"
                aria-label="Nome do nível"
              />
              <RemoveButton
                onClick={() =>
                  setTiers((ts) => ts.filter((x) => x.key !== t.key))
                }
                disabled={tiers.length <= 1}
              />
            </div>
            <TierField
              label="Meta"
              unit="%"
              value={t.meta}
              onChange={(meta) => update(t.key, { meta })}
              required
              error={errors?.[t.key]?.meta}
            />
            <TierField
              label="Premiação"
              unit="%"
              value={t.commission}
              onChange={(commission) => update(t.key, { commission })}
              required
              error={errors?.[t.key]?.commission}
            />
            <TierField
              label="Bônus"
              unit="R$"
              value={t.bonus}
              onChange={(bonus) => update(t.key, { bonus })}
            />
            {r.atingir != null && (
              <InfoLine
                items={[
                  <>
                    A partir de{" "}
                    <span className="font-mono text-t1">
                      {brlCent(r.atingir)}
                    </span>
                  </>,
                  r.comissao != null && (
                    <>
                      💰 mín.{" "}
                      <span className="font-mono font-semibold text-ok">
                        {brlCent(r.comissao)}
                      </span>
                    </>
                  ),
                  r.bonus != null && (
                    <>
                      🎁{" "}
                      <span className="font-mono font-semibold text-ok">
                        +{brlCent(r.bonus)}
                      </span>
                    </>
                  ),
                ]}
              />
            )}
          </div>
        );
      })}

      {target != null && (
        <Alert variant="warning">
          Os valores acima são baseados na{" "}
          <span className="font-semibold">meta global</span>. Na prática, cada
          vendedor terá esses % aplicados sobre a sua{" "}
          <span className="font-semibold">meta individual</span>. A premiação
          vale sobre tudo o que for vendido, sem teto.
        </Alert>
      )}
    </div>
  );
}

function Simulation({
  groups,
  team,
  tiers,
  target,
  mode,
}: {
  groups: GroupRow[];
  team: GoalTeamMember[] | null;
  tiers: TierRow[];
  target: number | null;
  mode: PrizeMode;
}) {
  const individual = mode === "INDIVIDUAL";
  const grupos = groups
    .map((g) => {
      const metaGrupo = groupTarget(g, target);
      const pessoas = team?.filter((m) => m.shiftName === g.name).length ?? 0;
      const base =
        metaGrupo == null
          ? null
          : individual
            ? pessoas > 0
              ? metaGrupo / pessoas
              : null
            : metaGrupo;
      return {
        key: g.key,
        name: g.name,
        pct: groupPct(g),
        metaGrupo,
        pessoas,
        base,
      };
    })
    .filter((g) => g.metaGrupo != null);
  const temNivel = tiers.some((t) => positive(t.meta) != null);

  if (!target) {
    return (
      <EmptyBlock
        icon="💡"
        title="Falta a meta global"
        description="Informe a meta global da equipe para simular os valores de cada grupo."
      />
    );
  }
  if (grupos.length === 0 || !temNivel) {
    return (
      <EmptyBlock
        icon="💡"
        title="Faltam dados"
        description="Preencha o % de pelo menos um grupo e a meta de um nível."
      />
    );
  }
  if (team == null) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px] text-t2">
        {individual
          ? "Premiação de cada pessoa, sobre a meta individual (meta do grupo ÷ pessoas do grupo)."
          : "Premiação do grupo todo, sobre a meta do grupo, dividida igualmente entre as pessoas."}
      </p>
      {grupos.map((g) => {
        const resultados = g.base != null ? tierResults(tiers, g.base) : [];
        return (
          <div
            key={g.key}
            className="rounded-[var(--radius-vela-md)] bg-bg-1 p-3"
          >
            <p className="truncate text-[13.5px] font-bold text-acc">
              {g.name}
              {g.pct != null && ` (${numText(Math.round(g.pct * 10) / 10)}%)`}
            </p>
            <p className="mb-2.5 mt-0.5 text-[11.5px] text-t2">
              {individual ? "Meta individual" : "Meta do grupo"}:{" "}
              <span className="font-mono text-t1">
                {g.base != null ? brlCent(g.base) : "—"}
              </span>
              {" · "}
              {g.pessoas} {g.pessoas === 1 ? "pessoa" : "pessoas"}
            </p>
            {g.base == null ? (
              <p className="text-[11.5px] text-warn">
                Nenhuma pessoa neste grupo.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {tiers.map((t, i) => {
                  const r = resultados[i]!;
                  if (r.atingir == null) return null;
                  const pct = positive(t.meta);
                  const taxa = positive(t.commission);
                  return (
                    <div
                      key={t.key}
                      className="rounded-lg bg-bg-2 px-2.5 py-1.5 text-[12px]"
                    >
                      <p className="truncate">
                        <span className="font-semibold text-t0">
                          {t.name.trim() || `Nível ${i + 1}`}
                        </span>
                        {pct != null && (
                          <span className="text-t2"> ({numText(pct)}%)</span>
                        )}
                      </p>
                      <InfoLine
                        className="mt-0.5"
                        items={[
                          <>
                            A partir de{" "}
                            <span className="font-mono text-t1">
                              {brlCent(r.atingir)}
                            </span>
                          </>,
                          taxa != null && r.comissao != null && (
                            <>
                              💰{" "}
                              <span className="font-semibold text-ok">
                                {numText(taxa)}% das vendas
                              </span>{" "}
                              · mín.{" "}
                              <span className="font-mono font-semibold text-ok">
                                {brlCent(r.comissao)}
                              </span>
                              {!individual && g.pessoas > 1 && (
                                <> ({brlCent(r.comissao / g.pessoas)} cada)</>
                              )}
                            </>
                          ),
                          r.bonus != null && (
                            <>
                              🎁{" "}
                              <span className="font-mono font-semibold text-ok">
                                +{brlCent(r.bonus)}
                              </span>
                              {!individual && " cada"}
                            </>
                          ),
                        ]}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
