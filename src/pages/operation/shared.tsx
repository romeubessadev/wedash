import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Card, CardHeader, CardSubtitle, CardTitle, EmptyState, FormField, Input, PageHeader, Select, TabNav } from "@/components/ui";
import { managementTabs, operationTabs } from "@/layout/nav-wedash";
import { halfHourOptions } from "@/data/wedash/storeHours";
import { useActiveSession } from "@/session/SessionProvider";
import { useScope } from "@/pages/dashboard/useScope";
import { hydrateSessionStores, storesForSession, type Store } from "@/data/wedash/stores";
import { StoreIcon } from "@/pages/dashboards/icons";
import { cn } from "@/lib/cn";

/** Tempo mínimo do skeleton ao abrir a tela: carga rápida não vira um "pisca". */
export const MIN_SKELETON_MS = 600;

/** Espera o que falta para completar `MIN_SKELETON_MS` desde `startedAt`. */
export function waitMinSkeleton(startedAt: number): Promise<void> {
  const rest = MIN_SKELETON_MS - (Date.now() - startedAt);
  return rest > 0 ? new Promise((r) => setTimeout(r, rest)) : Promise.resolve();
}

/** Lojas do escopo do StorePicker ("Todas" = todas as lojas da sessão), já com custos e horário do banco. */
export function useScopedStores() {
  const session = useActiveSession();
  const { escopo } = useScope();
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    (async () => {
      setLoading(true);
      if (session.stores.length > 0) {
        await hydrateSessionStores(session.tenantId, session.stores);
        if (!cancelled) setTick((n) => n + 1);
      }
      await waitMinSkeleton(startedAt);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [session.tenantId, session.stores]);

  const lojas = useMemo(() => {
    const todas = storesForSession(session.stores);
    return escopo.filialIds.length === 0 ? todas : todas.filter((s) => escopo.filialIds.includes(s.id));
  }, [session.stores, escopo.filialIds, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  return { session, lojas, loading, refresh: () => setTick((n) => n + 1) };
}

export type SectionName = "Gestão" | "Configurações da operação";

const SECTION_TABS: Record<SectionName, typeof managementTabs> = {
  Gestão: managementTabs,
  "Configurações da operação": operationTabs,
};

/** Código das outras abas da seção — baixado junto para a troca de aba não esperar o download. */
const SECTION_PAGES: Record<SectionName, Array<() => Promise<unknown>>> = {
  Gestão: [
    () => import("@/pages/goals/GoalsPage"),
    () => import("@/pages/management/ChallengesPage"),
    () => import("@/pages/management/ShiftsPage"),
    () => import("@/pages/management/StaffPage"),
  ],
  "Configurações da operação": [
    () => import("@/pages/operation/CostsPage"),
    () => import("@/pages/operation/FranchisePage"),
    () => import("@/pages/operation/RentPage"),
    () => import("@/pages/operation/ProductsTaxesPage"),
  ],
};

/** Cabeçalho da seção (breadcrumb + abas do grupo do menu). */
export function SectionHeader({ section, title, subtitle, actions }: { section: SectionName; title: string; subtitle: string; actions?: ReactNode }) {
  useEffect(() => {
    for (const load of SECTION_PAGES[section]) void load().catch(() => {});
  }, [section]);
  return (
    <>
      <PageHeader crumbs={[{ label: section }, { label: title }]} title={title} subtitle={subtitle} actions={actions} />
      <TabNav items={SECTION_TABS[section]} />
    </>
  );
}

/** Cabeçalho da seção + 1 card por loja do escopo. */
export function StoreCardsPage({
  section,
  title,
  subtitle,
  actions,
  loading,
  skeleton,
  lojas,
  wide = false,
  children,
}: {
  section: SectionName;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  loading: boolean;
  skeleton: ReactNode;
  lojas: Store[];
  wide?: boolean;
  children: (loja: Store) => ReactNode;
}) {
  return (
    <div>
      <SectionHeader section={section} title={title} subtitle={subtitle} actions={actions} />
      <div className="mt-6">
        {loading ? (
          skeleton
        ) : lojas.length === 0 ? (
          <Card>
            <EmptyState framed={false} icon="🏬" title="Nenhuma loja" description="Nenhuma loja no seu escopo." />
          </Card>
        ) : (
          <div className={wide ? "flex flex-col gap-5" : "flex max-w-[720px] flex-col gap-5"}>
            {lojas.map((loja) => (
              <div key={loja.id}>{children(loja)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Título do card = loja (ícone + fantasia + CNPJ). */
export function StoreCardHeader({ loja, action, className }: { loja: Store; action?: ReactNode; className?: string }) {
  return (
    <CardHeader className={className}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-acc-soft text-acc">
          <StoreIcon size={18} />
        </span>
        <div className="min-w-0">
          <CardTitle className="truncate">{loja.fantasia}</CardTitle>
          <CardSubtitle className="truncate">{loja.cnpj || `Filial ${loja.codFilial}`}</CardSubtitle>
        </div>
      </div>
      {action}
    </CardHeader>
  );
}

export const SAVE_ERROR_MSG = "Não foi possível salvar as alterações. Tente novamente.";

export function FormActions({ dirty, saving, onReset }: { dirty: boolean; saving: boolean; onReset: () => void }) {
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

/** "" = vazio; aceita "2,5", "2.5", "1.234,56" e "3.100" (milhar). NaN = inválido. */
export function parseNum(txt: string): number | null {
  const raw = txt.trim();
  const t = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(raw)
      ? raw.replace(/\./g, "")
      : raw;
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** R$ com 2 casas ("3.100,00"); % sem casas fixas ("2,5"). */
export function numText(v: number | null | undefined, unit: "%" | "R$" = "%"): string {
  if (v == null) return "";
  if (unit === "R$") return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return String(v).replace(".", ",");
}

/** Campo numérico com sufixo (%) ou prefixo (R$). */
export function NumberField({
  label,
  hint,
  value,
  onChange,
  disabled,
  unit,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  unit: "%" | "R$";
}) {
  return (
    <FormField label={label} hint={hint}>
      <NumberInput value={value} onChange={onChange} disabled={disabled} unit={unit} aria-label={label} />
    </FormField>
  );
}

export function NumberInput({
  value,
  onChange,
  disabled,
  unit,
  compact = false,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  unit: "%" | "R$";
  /** Altura das linhas editáveis (h-9). */
  compact?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const money = unit === "R$";
  return (
    <div className={cn("relative", className)}>
      <Input
        inputMode="decimal"
        placeholder={money ? "0,00" : "0"}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(money ? "pl-10" : "pr-8", compact && "h-9!")}
        aria-label={ariaLabel}
      />
      <span className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-[13px] text-t2", money ? "left-3" : "right-3")}>
        {unit}
      </span>
    </div>
  );
}

const TIME_OPTS = halfHourOptions();

/** Hora de meia em meia hora (horário da loja, turnos). */
export function TimeSelect({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (v: string) => void }) {
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

/** Próxima meia hora depois de `after` (ou a própria, se for a última). */
export function nextHalfHour(after: string): string {
  return TIME_OPTS.find((t) => t > after) ?? after;
}

export function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}
