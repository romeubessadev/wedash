import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Breadcrumbs, Button, Card, CardHeader, CardTitle, FormField, Select, Switch, useToast } from "@/components/ui";
import { StoreDetailSkeleton } from "@/components/wedash/LoadingSkeletons";
import { useMinSkeleton } from "@/lib/useMinSkeleton";
import { useActiveSession } from "@/session/SessionProvider";
import { hydrateSessionStores, storesForSession, updateStoreSchedule, type Store } from "@/data/wedash/stores";
import {
  DOW_LABELS,
  STORE_TIMEZONES,
  canonicalStoreTimezone,
  parseWeekHours,
  type Dow,
  type StoreWeekHours,
} from "@/data/wedash/storeHours";
import { Icon, icons } from "@/pages/users/Icons";
import { FormActions, TimeSelect } from "@/pages/operation/shared";
import { paths } from "@/router/paths";
import { cn } from "@/lib/cn";

const DOWS: Dow[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * Administração > Lojas > detalhe — funcionamento (fuso + horário).
 * Custos ficam em Configurações; turnos e equipe em Gestão.
 */
export function StoreDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = useActiveSession();
  const [catalogTick, setCatalogTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useMinSkeleton(loading);

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

  const voltar = () => navigate(paths.settings.stores);

  if (showSkeleton || !store) {
    return (
      <div>
        <DetailHeader nome={store?.fantasia ?? "Loja"} onBack={voltar} />
        {showSkeleton ? (
          <StoreDetailSkeleton />
        ) : (
          <span className="block py-6 text-center text-[12px] text-t2">Loja não encontrada no seu escopo.</span>
        )}
      </div>
    );
  }

  return (
    <StoreDetailForm
      key={store.id}
      store={store}
      canEdit={session.role === "OWNER" || session.role === "MANAGER" || session.role === "ADMIN_GLOBAL"}
      onBack={voltar}
      onSaved={() => setCatalogTick((n) => n + 1)}
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
  store,
  canEdit,
  onBack,
  onSaved,
}: {
  store: Store;
  canEdit: boolean;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { show } = useToast();
  const [saved, setSaved] = useState(() => ({
    timezone: canonicalStoreTimezone(store.fuso),
    hours: parseWeekHours(store.horas),
  }));
  const [timezone, setTimezone] = useState(saved.timezone);
  const [hours, setHours] = useState<StoreWeekHours>(saved.hours);
  const [saving, setSaving] = useState(false);
  const dirty = timezone !== saved.timezone || JSON.stringify(hours) !== JSON.stringify(saved.hours);

  async function save() {
    const invalid = DOWS.find((d) => {
      const day = hours[d];
      return day != null && day.open >= day.close;
    });
    if (invalid != null) {
      show(`${DOW_LABELS[invalid]}: abertura deve ser antes do fechamento.`, "danger");
      return;
    }
    setSaving(true);
    const r = await updateStoreSchedule({ storeId: store.id, timezone, hours }).catch(
      (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }),
    );
    setSaving(false);
    if (!r.ok) {
      show(`Não foi possível salvar: ${r.error}`, "danger");
      return;
    }
    setSaved({ timezone, hours });
    onSaved();
    show("Alterações salvas.", "success");
  }

  function reset() {
    setTimezone(saved.timezone);
    setHours(saved.hours);
  }

  function toggleDow(d: Dow) {
    const next = { ...hours };
    if (next[d]) {
      next[d] = null;
    } else {
      const template = DOWS.map((x) => hours[x]).find((x) => x != null) ?? { open: "09:00", close: "21:00" };
      next[d] = { ...template };
    }
    setHours(next);
  }

  function setDayTime(d: Dow, field: "open" | "close", value: string) {
    const cur = hours[d];
    if (!cur) return;
    setHours({ ...hours, [d]: { ...cur, [field]: value } });
  }

  function copyToAll(from: Dow) {
    const src = hours[from];
    if (!src) return;
    const next = { ...hours };
    for (const d of DOWS) if (next[d]) next[d] = { ...src };
    setHours(next);
  }

  const copySource = DOWS.find((d) => hours[d] != null);

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
              void save();
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
                              <span className={cn("text-t2", day && "hidden sm:inline")}>{day ? "Aberto" : "Fechado"}</span>
                            }
                          />
                        </div>
                        {day && (
                          <>
                            <TimeSelect value={day.open} disabled={!canEdit} onChange={(v) => setDayTime(d, "open", v)} />
                            <span className="text-t2">–</span>
                            <TimeSelect value={day.close} disabled={!canEdit} onChange={(v) => setDayTime(d, "close", v)} />
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
            {canEdit && <FormActions dirty={dirty} saving={saving} onReset={reset} />}
          </form>
        </Card>
      </div>
    </div>
  );
}

export default StoreDetailPage;
