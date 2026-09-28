import type { ReactNode } from "react";
import { Card, EmptyState, PageHeader } from "@/components/ui";

/**
 * Tela das próximas fases. Usa o PageHeader e o EmptyState do template, mais
 * um Card listando o que a tela vai mostrar, para o mapa de telas ser validado
 * antes da construção.
 */
export function ComingSoon({
  titulo,
  fase,
  descricao,
  itens,
  header,
  icone = "🚧",
  aviso = "Tela ainda não construída",
  tituloLista = "O que ela vai mostrar",
}: {
  titulo: string;
  fase: string;
  descricao: string;
  itens: string[];
  /** Substitui o PageHeader padrão (ex.: cabeçalho com abas da seção). */
  header?: ReactNode;
  icone?: string;
  aviso?: string;
  tituloLista?: string;
}) {
  return (
    <div>
      {header ?? <PageHeader title={titulo} subtitle={fase} />}
      <div className={header ? "mt-6 max-w-2xl" : "max-w-2xl"}>
        <EmptyState icon={icone} title={aviso} description={descricao} />
        <Card className="mt-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-t2">{tituloLista}</p>
          <ul className="flex flex-col gap-2">
            {itens.map((i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px] text-t0">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-acc" />
                {i}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
