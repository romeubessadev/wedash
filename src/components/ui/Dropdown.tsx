import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export interface DropdownItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  divider?: boolean;
  /** Destaca a opção selecionada (bg-acc-soft + texto acc). */
  active?: boolean;
  /** Opção não clicável (ex.: filtro ainda indisponível). */
  disabled?: boolean;
  /** Conteúdo à direita do rótulo (ex.: switch visual). */
  trailing?: ReactNode;
  /** Não fecha o menu ao clicar (toggles). */
  keepOpen?: boolean;
  /** Card em destaque na cor primária: borda, fundo suave e sombra (ex.: notificação não lida). */
  highlight?: boolean;
  /** Classes extras da opção (sem conflitar com cor/fundo — `cn` não resolve conflitos). */
  className?: string;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  /** Classes extras do menu (ex.: altura máxima com scroll). */
  menuClassName?: string;
  /** Renderiza o menu no `body` (posição fixa) — para triggers dentro de containers com overflow (tabelas). */
  portal?: boolean;
}

const GAP = 8;

export function Dropdown({ trigger, items, align = "right", menuClassName, portal = false }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useLayoutEffect(() => {
    if (!portal || !open) {
      setPos(null);
      return;
    }
    function place() {
      const trig = ref.current?.getBoundingClientRect();
      const menuH = menuRef.current?.offsetHeight ?? 0;
      if (!trig) return;
      const below = window.innerHeight - trig.bottom;
      const up = below < menuH + GAP && trig.top > below;
      setPos({
        position: "fixed",
        top: up ? Math.max(GAP, trig.top - menuH - GAP) : trig.bottom + GAP,
        ...(align === "right" ? { right: window.innerWidth - trig.right } : { left: trig.left }),
      });
    }
    place();
    const close = () => setOpen(false);
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [portal, open, align]);

  const menuClass = cn(
    "z-40 min-w-[190px] rounded-[var(--radius-vela-md)] border border-line bg-bg-2 p-1.5 shadow-[var(--shadow-vela)] animate-vela-pop",
    !portal && cn("absolute mt-2", align === "right" ? "right-0" : "left-0"),
    menuClassName,
  );

  const menu = open && (
        <div
          ref={menuRef}
          className={menuClass}
          style={portal ? (pos ?? { position: "fixed", top: 0, left: 0, visibility: "hidden" }) : undefined}
        >
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} className="my-1.5 h-px bg-line" />
            ) : (
              <button
                key={i}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onClick?.();
                  if (!item.keepOpen) setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13px] font-medium",
                  item.disabled
                    ? "cursor-not-allowed text-t2 opacity-50"
                    : item.active
                      ? "bg-acc-soft text-acc"
                      : cn(
                          item.danger ? "text-bad" : item.highlight ? "text-acc" : "text-t0",
                          item.highlight
                            ? "border border-acc/40 bg-acc-soft shadow-[0_2px_8px_-2px_color-mix(in_srgb,var(--acc)_40%,transparent)]"
                            : "hover:bg-bg-3",
                        ),
                  item.className,
                )}
              >
                {item.icon}
                <span className="min-w-0 flex-1">{item.label}</span>
                {item.trailing}
                {item.active && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ),
          )}
        </div>
  );

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {portal ? menu && createPortal(menu, document.body) : menu}
    </div>
  );
}
