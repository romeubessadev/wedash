import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button, Card, CardSubtitle, CardTitle, FormField, Input, Segmented, useToast } from "@/components/ui";
import { CampoFoto, CampoSenha, CamposNome, ForcaSenha, nomePessoaValido, type NomePessoa } from "@/pages/access/AccessKit";
import { FormActions, SAVE_ERROR_MSG } from "@/pages/operation/shared";
import { senhaValida } from "@/lib/password";
import { titleName } from "@/lib/format";
import { changeMyPassword, fetchMyNames, saveMyProfile } from "@/session/authApi";
import { roleLabel, useActiveSession, useSession } from "@/session/SessionProvider";
import { useTheme, type ThemePreference } from "@/theme/ThemeProvider";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Automático" },
];

function dividirNome(nome: string): NomePessoa {
  const [first = "", ...rest] = nome.trim().split(/\s+/);
  return { nome: first, sobrenome: rest.join(" ") };
}

function PersonalDataCard() {
  const session = useActiveSession();
  const { update } = useSession();
  const { show } = useToast();
  const [salvo, setSalvo] = useState<NomePessoa>(() => dividirNome(session.name));
  const [nome, setNome] = useState<NomePessoa>(salvo);
  const [foto, setFoto] = useState<File | null>(null);
  const [removida, setRemovida] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let vivo = true;
    void fetchMyNames(session.name).then((n) => {
      if (!vivo) return;
      const lido = { nome: n.firstName, sobrenome: n.lastName };
      setSalvo(lido);
      setNome(lido);
    });
    return () => {
      vivo = false;
    };
  }, [session.name]);

  const dirty = nome.nome.trim() !== salvo.nome || nome.sobrenome.trim() !== salvo.sobrenome || foto !== null || removida;

  function reset() {
    setNome(salvo);
    setFoto(null);
    setRemovida(false);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!dirty || saving) return;
    if (!nomePessoaValido(nome)) return show("Informe nome e sobrenome com pelo menos 2 letras cada.", "danger");
    setSaving(true);
    const r = await saveMyProfile({ firstName: nome.nome, lastName: nome.sobrenome, photo: foto, removePhoto: removida });
    setSaving(false);
    if (!r.ok) return show(r.error || SAVE_ERROR_MSG, "danger");
    update({ name: r.name, ...(r.avatarUrl !== undefined ? { avatarUrl: r.avatarUrl } : {}) });
    const novo = { nome: titleName(nome.nome), sobrenome: titleName(nome.sobrenome) };
    setSalvo(novo);
    setNome(novo);
    setFoto(null);
    setRemovida(false);
    show("Alterações salvas.", "success");
  }

  return (
    <Card>
      <div className="mb-5">
        <CardTitle>Dados pessoais</CardTitle>
        <CardSubtitle>Seu nome e sua foto aparecem no menu e para os outros usuários.</CardSubtitle>
      </div>
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <CampoFoto
          nome={nome}
          foto={foto}
          atual={removida ? null : session.avatarUrl}
          onChange={(f) => {
            setFoto(f);
            setRemovida(f === null);
          }}
        />
        <CamposNome valor={nome} onChange={(p) => setNome((n) => ({ ...n, ...p }))} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="E-mail">
            <Input value={session.email} readOnly disabled />
          </FormField>
          <FormField label="Papel">
            <div className="flex h-10 items-center">
              <Badge variant="accent">{roleLabel[session.role]}</Badge>
            </div>
          </FormField>
        </div>
        <FormActions dirty={dirty} saving={saving} onReset={reset} />
      </form>
    </Card>
  );
}

function PasswordCard() {
  const session = useActiveSession();
  const { show } = useToast();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [saving, setSaving] = useState(false);

  const erroConfirma = confirma.length > 0 && confirma !== nova ? "As senhas não coincidem." : null;
  const pode = atual.length > 0 && senhaValida(nova) && confirma === nova && !saving;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!pode) return;
    setSaving(true);
    const r = await changeMyPassword(session.email, atual, nova);
    setSaving(false);
    if (!r.ok) return show(r.error ?? SAVE_ERROR_MSG, "danger");
    setAtual("");
    setNova("");
    setConfirma("");
    show("Senha alterada.", "success");
  }

  return (
    <Card>
      <div className="mb-5">
        <CardTitle>Senha</CardTitle>
        <CardSubtitle>Para alterar, confirme sua senha atual.</CardSubtitle>
      </div>
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        {/* Escondido: gerenciador de senhas associa a senha nova a este login. */}
        <input type="email" name="username" autoComplete="username" value={session.email} readOnly tabIndex={-1} aria-hidden className="sr-only" />
        <CampoSenha label="Senha atual" value={atual} onChange={setAtual} placeholder="Digite sua senha atual" autoComplete="current-password" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CampoSenha label="Nova senha" value={nova} onChange={setNova} placeholder="Digite a nova senha" autoComplete="new-password" />
          <CampoSenha
            label="Confirme a nova senha"
            value={confirma}
            onChange={setConfirma}
            placeholder="Digite novamente"
            autoComplete="new-password"
            erro={erroConfirma}
          />
        </div>
        <ForcaSenha senha={nova} />
        <div className="pt-1">
          <Button type="submit" disabled={!pode}>
            {saving ? "Alterando…" : "Alterar senha"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ThemeCard() {
  const { preference, setPreference } = useTheme();
  return (
    <Card>
      <div className="mb-4">
        <CardTitle>Tema</CardTitle>
        <CardSubtitle>Vale só para este aparelho. Automático segue o tema do aparelho.</CardSubtitle>
      </div>
      <Segmented options={THEME_OPTIONS} value={preference} onChange={(v) => v && setPreference(v)} />
    </Card>
  );
}

/** Conta > Meu perfil: dados pessoais, senha e tema. */
export function MyProfilePage() {
  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <PersonalDataCard />
      <PasswordCard />
      <ThemeCard />
    </div>
  );
}
