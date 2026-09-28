import { useState } from "react";
import { FormField, Input, useToast } from "@/components/ui";
import { testErpLogin, type ErpLoginResult, type ErpReportCheck } from "@/data/wedash/erp";
import { ErpReportChecks } from "@/components/wedash/ErpReportChecks";
import { gravarSenhaErp, lerSenhaErp } from "./draft";
import { noAutofill, secretStyle } from "@/lib/noAutofill";

const toastErro: Record<Exclude<ErpLoginResult, { ok: true }>["reason"], string> = {
  password: "Usuário ou senha incorretos. Nenhum dado foi salvo.",
  busy:
    "Este usuário já está logado no Millennium (outra tela, loja ou integração). Saia do ERP nesse outro lugar e toque em Testar de novo.",
  stores: "Conectou no Millennium, mas não foi possível listar as lojas. Tente de novo.",
  other: "Não foi possível conectar ao Millennium. Tente novamente em alguns minutos.",
  reports: "Este usuário não tem acesso a todos os relatórios que a WeDash usa. Nenhum dado foi salvo.",
};

const btnPrimario =
  "h-[46px] w-full rounded-xl bg-acc text-sm font-bold text-white transition-colors hover:bg-acc-2 disabled:cursor-not-allowed disabled:opacity-50";

export type ErpRascunho = {
  usuario: string;
  dedicada: boolean;
  aceite: boolean;
};

export function Step2Credentials({
  membershipId,
  inicial,
  onErpChange,
  onConcluir,
  onVoltar,
}: {
  membershipId: string;
  inicial: ErpRascunho;
  onErpChange: (erp: ErpRascunho) => void;
  onConcluir: (r: Extract<ErpLoginResult, { ok: true }>) => void;
  onVoltar?: () => void;
}) {
  const { show } = useToast();
  const [usuario, setUsuario] = useState(inicial.usuario);
  const [senha, setSenha] = useState(() => lerSenhaErp(membershipId));
  const [dedicada, setDedicada] = useState(inicial.dedicada);
  const [aceite, setAceite] = useState(inicial.aceite);
  const [testando, setTestando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [relatorios, setRelatorios] = useState<ErpReportCheck[] | null>(null);

  function syncErp(next: Partial<ErpRascunho> & { usuario?: string; dedicada?: boolean; aceite?: boolean }) {
    const erp = {
      usuario: next.usuario ?? usuario,
      dedicada: next.dedicada ?? dedicada,
      aceite: next.aceite ?? aceite,
    };
    onErpChange(erp);
  }

  const pode = usuario.trim().length > 0 && senha.length > 0 && aceite && !testando;

  async function testar() {
    if (!pode) return;
    setTestando(true);
    setRelatorios(null);
    const r = await testErpLogin(usuario, senha);
    setTestando(false);
    if (!r.ok) {
      if (r.reason === "reports" && r.reports) setRelatorios(r.reports);
      show(toastErro[r.reason], "danger");
      return;
    }
    onConcluir(r);
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-t0">Conecte o Millennium</h1>
      <p className="mb-7 text-sm text-t2">
        A WeDash usa essa conexão para sincronizar vendas, custos, estoque e cadastros. Informe um usuário e uma senha do ERP para continuar.
      </p>

      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <FormField label="Usuário do Millennium" required>
            <Input
              value={usuario}
              onChange={(e) => {
                const v = e.target.value.toUpperCase();
                setUsuario(v);
                syncErp({ usuario: v });
              }}
              placeholder="Ex.: ESSENCIA.INTEGRACAO"
              name="erp-user"
              {...noAutofill}
              autoFocus
              className="uppercase"
            />
          </FormField>
          <FormField label="Senha do Millennium" required>
            <div className="relative">
              <Input
                type="text"
                value={senha}
                onChange={(e) => {
                  setSenha(e.target.value);
                  gravarSenhaErp(membershipId, e.target.value);
                }}
                placeholder="Digite a senha do ERP"
                name="erp-secret"
                {...noAutofill}
                style={secretStyle(mostrarSenha)}
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((m) => !m)}
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-t2 hover:bg-bg-3 hover:text-t0"
              >
                {mostrarSenha ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </FormField>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-normal text-t1">
          <input
            type="checkbox"
            checked={dedicada}
            onChange={(e) => {
              setDedicada(e.target.checked);
              syncErp({ dedicada: e.target.checked });
            }}
            className="mt-0.5"
            style={{ accentColor: "var(--acc)" }}
          />
          <span>
            Este usuário será exclusivo da WeDash
            <span className="mt-0.5 block text-t2">
              O Millennium aceita uma sessão por usuário: se alguém entrar com ele no sistema, um derruba o outro e a
              sincronização para. Use um usuário criado só para a WeDash.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-normal text-t1">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => {
              setAceite(e.target.checked);
              syncErp({ aceite: e.target.checked });
            }}
            className="mt-0.5"
            style={{ accentColor: "var(--acc)" }}
          />
          Autorizo a WeDash a usar estes dados para realizar a sincronização
        </label>

        {relatorios && <ErpReportChecks reports={relatorios} username={usuario.trim()} />}

        <button type="button" disabled={!pode} onClick={testar} className={btnPrimario} style={{ boxShadow: "0 8px 24px -8px var(--acc)" }}>
          {testando ? "Testando conexão e relatórios…" : "Testar e continuar"}
        </button>
        {onVoltar && (
          <button type="button" onClick={onVoltar} disabled={testando} className="text-center text-[13px] font-semibold text-t2 hover:text-t0 disabled:opacity-60">
            Voltar
          </button>
        )}
      </div>
    </div>
  );
}
