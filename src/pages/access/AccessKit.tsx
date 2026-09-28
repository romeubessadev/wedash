import { useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { padTopoEBase } from "@/lib/safeArea";
import { cn } from "@/lib/cn";
import { SENHA_MIN, dicaForcaSenha, senhaTemEspecial } from "@/lib/password";
import { Avatar, Button, Checkbox, FormField, Input } from "@/components/ui";
import { AuthGlow, BrandMark } from "@/pages/auth/authKit";
import { PRODUCT_NAME } from "@/data/wedash/tenant";
import { mascararCpf } from "@/lib/cpf";
import { AVATAR_TIPOS } from "@/lib/avatar";

/**
 * Complementos das telas de acesso.
 * Labels/inputs = FormField + Input do Vela (`FormElementsPage`).
 */
export { AuthGlow } from "@/pages/auth/authKit";
export { Checkbox, FormField, Input };

/** Escala tipográfica unificada com o Login. */
export const acessoTitulo = "mb-2 text-[26px] font-extrabold tracking-tight text-t0";
export const acessoSubtitulo = "mb-6 text-sm leading-relaxed text-t1";
export const acessoBotao =
  "h-[46px] w-full rounded-xl bg-acc text-sm font-bold text-white transition-colors hover:bg-acc-2 disabled:opacity-60";
export const acessoLink = "text-[13px] font-bold text-acc";
export const acessoRodape = "text-[13px] text-t2";

/** Moldura das telas de acesso, no mesmo formato de ForgotPassword/ResetPassword do template. */
export function AcessoPagina({ children, rodape, largura = 420, marca = true }: { children: ReactNode; rodape?: ReactNode; largura?: number; marca?: boolean }) {
  return (
    <div
      className="tela-cheia pad-topo pad-base relative flex w-full items-center justify-center overflow-hidden bg-bg-0 px-4"
      style={padTopoEBase("2.5rem", "2.5rem")}
    >
      <AuthGlow />
      <div className="relative w-full" style={{ maxWidth: largura }}>
        {marca && (
          <div className="mb-6 flex flex-col items-center gap-3">
            <BrandMark size={56} />
            <p className="text-[17px] font-extrabold tracking-tight text-t0">
              {PRODUCT_NAME}
              <span className="text-acc">.</span>
            </p>
          </div>
        )}
        <div className="rounded-[22px] border border-line bg-bg-2 p-7 sm:p-9" style={{ boxShadow: "0 20px 60px -20px rgba(0,0,0,.6)" }}>
          {children}
        </div>
        {rodape && <div className="mt-5">{rodape}</div>}
      </div>
    </div>
  );
}

const inputErro = "!border-2 !border-bad bg-bad-soft";

const olhoBtn =
  "absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-t2 hover:bg-bg-3 hover:text-t0";

function BotaoRevelarSenha({ mostrar, onToggle }: { mostrar: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"} className={olhoBtn}>
      {mostrar ? (
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
  );
}

/** E-mail — FormField + Input (Vela). */
export function CampoEmail({
  label = "E-mail",
  value,
  onChange,
  erro,
  className,
  ...props
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  erro?: string | null;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <FormField label={label} error={erro ?? undefined}>
      <Input
        {...props}
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="email"
        autoComplete={props.autoComplete ?? "username"}
        placeholder={props.placeholder ?? "seu@email.com"}
        className={cn(erro && inputErro, className)}
      />
    </FormField>
  );
}

/** CPF com máscara — FormField + Input (Vela). */
export function CampoCpf({
  label = "CPF",
  value,
  onChange,
  erro,
  className,
  ...props
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  erro?: string | null;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <FormField label={label} error={erro ?? undefined}>
      <Input
        {...props}
        value={value}
        onChange={(e) => onChange(mascararCpf(e.target.value))}
        inputMode="numeric"
        autoComplete={props.autoComplete ?? "username"}
        placeholder={props.placeholder ?? "000.000.000-00"}
        className={cn("font-mono tracking-wide", erro && inputErro, className)}
      />
    </FormField>
  );
}

/** Senha com revelar — FormField + Input (Vela). */
export function CampoSenha({
  label = "Senha",
  value,
  onChange,
  placeholder = "Digite sua senha",
  autoComplete = "current-password",
  erro,
  className,
  ...props
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  erro?: string | null;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <FormField label={label} error={erro ?? undefined}>
      <div className="relative">
        <Input
          {...props}
          type={mostrar ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={cn("pr-12", erro && inputErro, className)}
        />
        <BotaoRevelarSenha mostrar={mostrar} onToggle={() => setMostrar((m) => !m)} />
      </div>
    </FormField>
  );
}

export type DadosPessoais = {
  nome: string;
  sobrenome: string;
  /** Foto escolhida (opcional) + URL local para o preview. */
  foto: File | null;
  fotoPreview: string | null;
};

export const dadosPessoaisVazios: DadosPessoais = { nome: "", sobrenome: "", foto: null, fotoPreview: null };

export function dadosPessoaisValidos(d: DadosPessoais): boolean {
  return d.nome.trim().length >= 2 && d.sobrenome.trim().length >= 2;
}

/** Separa um nome completo em nome (1ª palavra) + sobrenome (resto) para pré-preencher. */
export function separarNome(completo: string): Pick<DadosPessoais, "nome" | "sobrenome"> {
  const [nome = "", ...resto] = completo.trim().split(/\s+/);
  return { nome, sobrenome: resto.join(" ") };
}

/** Foto (opcional) · Nome · Sobrenome — cadastro pessoal do primeiro acesso. */
export function CamposPessoais({
  valor,
  onChange,
  email,
  autoFocus,
}: {
  valor: DadosPessoais;
  onChange: (patch: Partial<DadosPessoais>) => void;
  email: string;
  autoFocus?: boolean;
}) {
  const arquivoRef = useRef<HTMLInputElement>(null);
  const nomeCompleto = `${valor.nome} ${valor.sobrenome}`.trim();

  function trocarFoto(file: File | null) {
    if (valor.fotoPreview) URL.revokeObjectURL(valor.fotoPreview);
    onChange({ foto: file, fotoPreview: file ? URL.createObjectURL(file) : null });
  }

  return (
    <>
      <FormField label="Foto de perfil" hint="Opcional. Aparece no topo da WeDash e para a sua equipe.">
        <div className="flex items-center gap-3">
          <Avatar name={nomeCompleto || "?"} src={valor.fotoPreview} size="xl" />
          <div className="flex flex-col items-start gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => arquivoRef.current?.click()}>
              {valor.foto ? "Trocar foto" : "Adicionar foto"}
            </Button>
            {valor.foto && (
              <button type="button" onClick={() => trocarFoto(null)} className="text-[11.5px] font-semibold text-t2 hover:text-bad">
                Remover
              </button>
            )}
          </div>
          <input
            ref={arquivoRef}
            type="file"
            accept={AVATAR_TIPOS}
            className="hidden"
            onChange={(e) => {
              trocarFoto(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </div>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Nome" required>
          <Input value={valor.nome} onChange={(e) => onChange({ nome: e.target.value })} autoComplete="given-name" autoFocus={autoFocus} maxLength={40} />
        </FormField>
        <FormField label="Sobrenome" required>
          <Input value={valor.sobrenome} onChange={(e) => onChange({ sobrenome: e.target.value })} autoComplete="family-name" maxLength={60} />
        </FormField>
      </div>
      {/* Escondido: gerenciador de senhas associa a senha nova a este login. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden className="sr-only" />
    </>
  );
}

/** Aviso neutro dentro do card. */
export function AvisoCard({ tom = "info", children }: { tom?: "info" | "ok" | "bad" | "warn"; children: ReactNode }) {
  const cores = {
    info: "border-info/30 bg-info-soft",
    ok: "border-ok/30 bg-ok-soft",
    bad: "border-bad/30 bg-bad-soft",
    warn: "border-warn/30 bg-warn-soft",
  };
  return <div className={cn("rounded-xl border px-3.5 py-3 text-sm leading-relaxed text-t0", cores[tom])}>{children}</div>;
}

/** Ícone redondo no topo do card, como em ForgotPassword/ResetPassword do template. */
export function IconeCard({ tom = "acc", centralizado = false, children }: { tom?: "acc" | "ok" | "bad" | "warn" | "info"; centralizado?: boolean; children: ReactNode }) {
  const bg = { acc: "bg-acc-soft", ok: "bg-ok-soft", bad: "bg-bad-soft", warn: "bg-warn-soft", info: "bg-info-soft" }[tom];
  const cor = { acc: "var(--acc)", ok: "var(--ok)", bad: "var(--bad)", warn: "var(--warn)", info: "var(--info)" }[tom];
  return (
    <div className={cn("mb-5 flex h-16 w-16 items-center justify-center rounded-[18px]", bg, centralizado && "mx-auto")} style={{ color: cor }}>
      {children}
    </div>
  );
}

/** Medidor de força da senha (barras Vela). */
export function ForcaSenha({ senha }: { senha: string }) {
  const n = senha.length;
  const temEspecial = senhaTemEspecial(senha);
  const nivel = n === 0 ? 0 : n < SENHA_MIN ? 1 : !temEspecial ? 2 : n < 12 ? 3 : 4;
  const cor = nivel <= 1 ? "bg-bad" : nivel === 2 ? "bg-warn" : "bg-ok";
  return (
    <div>
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-[5px] flex-1 rounded-sm", i <= nivel ? cor : "bg-bg-inset")} />
        ))}
      </div>
      <p className="mt-1.5 text-[11.5px] text-t2">{dicaForcaSenha(senha)}</p>
    </div>
  );
}
