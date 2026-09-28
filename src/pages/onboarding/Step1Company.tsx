import { useState } from "react";
import { FormField, Input } from "@/components/ui";

export type RascunhoEmpresa = {
  nome: string;
};

export const rascunhoEmpresaVazio: RascunhoEmpresa = {
  nome: "",
};

const btnPrimario =
  "h-[46px] w-full rounded-xl bg-acc text-sm font-bold text-white transition-colors hover:bg-acc-2 disabled:cursor-not-allowed disabled:opacity-50";

export function Step1Company({
  valor,
  onChange,
  onConcluir,
}: {
  valor: RascunhoEmpresa;
  onChange: (patch: Partial<RascunhoEmpresa>) => void;
  onConcluir: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const { nome } = valor;
  const pode = nome.trim().length >= 2 && !salvando;

  async function concluir() {
    if (!pode) return;
    setSalvando(true);
    await new Promise((r) => setTimeout(r, 500));
    setSalvando(false);
    onConcluir();
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-t0">Sua empresa</h1>
      <p className="mb-7 text-sm text-t2">Informe o nome da sua empresa. Ele identifica sua conta na WeDash e aparece nos convites para a equipe.</p>

      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void concluir();
        }}
      >
        <FormField label="Nome da empresa" required hint="Pode ser diferente da razão social.">
          <Input
            value={nome}
            onChange={(e) => onChange({ nome: e.target.value })}
            placeholder="Ex.: Essência Perfumaria"
            autoFocus
            maxLength={60}
          />
        </FormField>

        <button type="submit" disabled={!pode} className={btnPrimario} style={{ boxShadow: "0 8px 24px -8px var(--acc)" }}>
          {salvando ? "Salvando…" : "Continuar"}
        </button>
      </form>
    </div>
  );
}
