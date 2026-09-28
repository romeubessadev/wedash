import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui";
import { BrandMark } from "@/pages/auth/authKit";
import { CampoSenha, ForcaSenha, acessoBotao } from "@/pages/access/AccessKit";
import { PRODUCT_NAME } from "@/data/wedash/tenant";
import { senhaValida } from "@/lib/password";
import { paths } from "@/router/paths";
import { destinationAfterAuth, changeTemporaryPassword } from "@/session/authApi";
import { useSession, useActiveSession } from "@/session/SessionProvider";

/** Primeiro acesso com senha temporária — layout RegisterSplit (form à esquerda, hero à direita). */
export function ChangePassword() {
  const session = useActiveSession();
  const { update, signOut } = useSession();
  const navigate = useNavigate();
  const { show } = useToast();

  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [carregando, setCarregando] = useState(false);

  const erroConfirma = confirma.length > 0 && confirma !== senha ? "As senhas não coincidem." : null;
  const pode = senhaValida(senha) && confirma === senha && !carregando;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!pode) return;
    setCarregando(true);
    const r = await changeTemporaryPassword(senha);
    setCarregando(false);
    if (!r.ok) {
      show(r.error, "danger");
      return;
    }
    const next = { ...session, temporaryPassword: false };
    update({ temporaryPassword: false });
    show("Senha criada com sucesso.", "success");
    navigate(destinationAfterAuth(next), { replace: true });
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
          <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-t0">Crie sua senha</h1>
          <p className="mb-7 text-sm text-t2">Escolha uma senha só sua para continuar.</p>

          <form onSubmit={salvar} className="flex flex-col gap-3.5" noValidate>
            <CampoSenha
              label="Nova senha"
              value={senha}
              onChange={setSenha}
              placeholder="Digite sua nova senha"
              autoComplete="new-password"
              autoFocus
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
            Proteja sua conta
            <br />
            antes de continuar.
          </h2>
          <p className="max-w-[380px] text-[15px] leading-relaxed text-white/70">
            A senha temporária será desativada assim que você criar uma senha só sua.
          </p>
        </div>
      </div>
    </div>
  );
}
