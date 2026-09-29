import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

/**
 * Modo de impressão (Exportar PDF): tabelas mostram todas as linhas, o tema
 * vira claro e o título da aba vira o nome do arquivo sugerido pelo navegador.
 * Vale também para o Ctrl+P (listeners instalados no AppShell).
 */

let printing = false;
const listeners = new Set<() => void>();
let restore: (() => void) | null = null;

function setPrinting(value: boolean) {
  if (printing === value) return;
  printing = value;
  flushSync(() => listeners.forEach((l) => l()));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrintMode(): boolean {
  return useSyncExternalStore(subscribe, () => printing, () => false);
}

function enter(fileTitle?: string) {
  if (restore) return;
  const html = document.documentElement;
  const prevTheme = html.getAttribute("data-theme");
  const prevTitle = document.title;
  html.setAttribute("data-theme", "light");
  if (fileTitle) document.title = fileTitle;
  restore = () => {
    if (prevTheme) html.setAttribute("data-theme", prevTheme);
    document.title = prevTitle;
  };
  setPrinting(true);
}

function leave() {
  restore?.();
  restore = null;
  setPrinting(false);
}

/** Liga os eventos do navegador (Ctrl+P também entra no modo de impressão). */
export function installPrintMode(): () => void {
  const before = () => enter();
  const after = () => leave();
  window.addEventListener("beforeprint", before);
  window.addEventListener("afterprint", after);
  return () => {
    window.removeEventListener("beforeprint", before);
    window.removeEventListener("afterprint", after);
  };
}

/** Nome do arquivo sem caracteres que o Windows recusa. */
function safeFileTitle(parts: string[]): string {
  return parts
    .filter(Boolean)
    .join(" - ")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Abre a janela de impressão com o layout do relatório (o usuário salva como PDF). */
export function exportPdf(parts: string[]) {
  enter(safeFileTitle(["WeDash", ...parts]));
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}
