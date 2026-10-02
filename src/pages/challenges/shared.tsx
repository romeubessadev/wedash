import type { ChallengeMetric, ChallengeRecord } from "@/data/wedash/challengesRepo";
import {
  challengeCardSummary,
  metricValueLabel,
  prizeLabel,
  type ChallengeStatus,
  type ChallengeView,
} from "@/data/wedash/challengeView";

export const CHALLENGE_STATUS_ORDER: Record<ChallengeStatus, number> = { active: 0, upcoming: 1, ended: 2 };
export const CHALLENGE_STATUS_VARIANT: Record<ChallengeStatus, "success" | "info" | "neutral"> = {
  active: "success",
  upcoming: "info",
  ended: "neutral",
};

const MAIOR: Record<ChallengeMetric, string> = {
  QUANTITY: "Quem vender mais itens",
  VALUE: "Quem vender mais",
  PA: "Maior P.A.",
  TICKET: "Maior ticket médio",
};

/** "Quem vender mais" / "Mínimo: 15 itens" — o critério do desafio em uma linha. */
export function challengeCriterion(c: ChallengeRecord): string {
  if (c.mode === "MINIMUM") return c.target != null ? `Mínimo: ${metricValueLabel(c.metric, c.target)}` : "Mínimo não definido";
  const quem = MAIOR[c.metric];
  return c.target != null ? `${quem} · mínimo de ${metricValueLabel(c.metric, c.target)}` : quem;
}

/** Linha de destaque do card: líder(es) / vencedor(es) na Disputa, quantas atingiram no Mínimo. */
export function challengeHeadline(c: ChallengeRecord, view: ChallengeView): { label: string; value: string } {
  if (view.status === "upcoming") return { label: "Critério", value: challengeCriterion(c) };
  const encerrado = view.status === "ended";
  if (c.mode === "MINIMUM") {
    const n = view.atingiram;
    const alvo = c.target != null ? ` · mínimo de ${metricValueLabel(c.metric, c.target)}` : "";
    if (n === 0) return { label: "Atingiram", value: `${encerrado ? "Ninguém atingiu" : "Ninguém atingiu ainda"}${alvo}` };
    return { label: "Atingiram", value: `${n} ${n === 1 ? "pessoa" : "pessoas"}${alvo}` };
  }
  const { lider } = challengeCardSummary(view);
  const primeiros = view.participantes.filter((p) => p.posicao === 1);
  if (!lider || primeiros.length === 0) {
    return { label: encerrado ? "Vencedor" : "Líder", value: encerrado ? "Nenhum vencedor" : "Ninguém pontuou ainda" };
  }
  const valor = primeiros[0].resultado != null ? ` · ${metricValueLabel(c.metric, primeiros[0].resultado)}` : "";
  const varios = primeiros.length > 1;
  if (encerrado && !primeiros[0].vencedor) return { label: "Vencedor", value: "Nenhum vencedor" };
  const label = encerrado ? (varios ? "Vencedores" : "Vencedor") : varios ? "Líderes" : "Líder";
  return { label, value: `${lider}${valor}` };
}

/** Prêmio principal: 1º lugar (Disputa) ou o prêmio por pessoa (Mínimo). */
export function mainPrizeLabel(c: ChallengeRecord): string | null {
  const p = c.prizes[0];
  if (!p) return null;
  return c.mode === "MINIMUM" ? `${prizeLabel(p)} por pessoa` : `1º: ${prizeLabel(p)}`;
}
