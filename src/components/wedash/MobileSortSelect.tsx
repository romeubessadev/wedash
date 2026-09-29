import { Dropdown, type SortDir } from "@/components/ui";
import { cn } from "@/lib/cn";

export type SortOption<K extends string> = { key: K; label: string; text?: boolean };

const dirLabel = (text: boolean | undefined, dir: SortDir) => (text ? (dir === "asc" ? "A–Z" : "Z–A") : dir === "desc" ? "maior primeiro" : "menor primeiro");

/** Ordenação das tabelas no celular (onde não há cabeçalho clicável): campo + direção num select só. */
export function MobileSortSelect<K extends string>({
  options,
  sortKey,
  sortDir,
  onChange,
  className,
}: {
  options: SortOption<K>[];
  sortKey: K;
  sortDir: SortDir;
  onChange: (key: K, dir: SortDir) => void;
  className?: string;
}) {
  const atual = options.find((o) => o.key === sortKey);
  return (
    <div className={cn("md:hidden", className)}>
      <Dropdown
        align="left"
        menuClassName="max-h-80 overflow-y-auto"
        trigger={
          <button
            type="button"
            className="flex h-8 min-w-0 max-w-full items-center gap-2 rounded-[var(--radius-vela-sm)] border border-line bg-bg-3 px-3 text-left transition-colors hover:border-acc"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-t0">
              <path d="M3 6h13M3 12h9M3 18h5M18 8v12M15 17l3 3 3-3" />
            </svg>
            <span className="min-w-0 truncate text-xs font-semibold text-t0">
              {atual ? `${atual.label} · ${dirLabel(atual.text, sortDir)}` : "Ordenar"}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-t2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        }
        items={options.flatMap((o) =>
          (o.text ? (["asc", "desc"] as const) : (["desc", "asc"] as const)).map((d) => ({
            label: `${o.label} · ${dirLabel(o.text, d)}`,
            active: o.key === sortKey && d === sortDir,
            onClick: () => onChange(o.key, d),
          })),
        )}
      />
    </div>
  );
}
