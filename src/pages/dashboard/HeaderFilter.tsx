import type { ReactNode } from "react";
import { Dropdown } from "@/components/ui";

/** Mesmo desenho do gatilho do DateRangePicker (md) — filtros do cabeçalho das telas. */
const TRIGGER_CLASS =
  "flex h-10 min-w-0 items-center gap-2.5 rounded-[var(--radius-vela-sm)] border border-line bg-bg-3 px-3.5 text-left transition-colors hover:border-acc";

const svg = (children: ReactNode) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-t0">
    {children}
  </svg>
);

export const FilterIcons = {
  clock: svg(
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>,
  ),
  status: svg(<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />),
  category: svg(
    <>
      <path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l8.59-8.59a1 1 0 0 0 0-1.41Z" />
      <circle cx="7" cy="7" r="1.5" />
    </>,
  ),
  table: svg(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </>,
  ),
};

/** Filtro de opção única no cabeçalho: gatilho igual ao do período + menu com a opção ativa marcada. */
export function HeaderFilter<V extends string>({
  icon,
  value,
  options,
  onChange,
  label,
}: {
  icon: ReactNode;
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
          {icon}
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
    <label className="flex h-10 w-[200px] min-w-0 items-center gap-2.5 rounded-[var(--radius-vela-sm)] border border-line bg-bg-3 px-3.5 transition-colors focus-within:border-acc hover:border-acc">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-t0">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar"
        className="min-w-0 flex-1 bg-transparent text-[13.5px] font-semibold text-t0 outline-none placeholder:font-medium placeholder:text-t2"
      />
    </label>
  );
}
