import { Dropdown } from "./Dropdown";
import { cn } from "@/lib/cn";

export interface TagSelectOption<T extends string> {
  value: T;
  label: string;
}

export interface TagSelectProps<T extends string> {
  options: TagSelectOption<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  /** Texto quando nada está selecionado. */
  placeholder?: string;
  className?: string;
}

/** Multi-select (tags) do Vela (Forms > Select Components): opções escolhidas viram tags removíveis; o menu liga/desliga cada opção. */
export function TagSelect<T extends string>({ options, value, onChange, placeholder = "Selecionar…", className }: TagSelectProps<T>) {
  const toggle = (v: T) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const selected = options.filter((o) => value.includes(o.value));

  return (
    <Dropdown
      align="left"
      items={options.map((o) => ({ label: o.label, active: value.includes(o.value), keepOpen: true, onClick: () => toggle(o.value) }))}
      trigger={
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "flex min-h-9 cursor-pointer flex-wrap items-center gap-1.5 rounded-[10px] border border-line bg-bg-inset py-1 pl-1.5 pr-2.5 transition-colors hover:border-acc",
            className,
          )}
        >
          {selected.map((o) => (
            <span key={o.value} className="flex items-center gap-1.5 rounded-lg bg-acc-soft px-2.5 py-1 text-xs font-semibold text-acc">
              {o.label}
              <button
                type="button"
                aria-label={`Remover ${o.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(o.value);
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          {selected.length === 0 && <span className="px-1.5 text-[12.5px] text-t2">{placeholder}</span>}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0 text-t2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      }
    />
  );
}
