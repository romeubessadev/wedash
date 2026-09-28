import { Link, useNavigate } from "react-router-dom";
import { Avatar, Badge, Button, Card, CardTitle, PageHeader } from "@/components/ui";
import { paths } from "@/router/paths";
import { stores } from "@/data/wedash/stores";
import { mascararCpf } from "@/lib/cpf";
import { roleLabel, useSession, useActiveSession } from "@/session/SessionProvider";

export function Profile() {
  const session = useActiveSession();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const minhas = stores.filter((f) => session.stores.includes(f.id));

  return (
    <div>
      <PageHeader title="Meu perfil" subtitle="Sua conta e seu acesso a esta franquia" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-4">
            <Avatar name={session.name} src={session.avatarUrl} size="xl" />
            <div className="min-w-0">
              <p className="truncate text-[17px] font-extrabold text-t0">{session.name}</p>
              <p className="text-[12.5px] text-t2">{session.email}</p>
              <p className="mt-1 font-mono text-[12px] text-t1">CPF {mascararCpf(session.cpf)}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-2 text-[13px]">
            <div className="flex items-center justify-between border-t border-line pt-3">
              <span className="text-t2">Empresa</span>
              <span className="font-bold text-t0">{session.companyName || "—"}</span>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-3">
              <span className="text-t2">Role</span>
              <Badge variant="accent">{roleLabel[session.role]}{session.isOwner ? " · proprietária" : ""}</Badge>
            </div>
            <div className="flex items-start justify-between border-t border-line pt-3">
              <span className="text-t2">Lojas</span>
              <span className="text-right font-semibold text-t0">{minhas.map((f) => f.fantasia).join(", ")}</span>
            </div>
          </div>
          <p className="mt-5 text-[11.5px] text-t2">A senha é sua, não da franquia. Trocar a senha desconecta todos os aparelhos em todas as franquias em que você tem acesso.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={paths.access.forgot}>
              <Button variant="outline" size="sm">
                Trocar senha
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                signOut();
                navigate(paths.access.login);
              }}
            >
              Sair deste aparelho
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle>App no celular</CardTitle>
          <p className="mt-1 text-[12.5px] text-t1">{session.appInstalled ? "Instalado. As notificações de degrau chegam por aqui." : "Ainda não instalado. Sem o app, o aviso de degrau vira rascunho de WhatsApp para o gestor enviar."}</p>
          <div className="mt-4">
            <Link to={paths.access.install}>
              <Button size="sm" variant={session.appInstalled ? "outline" : "primary"}>
                {session.appInstalled ? "Ver o guia de novo" : "Instalar o app"}
              </Button>
            </Link>
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <p className="text-[12.5px] font-bold text-t0">Outras franquias</p>
            <p className="mt-1 text-[12px] text-t2">Você tem acesso só a esta franquia. Se receber convite de outra, o seletor aparece aqui.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
