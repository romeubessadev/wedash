import { Dropdown } from "@/components/ui";

/** Mesmo desenho do gatilho do DateRangePicker (md) — filtros do cabeçalho das telas. */
const TRIGGER_CLASS =
  "flex h-10 min-w-0 items-center gap-2.5 rounded-[var(--radius-vela-sm)] border border-line bg-bg-3 px-3.5 text-left transition-colors hover:border-acc";

/** Filtro de opção única no cabeçalho: gatilho igual ao do período + menu com a opção ativa marcada. */
export function HeaderFilter<V extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: V;
  options: Array<{ value: V; label: string }>;
  onChange: (v: V) => void;
  /** Nome do filtro (acessibilidade). */
  label: string;
}) {
  const atual = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? "";
  return (
    <Dropdown
      align="right"
      menuClassName="max-h-[320px] overflow-y-auto"
      trigger={
        <button type="button" aria-label={`${label}: ${atual}`} className={TRIGGER_CLASS}>
          <span className="min-w-0 max-w-[220px] truncate text-[13.5px] font-semibold text-t0">{atual}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-t2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      }
      items={options.map((o) => ({ label: o.label, active: o.value === value, onClick: () => onChange(o.value) }))}
    />
  );
}

/** Busca no cabeçalho, com a mesma altura e borda dos filtros. */
export function HeaderSearch({ value, onChange, placeholder = "Buscar..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label="Buscar"
      className="h-10 w-[200px] min-w-0 rounded-[var(--radius-vela-sm)] border border-line bg-bg-3 px-3.5 text-[13.5px] font-semibold text-t0 outline-none transition-colors placeholder:font-medium placeholder:text-t2 hover:border-acc focus:border-acc"
    />
  );
}
