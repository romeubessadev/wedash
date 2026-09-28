import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui";
import { BrandMark } from "@/pages/auth/authKit";
import {
  CampoSenha,
  CamposPessoais,
  ForcaSenha,
  acessoBotao,
  dadosPessoaisValidos,
  type DadosPessoais,
} from "@/pages/access/AccessKit";
import { PRODUCT_NAME } from "@/data/wedash/tenant";
import { senhaValida } from "@/lib/password";
import { paths } from "@/router/paths";
import { destinationAfterAuth, createPersonalAccess } from "@/session/authApi";
import { useSession, useActiveSession } from "@/session/SessionProvider";

/**
 * Primeiro acesso com senha temporária = "Crie seu acesso": dados da pessoa + senha própria.
 * Layout RegisterSplit (form à esquerda, hero à direita). Depois segue para o onboarding (ERP → Lojas).
 */
export function CreateAccess() {
  const session = useActiveSession();
  const { update, signOut } = useSession();
  const navigate = useNavigate();
  const { show } = useToast();

  const [dados, setDados] = useState<DadosPessoais>({ nome: "", sobrenome: "", telefone: "" });
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [carregando, setCarregando] = useState(false);

  const erroConfirma = confirma.length > 0 && confirma !== senha ? "As senhas não coincidem." : null;
  const pode = dadosPessoaisValidos(dados) && senhaValida(senha) && confirma === senha && !carregando;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!pode) return;
    setCarregando(true);
    const r = await createPersonalAccess({
      firstName: dados.nome,
      lastName: dados.sobrenome,
      phone: dados.telefone,
      password: senha,
    });
    setCarregando(false);
    if (!r.ok) {
      show(r.error, "danger");
      return;
    }
    const patch = { temporaryPassword: false, name: r.name, phone: r.phone };
    update(patch);
    show("Acesso criado com sucesso.", "success");
    navigate(destinationAfterAuth({ ...session, ...patch }), { replace: true });
  }

  return (
    <div className="grid min-h-screen w-full bg-bg-0 lg:grid-cols-2">
      {/* Form — esquerda */}
      <div className="flex flex-col items-center justify-center px-6 py-12 sm:px-14">
        <div className="mb-8 flex w-full max-w-[400px] items-center justify-between">
          <div className="flex items-center gap-2.5 lg:hidden">
            <BrandMark size={34} />
            <span className="text-[16px] font-extrabold text-t0">{PRODUCT_NAME}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              signOut();
              navigate(paths.access.login);
            }}
            className="ml-auto text-xs font-semibold text-t2 hover:text-t0"
          >
            Sair
          </button>
        </div>

        <div className="w-full max-w-[400px]">
          <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-t0">Crie seu acesso</h1>
          <p className="mb-7 text-sm text-t2">Seus dados e uma senha só sua.</p>

          <form onSubmit={salvar} className="flex flex-col gap-3.5" noValidate>
            <CamposPessoais valor={dados} onChange={(p) => setDados((d) => ({ ...d, ...p }))} email={session.email} autoFocus />
            <CampoSenha
              label="Nova senha"
              value={senha}
              onChange={setSenha}
              placeholder="Digite sua nova senha"
              autoComplete="new-password"
            />
            <CampoSenha
              label="Confirme sua senha"
              value={confirma}
              onChange={setConfirma}
              placeholder="Digite novamente"
              autoComplete="new-password"
              erro={erroConfirma}
            />
            <ForcaSenha senha={senha} />
            <button type="submit" disabled={!pode} className={`mt-1 ${acessoBotao}`} style={{ boxShadow: "0 8px 24px -8px var(--acc)" }}>
              {carregando ? "Salvando…" : "Salvar e continuar"}
            </button>
          </form>
        </div>
      </div>

      {/* Hero — direita */}
      <div
        className="relative hidden flex-col justify-center overflow-hidden p-12 lg:flex"
        style={{ background: "linear-gradient(150deg,#0f2d54,#1b1650 55%,#14103a)" }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(70% 60% at 25% 80%,rgba(86,168,255,.35),transparent 60%)" }}
        />
        <div className="relative">
          <h2 className="mb-6 text-[26px] font-extrabold leading-[1.3] tracking-tight text-white">
            Seu acesso pessoal
            <br />
            à WeDash.
          </h2>
          <p className="max-w-[380px] text-[15px] leading-relaxed text-white/70">
            O acesso é seu, não da empresa. A senha temporária é desativada assim que você criar a sua.
          </p>
        </div>
      </div>
    </div>
  );
}
