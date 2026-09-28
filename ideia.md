# WeDash — Definição Completa do Produto

Tudo que foi decidido, sem especificação visual. Campos, fluxos, regras,
fórmulas, integração e comportamento de cada tela.

---

## Índice

1. O produto
2. Glossário
3. Papéis e permissões
4. Acesso — login, senha, criar conta, convite
5. Tenant e endereço próprio
6. Onboarding
7. Integração com o ERP Millennium
8. Modelo de dados
9. Métricas
10. Meta e comissão
11. Equipe — colaboradores, turnos, caixa central, tarefas, mensagens
12. Desafios
13. As visões — o que cada tela mostra
14. Inteligência
15. Modo suporte
16. Fora de escopo
17. Pendências

---

## 1. O produto

Painel de gestão para donos de franquias de varejo — rede WEPINK, perfumaria em
shopping e loja de rua — acompanharem várias lojas pelo celular ou computador.

O dono opera N lojas, sem limite. Hoje acompanha por planilha e por um painel
da franqueadora que exibe a mesma métrica com valores diferentes em telas
diferentes: quatro definições de ticket médio, dois faturamentos para o mesmo
dia, CMV somando royalties. A causa é cada tela montar a própria consulta.

O produto resolve isso com **uma camada de métricas**: cada fórmula existe uma
vez e todas as telas leem dela. Nenhuma tela calcula nada.

Dados de vendas, custos, estoque e funcionários vêm do ERP Millennium por
sincronização. Metas, comissão, desafios, turnos, tarefas, mensagens e toda a
gestão são do produto.

É um web app responsivo, instalável como PWA. Multi-tenant: cada franqueado
tem endereço próprio e identidade própria.

---

## 2. Glossário

| Termo | Significado |
|---|---|
| **identidade** | A pessoa física. CPF único global, nome, senha. Uma por CPF |
| **vínculo** | O acesso de uma identidade a **uma** franquia. N por identidade. Carrega papel e escopo de filiais |
| **tenant** | A conta do franqueado. Id interno próprio. **Nunca chaveado por CNPJ** |
| **filial** | Uma loja. Vem do ERP, nunca cadastrada à mão. Tem `tipo_ponto`: SHOPPING ou RUA |
| **credencial_erp** | Usuário e senha do Millennium. Uma por tenant, cifrada |
| **colaborador** | A pessoa no ERP. Nem todo colaborador vira usuário do app |
| **caixa central** | Cadastro genérico usado para lançar venda sem vendedora identificada |
| **divisão** | Linha de produto: WEPINK (102) ou WPINK SUPLEMENTOS (101) |
| **tipo** | Categoria do produto: Perfumaria, Body Splash, Body Cream, Hair, Skincare… |
| **meta** | Objetivo mensal, **sempre em reais**, uma por mês, com degraus |
| **desafio** | Objetivo pontual em produto, quantidade ou índice. **Nunca em reais**. N por mês |
| **degrau** | Faixa da meta: Meta, Super Meta, Hiper Meta, Meta Desafio — nomes e quantidade configuráveis |
| **proprietário** | O vínculo que administra a credencial do ERP. Um por tenant |
| **sync leve** | Só vendas do dia. Segundos de sessão no ERP |
| **sync pesado** | Custo, estoque, cadastros. Uma vez ao dia, de madrugada |

**Papel e escopo são do vínculo, não da identidade.** A mesma pessoa pode ser
gerente numa franquia e vendedora em outra.

---

## 3. Papéis e permissões

`ADMIN_GLOBAL · GESTOR · GERENTE · VENDEDOR`

Gestor absorve dono e sócio. A única distinção entre gestores é a marcação
`proprietario`, que governa apenas a credencial do ERP.

| | Gestor | Gerente | Vendedor |
|---|---|---|---|
| Escopo de filiais | todas do tenant | atribuídas | uma |
| Faturamento, ticket, PA | ✓ | ✓ | próprio |
| CMV e lucro bruto | ✓ | ✓ | — |
| Royalties, aluguel, margem *(v2)* | ✓ | — | — |
| Comissão | todos | equipe | própria |
| Metas | cria e edita | visualiza | própria |
| Ranking | completo | completo | completo |
| Chat da IA | ✓ | ✓ | — |
| Cadastrar e editar colaborador | ✓ | suas filiais | — |
| Convidar usuários | ✓ | — | — |
| Configurar custos | ✓ | — | — |
| Forçar atualização | ✓ | — | — |
| Credencial do ERP | só o proprietário | — | — |

O gestor define quais filiais cada gerente enxerga — uma, algumas ou todas.

Admin global cria e suspende contas. Acessa dado de franquia apenas em modo
suporte (seção 15).

---

## 4. Acesso

### 4.1 Login

**Campos:** CPF e senha. Só isso. Sem login social, sem e-mail como login.

- CPF com máscara `000.000.000-00`, enviado só com dígitos, dígito verificador
  validado no cliente e no servidor
- Senha oculta, com botão de revelar
- Botão desabilitado enquanto os dois campos estiverem vazios
- Link "Esqueci minha senha"
- **Não existe link de cadastro.** Franqueado é criado pelo admin; vendedora e
  gerente são convidados

**Marca:** a tela é sempre da WeDash (sem white label, decisão de 2026-09-27).
Não há marca por empresa nem endereço por empresa; todo mundo entra pelo
endereço padrão da WeDash.

**Comportamento no servidor:**

1. Resolve a identidade pelo CPF
2. Valida a senha e `identidade.status = ATIVO`
3. Busca o vínculo ATIVO da identidade (o vínculo define o tenant)
4. Emite JWT de acesso (15 min) e refresh token (30 dias), carregando
   `vinculo_id`, `tenant_id`, `papel` e as filiais do escopo
5. Se `onboarding_etapa` estiver incompleta, redireciona para ela

**A mensagem de erro é sempre a mesma** — "CPF ou senha inválidos" — para todos
estes casos: CPF não existe, senha errada, identidade suspensa, **identidade
existe mas não tem vínculo neste tenant**, vínculo pendente de aceite. Se a
resposta diferisse, qualquer pessoa descobriria quem trabalha em qual franquia
testando CPFs.

**Proteção:** 5 tentativas por CPF a cada 15 minutos, mais limite por IP. Ao
estourar, 429 com a mesma mensagem. Tempo de resposta constante: falha por CPF
inexistente não pode responder mais rápido que senha errada.

**Múltiplos vínculos:** a pessoa não escolhe nada no login. Dentro do app, se
tiver mais de um vínculo ativo, aparece um seletor de franquia no perfil. Trocar
reemite o token sem pedir senha.

**Sessão:** múltiplas sessões simultâneas permitidas — a restrição de sessão
única é do ERP, não nossa. Logout revoga o refresh token daquele dispositivo
apenas.

### 4.2 Esqueci minha senha

**Tela 1 — pedir.** Campo CPF. Botão "Enviar link". Link "Voltar para o login".

Resposta **idêntica exista ou não o CPF, e no mesmo tempo de execução**. No
servidor, só se a identidade existir e estiver ativa: gera token aleatório de
32 bytes, guarda **apenas o hash**, validade 2 horas, uso único, envia por
e-mail.

Tela de confirmação sempre com o mesmo texto: "Se houver uma conta com esse
CPF, enviamos um link para o e-mail cadastrado. O link vale por 2 horas."
**Nunca mostra o e-mail, nem mascarado** — `r***@gmail.com` já confirma a
conta.

Limite de 3 pedidos por CPF a cada hora. Ao estourar, mesma tela de
confirmação — não avisa que estourou.

**Tela 2 — redefinir.** Rota com token. Ao abrir, valida: existe, não expirou,
não usado. Token inválido mostra "Este link não é mais válido. Links de
recuperação valem por 2 horas e só podem ser usados uma vez." com botão "Pedir
um novo link". Não distingue expirado de inexistente.

Campos: nova senha e confirmação. Mínimo 10 caracteres. **Não exigir caractere
especial nem número** — regras de composição empurram para senhas piores.

Ao salvar: grava com Argon2id **na identidade**, marca o token usado, **revoga
todos os refresh tokens de todos os vínculos**. A senha é da pessoa, não da
franquia — se foi comprometida, precisa cair em todo lugar.

Depois de salvar, redireciona ao login com aviso "Senha alterada". Não faz login
automático.

### 4.3 Criar conta

Não existe cadastro público. Toda entrada começa por um link com token.

O servidor decide qual tela abrir, conforme o CPF já tenha conta ou não:

```
GET /convite/{token}
→ { tipo: "ATIVACAO" | "ACEITE", nome, nome_exibicao_tenant, papel }
→ 410 { motivo: "expirado" | "usado" | "invalido" }
```

O cliente não decide — assim a tela não revela, antes de qualquer ação, se o
CPF já existe.

**Tela A — Ativar conta nova** (CPF ainda não tem conta em lugar nenhum):

Mostra "Olá, {nome}. Crie sua senha para acessar a {franquia}." Nome e franquia
vêm do token — a pessoa não digita nada além da senha. Campos: senha e
confirmação, mínimo 10 caracteres. Botão "Criar minha conta".

No servidor: valida token, grava senha com Argon2id na identidade, marca token
usado, identidade e vínculo passam a ATIVO, `aceito_em` = agora, emite sessão.

Depois: gestor proprietário vai ao onboarding; gestor convidado e gerente vão
para a tela Loja; vendedora vai para a tela de instalação do app, pulável.

**Tela B — Aceitar vínculo** (CPF já tem conta em outra franquia):

Mostra "Você foi convidada. A {franquia} convidou você para acessar o sistema
como {papel}. Você já tem uma conta. Use a mesma senha de sempre para entrar."
Botões "Aceitar convite" e "Recusar". **Não pede senha.**

Aceitar: vínculo passa a ATIVO. Redireciona ao login. Recusar: vínculo passa a
RECUSADO, quem convidou é notificado. O vínculo não é apagado — se ela mudar de
ideia, o gestor reenvia.

**Regras de privacidade:** ninguém é adicionado a uma empresa em silêncio — sem
aceite, o vínculo fica PENDENTE e não dá acesso a nada. A tela não revela onde
mais a pessoa trabalha. Quem convidou também não descobre: ao cadastrar um CPF
que já existe, vê apenas "Esta pessoa já tem conta e receberá um convite".

**Token:** 32 bytes aleatórios, só o hash no banco, validade 48 horas, uso
único. Reemitir invalida o anterior. **Nunca usar CPF como senha temporária** —
CPF é o login e não é secreto.

### 4.4 Convite de equipe

**Vendedora** — nasce de um colaborador já sincronizado do ERP. O CPF vem do ERP
(`GERADORES[0].CPF`); o gestor preenche o e-mail. Busca identidade pelo CPF: não
existe → cria identidade PENDENTE + vínculo + token ATIVACAO; já existe → cria
**só o vínculo** + token de aceite. O vínculo com `millennium_funcionario` liga a
pessoa às vendas dela.

**Gerente e gestor** — não existem no ERP. Cadastro manual: CPF, nome, e-mail,
papel, filiais. Mesma lógica de identidade nova ou existente.

**O convite é sempre por e-mail.** Sem e-mail não dá para convidar — a linha
fica marcada como incompleta e o gestor precisa obter um endereço, ainda que
pessoal.

Qualquer gestor pode convidar e reenviar. Enquanto não ativar, o usuário fica
PENDENTE.

---

## 5. Tenant

**Sem white label** (2026-09-27): a plataforma aparece sempre como WeDash e o
acesso é sempre pelo endereço padrão — sem slug, sem subdomínio por empresa, sem
nome, logo ou cor personalizados. O tenant é resolvido pelo vínculo da pessoa
depois do login. O nome da empresa fica só como identificação da conta (perfil,
convites).

**Tenant não é chaveado por CNPJ.** Um franqueado é pessoa física com CPF.
Abaixo dele pode haver matriz com filiais (mesma raiz de CNPJ), empresas
independentes (raízes diferentes) ou mistura. **Nunca validar raiz compartilhada
de CNPJ** — rejeitaria cadastros válidos. `filial.cnpj` e `filial.tipo` (M
matriz, F filial) são informativos.

**Uma credencial do ERP por tenant.** Um login do Millennium enxerga todas as
filiais abaixo dele, inclusive com raízes diferentes. O esquema guarda
`credencial_id` na filial para permitir mais de uma no futuro, mas a v1 não
oferece cadastrar uma segunda.

---

## 6. Onboarding

Quatro etapas para o gestor proprietário, uma para a vendedora. **Retomável**:
`vinculo.onboarding_etapa` guarda o progresso.

É aqui que o ERP é chamado **em tempo real**, com o usuário esperando. Nas telas
do app o dado vem do sync.

### Etapa 1 — Empresa (obrigatória)

Campo: nome da empresa (identifica a conta; não muda a marca da plataforma).

### Etapa 2 — Credencial do ERP (obrigatória)

Campos: usuário e senha do Millennium. Checkbox "Este é um usuário exclusivo para
integração" — define o intervalo de sync (2 min se dedicada, 30 se
compartilhada). Texto explicando que o ERP aceita um login por vez e que,
enquanto o sistema sincroniza, aquele usuário não acessa. Checkbox de aceite
sobre o tratamento da credencial. Os dois aceites são obrigatórios.

Ao confirmar, **testa o login de verdade** no ERP:

```
POST http://{host}/api/login
WTS-Authorization: {usuario}/{senha}
WTS-AppName: Millennium · WTS-LicenceType: retag
→ 200 { session, ... }
```

Sucesso: cifra com AES-256-GCM e grava; **mantém a sessão aberta** para a etapa
3. Falha, discriminada pelo texto do erro 401:

| Contém | Mensagem | Ação |
|---|---|---|
| `Senha inválida` | "Usuário ou senha do Millennium incorretos" | Não grava |
| `ultrapassado o máximo` | "Seu usuário está conectado ao Millennium. Saia de lá e tente de novo" | Não grava, botão tentar de novo |
| outro | "Não foi possível conectar" | Não grava |

Nunca retentar automaticamente com senha inválida.

### Etapa 3 — Confirmar filiais (obrigatória)

Com a sessão aberta, chama `Millennium.FILIAIS.Lista`. Exibe cada filial com
código, nome, franquia, cidade/UF, e para cada uma pede o **tipo de ponto**:
Rua ou Shopping — obrigatório, não vem do ERP, define o modelo de aluguel.
Selo "WPINK" quando `WPINK = true`.

Todas vêm marcadas; desmarcar exclui. Persiste incluindo `cnpj`, `tipo`,
`tem_wpink`, `tipo_ponto`, `credencial_id`. **Não valida raiz de CNPJ.**

Ao concluir, faz logout do ERP e agenda o primeiro sync.

Zero filiais: "Este usuário do Millennium não tem lojas vinculadas."

### Etapa 4 — Equipe (pulável)

**Carregamento assíncrono.** Chama `FUNCIONARIOS.Lista` por filial (rápido) e
renderiza a lista na hora, com nome e uma linha de carregamento no lugar do CPF.
Depois chama `FUNCIONARIOS.Consulta` por funcionário, preenchendo cada linha
conforme chega, com progresso "Carregando detalhes — 6 de 10". Falha numa linha
marca só aquela — nunca derruba a tela.

Duas seções:

**Precisam de atenção** — quem está com cargo VENDEDOR mas parece caixa central
(botão "Marcar como caixa central", grava só do nosso lado), e quem está
desativado no ERP ainda com cargo VENDEDOR (botão "Corrigir no Millennium",
escreve no ERP).

**Darão acesso ao app** — para cada vendedora: checkbox, CPF (vem do ERP, só
confere), e-mail (obrigatório para convidar, só no nosso banco), celular (só no
nosso banco), turno. Turnos precisam existir; se a filial não tiver, a tela
pede para criar com horário.

Botões "Convidar marcadas" e "Fazer isso depois". Ambos levam à tela Loja, que
funciona sem nenhum cadastro.

### Etapa vendedora — Instalar o app (pulável)

Após criar a senha. Detecta a plataforma e mostra só o caminho certo: iOS →
Compartilhar e Adicionar à Tela de Início; Android → banner do Chrome. No iOS,
push só funciona com o app instalado. Permissão de notificação pedida depois da
instalação.

No computador, a tela muda: "O app funciona melhor no celular" com botão "Enviar
link pro meu e-mail" e "Continuar no computador". O guia fica permanente no
perfil.

Quem pular vê aviso persistente. Sem push ativo, o aviso de degrau cai para
rascunho de WhatsApp.

---

## 7. Integração com o ERP Millennium

### 7.1 Fundamentos

- Base: `http://177.85.160.35:6017/api/`
- **Uma sessão simultânea por usuário.** Enquanto o sistema sincroniza, o
  franqueado não usa o ERP
- **HTTP puro, sem TLS.** Credencial trafega no header `WTS-Authorization`. Não
  corrigível do nosso lado. Chamada só do servidor, nunca do app
- **Bloqueia requisições de fora do Brasil.** IP de saída brasileiro é
  requisito. Backend no Brasil dispensa proxy
- **Paginação: `$top=0`** retorna todos. Valor fixo trunca em silêncio, e o
  registro some da lista em vez de aparecer zerado
- Headers comuns: `Content-Type: application/json`, `X-DateFormat: ISOTZ`,
  `X-HTTP-Method: GET` (POST no wtsreports), `X-IdentifierCase: upper`,
  `WTS-Session: {token}`

### 7.2 Chaves de junção

| Entidade | Chave — usar | Display — exibir |
|---|---|---|
| Filial | `FILIAL` / `COD` int | `COD_FILIAL` string `"00010"` |
| Funcionário | `FUNCIONARIO` int | `COD_FUNCIONARIO` string `"0343"` |
| Vendedora em relatório | `FUNCIONARIO_GERADOR_GERADOR` int | nome |
| Produto | `PRODUTO` int | `COD_PRODUTO` string |

**Nunca casar por descrição** — contém caractere invisível (U+00AD em
`"WE­PINK"`), espaço duplo, espaço à direita. **Nunca casar por código de
display** — preenchimento com zero é inconsistente (`"0343"`, `"10"`,
`"1009"`).

### 7.3 Sessão

```
adquirir lock(credencial_id)          ← distribuído, obrigatório
  fechar sessão órfã se houver
  POST /api/login
  try:
    tarefas do ciclo com WTS-Session
  finally:
    POST /api/logout                  ← SEMPRE
liberar lock
```

Lock **por credencial**, não por tenant nem por filial. Sem o `finally`, uma
falha deixa a sessão aberta e o franqueado trava fora do ERP até ele expirar.

**Os dois 401 são opostos:**

| Contém | Ação |
|---|---|
| `ultrapassado o máximo` | Sessão ocupada. Retentar 1×/min, teto 20 |
| `Senha inválida` | **Parar.** Marcar credencial INVALIDA, notificar |
| outro | Parar e alertar |

Nunca retentar credencial inválida — pode bloquear a conta no ERP.

### 7.4 Leitura

**VENDAS.Lista** — o mais importante. Uma chamada por filial por período cobre
faturamento, atendimentos, itens, ticket, PA, preço médio, ranking, hora a
hora, meios de pagamento e turno.

Parâmetros: `DATAI`, `DATAF` (meia-noite local em UTC — MS = `T04:00:00.000Z`),
`FILIAL` (int `FILIAL`/`COD`, não o `COD_FILIAL` display), `CANCELADA: false`,
`GERADOR: "C"`, `GERADOR_COM: "V"`, e **`EVENTO: "(id1,id2,…)"`**.

*Armadilha — EVENTO:* sem filtro a Lista traz transferência e outros movimentos e
**infla o faturamento** vs a tela de vendas da franquia. A UI filtra eventos
`S-X`, `S-03`, `S-100` e `S-{COD_FILIAL sem zero à esquerda}` (ex.: filial
`00010` → `S-10`). IDs vêm de `EVENTOS.ListaTodos`. Exemplo filial 8:
`EVENTO: "(17,24,22,107)"`.

Campos: `COD_OPERACAO` (chave), `DATA_H` (**timestamp real**), `DATA` (nominal,
**não usar em cálculo**), `VALOR_FINAL` (faturamento), `QUANTIDADE` (**itens da
venda** — evita chamar o detalhe), `VENDEDOR_MILLENNIUM` (vendedora, por
**nome**), `USUARIO` (login da loja, não a vendedora), `CONDICAO` (meio de
pagamento), `EVENTO`.

*Armadilha — fuso:* Mato Grosso do Sul é UTC−4. `DATA_H` `2026-08-30T15:59:24Z`
= 30/08 11:59 local, correto. `DATA` `2026-08-30T03:00:00Z` = **29/08 23:00**
local, errado — foi gravado como meia-noite UTC−3. Agrupar por `DATA` joga o
faturamento para o dia anterior. **Usar sempre `DATA_H` no fuso da filial.** O
fuso é atributo da filial.

*Armadilha — vendedora por nome:* normalizar os dois lados (trim, maiúsculas,
sem acento, espaços colapsados), casar contra colaboradores da mesma filial;
sem correspondência ou ambíguo → fila de conciliação, nunca descarte. Venda não
conciliada permanece no faturamento e fica fora do ranking. Preferir o relatório
por vendedor, que devolve id.

*Cancelamento:* `CANCELADA` é parâmetro de entrada, não campo. A testar se
`null` traz as duas.

**RELATORIOMARGEM** — fonte única de custo. Uma chamada por filial por período.
Parâmetros: `FILIAL`, `DATAI`, `DATAF`. Campos: `COD_PRODUTO`, `QTDE_VENDIDA`,
`CUSTO_FRANQUIAS` (**custo unitário de fábrica, sem imposto**), `CUSTO_TOTAL`,
`TOTALVENDA` (**não usar como faturamento**), `MARGEM` (reais), `MKT`
(desconhecido, valores 2 e 3).

*Armadilha:* `PERC_MARGEM` é **CMV%**, não margem. `PORCENTAGEM` é **markup**.
Nenhum dos dois é margem. Margem = `MARGEM ÷ TOTALVENDA`. Exibir `PERC_MARGEM`
como margem mostra 32% onde o correto é 68%.

*Armadilha:* `CUSTO_FRANQUIAS` é custo de mercadoria, cerca de 32% do preço —
não confundir com a linha "Custo Franquias" do painel antigo, que era royalties.

*Armadilha:* diverge do `VENDAS.Lista` no mesmo dia — R$ 5.788,33 contra
R$ 5.984,13. **Faturamento vem sempre do VENDAS.Lista; custo sempre daqui.**
Divergência acima de 1% gera alerta, não correção.

*Custo real:* `custo_real = CUSTO_FRANQUIAS × (1 + imposto%)`, com `imposto%`
configurado por filial. Há informação contraditória sobre se o imposto já está
embutido — conferir uma nota de compra contra o campo. Afeta o único número
financeiro da v1.

**ESTOQUEEMCOMPRA** — fonte principal de estoque. Uma por filial. Campos:
`COD_PRODUTO`, `SALDO` (**consolidado de todos os locais**, pode ser `null` —
tratar como zero), `QUANTIDADE_PEDIDO`, `QUANTIDADE_FATURADA`, `TOTAL` (= soma
dos três, verificado), `QUANTIDADE_MULTIPLA` (**múltiplo de compra**: 4, 6, 12,
16, 24, 36, 40), `BLOQUEADO_COMPRA`, `DATA_CADASTRO`.

*Saldo negativo consolidado* = nota de entrada pendente. Estoque físico não fica
negativo; a mercadoria chegou e foi vendida antes da nota. Cobertura sobre
negativo é ruptura mais alerta de lançamento.

*`BLOQUEADO_COMPRA` com estoque é o melhor sinal de desafio.* Não pode ser
reposto, então empurrar a venda não causa ruptura. Filial 8: 16 produtos, 214
unidades, maior caso Fortalecedor Wedrop Incolor com 103.

*Toda quantidade sugerida em pedido arredonda para cima no múltiplo.*

**ESTOQUEPORLOCAL** — só para transferência interna pendente. Saldo por local
(`QUIOSQUE`, `SHOP010`, `ESTOQUE`… varia por filial). Nunca usar em cobertura:
quando há transferência pendente, os dois locais estão errados e só a soma está
certa. Métrica: `Σ |SALDO| onde SALDO < 0`. Rodar semanal.

**Produtos por vendedor (wtsreports)** — agregado por vendedora e produto.
**Devolve id da vendedora** (`FUNCIONARIO_GERADOR_GERADOR`), eliminando o
casamento por nome. Campos `F_3887607047` (quantidade) e `F_366619977` (valor).
Traz `VENDA_BRINDESITE` e `VENDA_BONIFICADO` — item brindado **tem custo e não
tem receita**; recomendado: fora da receita, custo no CMV, linha própria.
Falta o `CATALOG_GUID`.

**Produtos e EAN (wtsreports)** — global. Mapa `PRODUTO` int ↔ `COD_PRODUTO`
string. Uma linha por código de barras, não por produto — deduplicar por
`PRODUTO`. Nem toda "barra" é EAN — alguns trazem o próprio código; EAN real tem
13 dígitos começando em 789 ou 790.

**Lookups** — `$lookup=produto.tipo.tipo` e `$lookup=produto.divisao.divisao`.
São dicionários, não atribuição. TIPO tem 19 valores incluindo as 9 categorias
do painel; **dois registros com descrição "INDEFINIDO"** e ids diferentes —
agrupar por id, exibir a descrição. DIVISAO: 2 SKINCARE, 101 WPINK
SUPLEMENTOS, 102 WEPINK — é por aqui que sai a alíquota de royalties por linha.

**FILIAIS.Lista** — campos `FILIAL`/`COD`, `COD_FILIAL`, `NOME`, `FANTASIA`,
`CGC`, `CIDADE`, `ESTADO`, `FRANQUIA`, `TIPO` (M/F), `WPINK`,
`DATA_INAUGURACAO`. Reconsultar no sync pesado; filial nova notifica para
confirmar, não adiciona automaticamente.

**FUNCIONARIOS.Lista** (`{"FILIAL": int, "CARGO": 1}`) e
**FUNCIONARIOS.Consulta** (`{"FUNCIONARIO": int}`, uma por funcionário — roda no
pesado). Copiar do Consulta **apenas**: `GERADORES[0].CPF` (formatado,
normalizar), `GERADORES[0].E_MAIL`, `DATA_ADMISSAO`, e as flags. **Não copiar**
RG, aniversário, sexo, salário, endereços, dados bancários.

*As quatro flags de status são alternativas:* `INATIVO`, `DESATIVADO` (dentro de
`GERADORES`), `AFASTADO`, `NAO_MOSTRAR_NO_EVENTO`. O usuário marca a que
preferir, e elas discordam — na funcionária 20656, desligada, `INATIVO` vem
`false` e as outras três `true`. Regra: **OR entre as quatro**. Consequência: o
sistema não distingue desligamento de afastamento — tratar sempre como
reversível.

*`CARGO` muda de tipo:* `"VENDEDOR"` string no Lista, `1` número no Consulta e
Altera.

### 7.5 Escrita

Testado com dois funcionários descartáveis, criados e removidos.

**A regra que mais importa:** omitir um array do payload **apaga** o conteúdo.
Mandar array vazio não apaga. Inverso da intuição. Payload enxuto destrói
endereço, contato e conta bancária sem nenhum erro. **Toda escrita usa echo
completo:** Consulta → guarda em memória → altera os campos da lista branca →
Altera com o objeto inteiro → Consulta e compara → descarta. O objeto completo
**nunca é persistido**.

**Lista branca:** `CARGO`, `INATIVO`, `AFASTADO`, `NAO_MOSTRAR_NO_EVENTO`,
`DATA_ADMISSAO` (raiz); `NOME`, `CPF`, `DESATIVADO` (`GERADORES[0]`). Contato,
aniversário, turno e tipo **não são escritos no ERP**.

**Inclui:** não aceita `FUNCIONARIO` (gerado pelo servidor), retorna o id,
funciona sem endereços, rejeita duplicidade por código/IE/RG/CPF/CGC/CNPJ.
`COD_FUNCIONARIO` é gerado por nós: convenção **4 primeiros dígitos do CPF**
(confirmado: `066.567.161-05` → `0665`). Colisão é provável — dígitos
sequenciais por região. Tentar os 4 últimos; depois manual.

**Retry:** endpoints de escrita enviam corpo com `X-HTTP-Method: GET` — proxies
podem repetir sozinhos. **Desabilitar retry automático.** Se a resposta do
Inclui se perder: chamar Lista, procurar o `COD_FUNCIONARIO` gerado; achou → é
nosso.

**Nunca:** expor `Exclui` (destrói vínculo com histórico); payload parcial no
Altera; persistir objeto completo; escrever durante sync; escrever sem registrar
quem, quando, campo, antes e depois.

### 7.6 Sync

**Leve — apenas `VENDAS.Lista`.** Uma chamada por filial. Segundos de sessão.
Alimenta tudo que muda no dia.

**Pesado — todo o resto.** Margem, estoque, produtos por vendedor, cadastros,
lookups. Cinco chamadas por filial mais duas globais. Uma vez ao dia, de
madrugada.

| | Credencial dedicada | Compartilhada |
|---|---|---|
| Leve | 2 min | 30 min |
| Pesado | 1×/dia | 1×/dia, fora do expediente |

Nunca simultâneos na mesma credencial. Sem limite de filiais — o tempo cresce
linear e a sessão continua uma; se necessário, quebrar o pesado em lotes com
logout entre eles.

O app faz polling do nosso backend a cada 60s na visão de hoje. Não deixa o
dado mais fresco — só atualiza a tela no instante em que um sync termina.

**Forçar atualização:** dispara o sync leve. Só gestor, 1× a cada 5 min.
Gerente e vendedora não têm o botão — derrubariam o franqueado do ERP sem
entender.

**Credencial inválida** notifica o franqueado ativamente. Sem isso o sync morre
em silêncio.

---

## 8. Modelo de dados

```
tenant             id, nome, intervalo_sync_leve_min, ativo

identidade         id, cpf (ÚNICO global), nome, email, telefone,
                   senha_hash (Argon2id), status, ultimo_login
                   status: PENDENTE | ATIVO | SUSPENSO

vinculo            id, identidade_id, tenant_id, papel, status,
                   proprietario (bool, máx 1 por tenant), onboarding_etapa,
                   aceito_em
                   UNIQUE (identidade_id, tenant_id)

vinculo_filial     vinculo_id, filial_id

filial             id, tenant_id, credencial_id,
                   millennium_filial (int, CHAVE), cod_filial (display),
                   nome, fantasia, cnpj, cidade, uf, franquia,
                   tipo (M|F, informativo), tipo_ponto (SHOPPING|RUA),
                   tem_wpink, fuso_horario, horario_abertura,
                   horario_fechamento, data_inauguracao, ativa

credencial_erp     id, tenant_id, usuario_millennium, senha_cifrada (AES-256-GCM),
                   dedicada, status, ultimo_sucesso, ultimo_erro
                   status: VALIDA | INVALIDA | NAO_CONFIGURADA

sessao_erp         id, credencial_id, token, aberta_em, fechada_em, status
                   status: ABERTA | FECHADA | ORFA

token_acesso       id, identidade_id, tipo, hash, expira_em, usado_em
                   tipo: ATIVACAO | RECUPERACAO | CONVITE

config_filial      filial_id, vigencia_desde,
                   royalties_wepink_pct, marketing_wepink_pct,
                   royalties_wpink_pct, marketing_wpink_pct,
                   aluguel_tipo (PERCENTUAL_COM_MINIMO | FIXO),
                   aluguel_pct, aluguel_minimo, aluguel_fixo,
                   custo_fixo_mensal, imposto_sobre_custo_pct,
                   margem_minima_pct

turno              id, filial_id, nome, hora_inicio, hora_fim, ativo

colaborador        id, tenant_id, filial_id,
                   millennium_funcionario (int, CHAVE), cod_funcionario,
                   nome, cargo, data_admissao,
                   desativado, nao_mostrar_evento, afastado, inativo,
                   ─── só do nosso lado ───
                   email_app, celular, data_aniversario, turno_id,
                   tipo (VENDEDOR|CENTRAL), excluir_de_ranking,
                   motivo_inatividade (FERIAS|LICENCA|DESLIGAMENTO|OUTRO),
                   data_inatividade, vinculo_id (nullable)

config_rateio      filial_id, modo (NAO_RATEIA|TURNO|TODOS)

meta               id, filial_id, competencia, nome, valor_loja,
                   degraus[] { nome, atingimento_min_pct, comissao_pct, bonus }

meta_individual    meta_id, colaborador_id, valor, fator_dias_efetivos

desafio            id, filial_id, nome, tipo (PRODUTO|QUANTIDADE|INDICE),
                   criterio, meta_por_pessoa, premio, inicio, fim,
                   participantes[]

mensagem           id, filial_id, colaborador_id, tipo, canal, status,
                   texto, competencia, degrau_id, enviada_em, enviada_por
                   tipo: DEGRAU|ANIVERSARIO|FERIAS|RETORNO|DESLIGAMENTO
                   canal: PUSH|WHATSAPP
                   status: RASCUNHO|ENVIADA|DESCARTADA|FALHOU

modelo_mensagem    id, tenant_id, filial_id (null = rede), tipo, texto, ativo

push_subscription  vinculo_id, endpoint, chaves, plataforma, ultima_falha

tarefa             id, filial_id, turno_id, titulo, ordem, ativa
tarefa_check       id, tarefa_id, data, turno_id, concluida_em, marcada_por

documento          id, tenant_id, filial_id (null = rede), tipo, titulo,
                   corpo, versao, publicado_em
aceite_documento   documento_id, versao, vinculo_id, aceito_em, ip

acesso_suporte     id, admin_id, tenant_id, motivo, iniciado_em, expira_em
log_auditoria      id, tenant_id, vinculo_id, acao, alvo, valor_antes,
                   valor_depois, criado_em
```

---

## 9. Métricas

Uma fórmula por métrica, implementada uma vez.

```
faturamento          Σ VALOR_FINAL das vendas não canceladas
atendimentos         contagem de vendas
itens                Σ QUANTIDADE
ticket médio         faturamento ÷ atendimentos           ← NUNCA ÷ itens
preço médio          faturamento ÷ itens
PA                   itens ÷ atendimentos
CMV                  Σ (CUSTO_FRANQUIAS × (1 + imposto%) × qtd)   ← sem royalties
CMV %                CMV ÷ faturamento
lucro bruto          faturamento − CMV
custo de franquia    (royalties% + marketing%) × faturamento, por divisão   (v2)
aluguel              shopping: max(mínimo, % × faturamento) · rua: fixo    (v2)
margem contribuição  lucro bruto − franquia − aluguel − custo fixo         (v2)
atingimento          realizado ÷ meta                     ← SEM teto em 100%
necessário/dia       (meta − realizado) ÷ dias úteis restantes
projeção             ritmo ponderado por peso do dia da semana, por filial
ponto de equilíbrio  (aluguel + custo fixo) ÷ margem contribuição % ÷ dias  (v2)
cobertura            saldo consolidado ÷ venda média diária
transferências pend. Σ |SALDO| onde SALDO < 0, por local
```

**Identidade exibida:** `ticket médio = preço médio × PA`. Quando o ticket cai,
diz se foi preço (mix ou desconto) ou PA (venda adicional).

**Três correções sobre o painel antigo:** ticket médio é por atendimento; CMV é
só mercadoria; lucro bruto não absorve custo de franquia.

**Comparação de dia é contra o mesmo dia da semana anterior.** Sábado contra
sexta não diz nada.

**Projeção nunca sai nos primeiros dias do mês.** Cinco dias não projetam
trinta. Quando sair, com faixa — pessimista, provável, otimista — e o selo
"meta será atingida" só quando a faixa inteira estiver acima.

**Divergência entre relatórios do ERP gera alerta**, nunca correção silenciosa.

---

## 10. Meta e comissão

### 10.1 Estrutura

A meta é **mensal, em reais, uma por mês**. Tem degraus configuráveis pelo
franqueado — quantos, com que nome, que percentual de atingimento, que
percentual de comissão e que bônus. Exemplo:

```
Meta            100%   1,5%   + R$ 50
Super Meta      120%   2,0%   + R$ 100
Hiper Meta      150%   2,5%   + R$ 150
Meta Desafio    180%   3,0%   + R$ 200
```

O bônus é **R$ 50 por degrau cruzado, acumulativo**: quem chegou ao Hiper
cruzou três degraus e recebe R$ 150.

Comissão da pessoa = percentual da faixa atual × faturamento dela + bônus
acumulado. Sobre o faturamento **bruto ou líquido** é decisão pendente.

Cada vendedora tem meta individual. **A soma das individuais precisa fechar com
a meta da loja** — validação obrigatória na criação. Modo individual: cada uma
é avaliada sozinha e pode cruzar faixa sem que o grupo cruze.

O nome da meta vem do período; se for editável, o período aparece ao lado para
impedir o bug do painel antigo — "Meta Abril 2026" com vigência de setembro.

### 10.2 Período parcial

Quem não trabalhou o mês inteiro — entrou, saiu, férias, licença — precisa de
meta proporcional. Sem isso nunca bate meta, some do ranking e fica sem
comissão por um mês que não foi culpa dela.

**Dias efetivos**, não data de admissão: a interseção entre o período e o tempo
em que a pessoa esteve ativa, descontando `motivo_inatividade` e
`data_inatividade`.

**Proporcional por peso, não por dia corrido:**

```
fator = Σ peso dos dias efetivos ÷ Σ peso do período
```

O peso por dia da semana é o mesmo da projeção, aprendido por filial.

**A escada inteira escala pelo mesmo fator.** Se os degraus são percentuais,
ajustar a meta base já escala tudo. Se são valores em reais, cada degrau é
multiplicado.

| Componente | Em período parcial |
|---|---|
| Valores dos degraus | Escalam pelo fator |
| Percentual de comissão | Inalterado — incide sobre a venda real |
| **Bônus por faixa** | **Valor cheio.** R$ 50 por degrau cruzado, tenha trabalhado 8 dias ou 29 |

O percentual se autocorrige: 2 dias com meta de R$ 2.800 vendendo R$ 5.600 dá
200% e 3% de R$ 5.600 = R$ 168. Ninguém foi prejudicado. Prorratear o bônus foi
considerado e descartado: produziria R$ 13,50 quando a legenda diz R$ 50 —
número que ninguém explica, para diferença irrelevante.

**A soma deixa de fechar.** Meta cheia R$ 42.150, proporcional R$ 11.380: faltam
R$ 30.770. **Não é redistribuído** — as outras não pediram para vender mais. A
meta da loja permanece cheia e a lacuna aparece explicitamente: "R$ 30.770 sem
responsável — colaboradora em período parcial".

**Recálculo automático** quando alguém é adicionado, inativado ou reativado no
meio do período. A chegada de uma pessoa no dia 20 não pode depender de refazer
o plano à mão.

A pessoa em período parcial **aparece no ranking normalmente**, com rótulo. Não
existe seção separada.

**Quem sai no meio do mês** continua no ranking do mês em que trabalhou —
vendeu, tem comissão a receber. A regra é por período, não por status atual.
Como o desligamento no ERP costuma ser lançado dias depois, a tela de
inativação pede **a data**, não só o motivo, aceitando retroativo, e o recálculo
fica registrado — senão o atingimento dela salta de um dia para o outro sem
explicação.

Quem trabalhou período muito curto entra no ranking com rótulo, e o diagnóstico
ignora em comparações de desempenho — variância, não dinheiro.

### 10.3 Ranking

**Ordena por atingimento, não por faturamento.** Faturamento sem meta ao lado
premia quem tem meta menor. Exceção: período que atravessa meses desliga meta,
e aí ordena por faturamento, a única base disponível.

Vendedora vê o ranking completo.

---

## 11. Equipe

### 11.1 Colaborador não é usuário

| Situação | colaborador | usuário |
|---|---|---|
| Vendedora que usa o app | ✓ | ✓ |
| Vendedora que não usa | ✓ | — |
| Gestor ou gerente | — | ✓ |
| Caixa central | ✓ | — |

### 11.2 Fonte da verdade

O ERP ganha nos campos que existem lá. Sobrevivem ao sync só os campos locais:
`email_app`, `celular`, `data_aniversario`, `turno_id`, `tipo`,
`excluir_de_ranking`, `motivo_inatividade`, `data_inatividade`, `vinculo_id`.

Quanto menos o app escreve no ERP, menor o risco. O ERP guarda o que a pessoa
precisa para vender; o resto é nosso.

**Nada é apagado, nunca** — nem quando some do ERP. Apagar quebra o histórico.

### 11.3 Elegibilidade

```
inativo_no_erp = DESATIVADO OR NAO_MOSTRAR_NO_EVENTO OR AFASTADO OR INATIVO
vendedor_elegivel = CARGO = 1 AND NOT inativo_no_erp AND NOT excluir_de_ranking
```

O interruptor manual existe porque o sistema atende vários franqueados e não
controla a higiene do ERP de cada um. Na filial 8, o Lista devolve 10 e só 8
venderam — duas desligadas e o caixa central, todas com cargo VENDEDOR por erro
de cadastro.

### 11.4 Marcar como inativo

1. Gestor ou gerente marca
2. **App pergunta o motivo** (férias, licença, desligamento, outro) **e a data**
   (padrão hoje, aceita retroativo)
3. Grava só do nosso lado
4. Escreve a flag no ERP
5. Cria a mensagem correspondente
6. Recalcula metas proporcionais

Sem o motivo, quem entra em licença maternidade receberia a mensagem de
despedida.

**Reativação:** flags voltando a `false` no ERP reativam no próximo sync, sem
novo convite. Se o motivo era férias ou licença, cria rascunho de retorno.

### 11.5 Turno tem horário

Nome livre e **horário de início e fim**, por filial. O horário faz três coisas:
desempenho por turno derivado do horário da venda (quem troca de escala não
leva o histórico); tarefas resetam na virada; rateio do caixa central identifica
quem estava trabalhando.

**Primeiro e último turno cobrem as pontas do dia** — 00:00 e 23:59. Sem venda
órfã. Troca de escala no meio do mês: tarefas seguem a nova na hora; venda usa
horário e não é afetada.

### 11.6 Caixa central e rateio

Marcado com `tipo = CENTRAL`: **permanece no faturamento da filial** (senão o
total não bate com o ERP), **some do ranking, metas e comissão** como entidade,
tem a venda distribuída conforme configuração.

| Modo | Comportamento |
|---|---|
| `NAO_RATEIA` | A venda fica só no total da loja |
| `TURNO` | Dividida entre os colaboradores do turno em que a venda ocorreu — **padrão** |
| `TODOS` | Dividida entre todos os ativos no mês — quem estava de folga entra, injusto |

Vale para faturamento, itens e atendimentos; entra em meta e comissão; só
colaborador ativo com `tipo = VENDEDOR`; filial sem turno cai para
`NAO_RATEIA`. **A vendedora vê a parcela separada:** "R$ 340 vieram do caixa
central". Sem isso ela não confere a comissão.

### 11.7 Tarefas

Por filial e por turno. **Tarefa é da loja, não da pessoa** — qualquer
colaboradora marca; o sistema registra quem.

| Uso | Permitido |
|---|---|
| Painel por turno, dia e filial | ✓ |
| Comparativo entre turnos | ✓ |
| Diagnóstico operacional | ✓ |
| Ranking, meta, comissão | — |
| Cruzamento com desempenho individual | — |

"O turno da tarde fechou 3 de 8" é gestão. "A Marcela não marca tarefa e o PA
dela caiu" é avaliação por inferência — a equipe marca às pressas e o dado vira
lixo.

### 11.8 Documentos

Termos e regras, versionados, por filial ou rede. Nova versão exige novo aceite
de todos. Registra quem, versão, data e IP. Versão anterior nunca é
sobrescrita — pode ser usado em discussão trabalhista.

### 11.9 Mensagens

**Canal segue a natureza:** aviso vai por push, gesto vai por WhatsApp com envio
humano.

| Tipo | Canal | Gatilho | Envio | Janela |
|---|---|---|---|---|
| DEGRAU | Push | Ao cruzar um degrau, detectado no sync | Automático | Imediato |
| ANIVERSARIO | WhatsApp | Virada do mês, aniversariantes do mês | Humano | O mês |
| FERIAS | WhatsApp | Inativação com motivo férias | Humano | 3 dias |
| RETORNO | WhatsApp | Reativação após férias/licença | Humano | 3 dias |
| DESLIGAMENTO | WhatsApp | Inativação com motivo desligamento | Humano | 7 dias |

**Degrau:** uma mensagem por degrau por competência; se cair abaixo por
cancelamento e cruzar de novo, não repete.

**Push para gestores:** lembrete de fila de rascunhos, **agrupado, 1×/dia**
("3 mensagens esperando envio"), mais um na virada do mês para aniversariantes.
Sem ele o modelo de rascunho falha em silêncio. Trava contra duplicado: ao marcar
enviada, some da fila de todos.

**WhatsApp:** deep link `wa.me/55<celular>?text=` abrindo o app com o texto
preenchido; quem envia aperta o botão. Sai do número da loja, sem risco de
bloqueio, sem sessão. Volume: ~10/mês na rede. Automação por sessão QR fica
como adaptador opcional por tenant, com fallback para rascunho se cair. O app
não confirma entrega.

**Modelos:** texto na rede, valores por filial, com herança. Cada filial pode
desligar um tipo.

Colaborador sem celular não gera rascunho.

---

## 12. Desafios

Vários por mês. Medem **comportamento**: PA acima de X, tantas unidades de um
produto, tantos itens acima de um preço. Nunca em reais.

Cada um tem: nome, tipo (produto, quantidade, índice), critério, meta por
pessoa, prêmio fixo, início, fim, participantes. Produtos selecionados por
**categoria**, não SKU a SKU.

O que o gestor precisa saber não é quem está ganhando, é **se o desafio está
pegando**: quantas engajaram, se fecha no ritmo, há quantos dias roda. Um
desafio em zero há três dias está normal; em zero há vinte está morto.

Ao criar, avisar quantos já estão ativos — criar o quarto enquanto três estão
parados dilui a atenção.

**Melhor candidato:** produto com compra bloqueada e estoque. Não pode ser
reposto, então empurrar não causa ruptura. Segundo: cobertura alta com ticket
acima da média — gira o encalhe e sobe o ticket ao mesmo tempo.

---

## 13. As visões

### 13.1 Seletores

**Filial** e **período**, no cabeçalho, válidos para todas as visões. Filial
tem "Todas as lojas" para gestor com mais de uma; quem tem uma só não vê o
seletor. Período: Hoje · Ontem · 7 dias · Este mês · Mês passado ·
Personalizado. Padrão: Hoje.

Terceiro seletor **divisão** (WEPINK/WPINK), só quando a filial tem mais de uma
com movimento — hoje só Três Lagoas. Existe porque as alíquotas de royalties
diferem.

**O período decide quais blocos aparecem:**

| Bloco | Dia único | Semana | Mês |
|---|---|---|---|
| Resultado e operação | ✓ | ✓ | ✓ |
| Faturamento por hora | ✓ | — | — |
| Turno atual e tarefas | ✓ | — | — |
| Meios de pagamento | ✓ | ✓ | ✓ |
| Evolução diária | — | ✓ | ✓ |
| Lucro bruto | — | — | ✓ |
| Produtos e categorias | — | ✓ | ✓ |
| Meta, projeção, comissão | — | — | ✓ |
| Comparativo entre lojas | ✓ | ✓ | ✓ |

**Recorte que invalida uma métrica faz a métrica sumir, nunca a recalcula.**
Categoria não é filtro global — é drill dentro de produtos. Divisão ativa
oculta meta, comissão, ranking e ponto de equilíbrio.

**Período que atravessa meses** desliga meta, escada, comissão, bônus, projeção,
necessário/dia, desafios e lucro bruto — a meta é mensal e a comissão do mês
anterior já foi paga; somar dois meses parciais inventaria uma meta que nunca
existiu. Sobrevive o que é aditivo ou razão. A ausência é **explicada num
aviso**, nunca silenciosa — senão alguém tira print e conclui que a comissão
zerou. Quando um recorte desliga uma métrica, ela é **substituída por outra da
mesma família**: na equipe, comissão projetada dá lugar a preço médio, e a faixa
de indicadores mantém a forma.

O servidor devolve só os blocos válidos para a combinação. A matriz é
resolvida no backend, não no cliente.

**Hoje:** cabeçalho com "Atualizado às HH:MM", contagem até o próximo sync,
botão de forçar (só gestor). Com credencial compartilhada não existe tempo
real — a visão se chama "Hoje", não "Tempo Real".

### 13.2 Loja · todas

**Pergunta:** qual loja precisa de mim?

Faturamento consolidado, % da meta consolidada, projeção. Leitura da IA.
**Régua de metas:** uma linha por loja, todas contra a mesma marca de 100%,
ordenadas por atingimento crescente — quem precisa de atenção primeiro. Acima
de oito lojas, as cinco piores e as duas melhores, resto em rolagem. Por loja:
faturamento, % da meta, margem, dias acima do ponto de equilíbrio (v2). Toque
na loja troca o escopo. Ticket, PA e lucro bruto da rede.

Somem: hora a hora, turno, tarefas, ranking individual.

### 13.3 Loja · uma

**Pergunta:** como está o negócio e para onde foi o dinheiro?

**Resultado** — faturamento; em dia, comparado ao mesmo dia da semana anterior;
em mês, com % da meta, projeção e necessário/dia. Meta acima de 100% exibe o
valor real.

**Operação** — ticket médio, preço médio, PA, atendimentos, com a identidade
`ticket = preço × PA` explícita.

**Faturamento por hora** (só dia) — apenas o horário de funcionamento da
filial. Não as 24 horas.

**Turno atual** (só hoje) — faturamento e vendas do turno, tarefas com o que
falta marcar.

**Meios de pagamento** — agrupado por condição.

**Evolução** (semana e mês) — venda por dia, acumulado, linha de ritmo
necessário. Comparativo com período anterior atrás de toggle desligado.

**Lucro bruto** (só mês) — faturamento, CMV, lucro bruto, com percentuais.
Faturamento do VENDAS.Lista, custo do RELATORIOMARGEM. Na v1 para aqui, com
chamada para configurar custos. Na v2 continua: royalties por divisão,
marketing, aluguel (regime percentual com mínimo ou fixo, conforme tipo de
ponto), custo fixo, margem de contribuição. Regime de aluguel só em shopping:
"faltam R$ X para sair do mínimo" — enquanto no mínimo, vender não custa
aluguel.

**Margem por categoria** (semana e mês) — receita, margem em reais, margem %,
ordenado por margem em reais. As duas colunas juntas mudam a decisão:
Perfumaria dá mais lucro por unidade; Body Splash dá mais por real vendido.
Categoria por `TIPO`, agrupada por id. Toque abre os produtos. Sem curva ABC.

### 13.4 Equipe · uma loja

**Pergunta:** quem precisa de mim, por quê, e quanto vou pagar?

**Quatro indicadores:** faturamento (com variação vs mês anterior e
atendimentos), ticket médio (com variação), PA (com variação), comissão
projetada (com % do faturamento e a realizada até agora).

**Leitura da IA** que reconcilia: se a meta foi batida num mês pior que o
anterior, diz isso e diz que a meta ficou baixa. Diz como a equipe está
vendendo — menos peças, mais caras — e o efeito no mix. Nomeia quem é
prioridade, quem cruza um degrau no ritmo, quem não alcança.

**Meta do mês** com período e a escada de comissão acessível.

**Por vendedora**, ordenado por atingimento:

- Nome, dias trabalhados, **atendimentos por dia**
- **Tendência** das últimas semanas: subindo, estável, caindo — com explicação
  do que fazer
- **Posição na escada**: nome do degrau atual, percentual, realizado de meta.
  Quem está em período parcial tem rótulo e a meta proporcional visível
- **Ponto de atenção**, só para quem tem: qual dos três componentes está fora
  da média da equipe — **atendimentos por dia, preço médio ou PA** — e a ação.
  Sem atendimentos, a diagnose fica pela metade: alguém pode estar mal porque
  atende pouco, não porque vende barato. Duas vendedoras podem estar mal por
  motivos opostos e cobrar as duas do mesmo jeito não funciona
- **Comissão até agora**, com a composição: percentual mais bônus
- **Próximo degrau**: quanto ganha a mais se cruzar (vem primeiro — é o que diz
  se vale a corrida), nome do próximo degrau, quanto falta em reais e por dia,
  e o veredito honesto: cruza no ritmo, não alcança no ritmo, fecha sem
  comissão. Quem está no último degrau vê quanto rende cada R$ 1.000 a mais

**Estado e direção juntos:** acima da meta e caindo merece investigação; abaixo
e subindo está reagindo; abaixo e caindo é prioridade.

Abaixo da lista: a lacuna de meta sem responsável, quando houver.

**Desafios ativos** — lista com nome, tipo, período, dias restantes, há quantos
dias roda, progresso agregado, quantas engajadas, prêmio, e o veredito: fecha
no ritmo ou não. Cada um abre para mostrar o detalhe por pessoa, ordenado por
proximidade da meta do desafio. Cabeçalho diz quantos não fecham.

**Todo agregado abre para ser conferido contra as linhas que o compõem.**

### 13.5 Equipe · todas

**Pergunta:** qual equipe precisa de mim?

Não é um ranking único misturando quinze pessoas. É **uma linha por loja**:
vendedoras, % da meta, ticket e PA com variação, comissão projetada e % do
faturamento, quantas em queda, quantas fecham sem comissão. Ordenado por
problema. Toque entra na equipe da loja.

**Referências da rede:** maior PA, maior ticket, mais atendimentos por dia —
com nome e loja. Para usar como exemplo concreto ao cobrar.

Desafios e escadas não aparecem — são por loja.

### 13.6 Análise

**Pergunta:** o que fazer?

Achados ordenados por impacto, com filtros por categoria (equipe, produto,
unidade). Cada achado: tipo, o achado em uma frase, **a evidência numérica**,
uma ação. Sem evidência, não é exibido.

Mais o chat.

---

## 14. Inteligência

Três superfícies, um motor.

**O modelo nunca calcula.** Chama funções que consultam a camada de métricas e
recebe números prontos. Toda afirmação carrega valor, filial e período.
Permissão na ferramenta, não no prompt — o escopo vem do usuário autenticado.
Não saber é resposta válida.

### 14.1 Chat

Botão flutuante, todas as telas do app. **Gestor e gerente.** Escopo global:
responde em nível de rede e **abre por loja quando as lojas divergem** — um
produto pode ser campeão numa e encalhe noutra.

Funções: `metricas`, `produtos`, `categorias`, `produtos_composicao` (venda,
estoque, cobertura e margem juntos — para montar kit e desafio), `estoque`,
`equipe`, `metas`, `simular_desconto` (margem resultante contra a margem mínima
configurada), `comparar_filiais`.

"Posso fazer 20% em body splash?" → margem atual, margem com desconto, se passa
do piso. Sem piso configurado, devolve o número sem juízo. "Qual kit de body
splash?" → cruza o que vende, o que está encalhado, margem e faixa de preço.
"Como está a fulana?" → a árvore inteira dela.

Sem histórico entre sessões. Ação sugerida abre a tela correspondente, não
executa.

### 14.2 Leitura de tela

Uma ou duas frases no topo de cada visão. **Só aparece se disser algo que a
tela não diz** — causa, comparação ausente, recomendação. Repetir número
visível não conta. Se não achar nada não-óbvio, não renderiza. Gerada 1×/dia
por combinação de tela, escopo e período, em cache; "Hoje" regenera a cada
sync.

### 14.3 Diagnóstico

Job diário. Regras detectam; LLM redige e ordena por impacto em reais.

| Achado | Regra |
|---|---|
| Ruptura iminente | Cobertura < 15 dias em produto do topo de receita |
| Estoque parado | Cobertura > 3 meses com saldo relevante |
| Compra bloqueada com estoque | `BLOQUEADO_COMPRA` e saldo > 0 |
| PA abaixo da equipe | PA individual < média − 10% |
| Ticket abaixo da equipe | Idem |
| Atendimentos abaixo | Atend./dia < média − 15% |
| Queda de categoria | Participação caiu > 5 pontos |
| Concentração | Uma categoria > 50% |
| Fora do ritmo | Projeção < 90% da meta |
| Transferências pendentes | Saldo negativo por local |
| Nota de entrada pendente | Saldo consolidado negativo |
| Tarefas do turno | Conclusão < 70% na semana — por turno, nunca nominal |
| Cadastro incompleto | Sem celular, tipo ou turno |
| Meta frouxa | Meta > X% abaixo do realizado do mês anterior |

Achados de equipe não dependem de estoque e podem entrar antes. Comparação
entre vendedoras considera dias trabalhados. Achado de tarefa nunca cita
pessoa. Diagnóstico ignora período parcial ao comparar desempenho.

Limiares configuráveis por filial. Os do painel antigo marcavam 112 de 209
produtos como críticos — 54% do catálogo, ruído.

### 14.4 Plano do mês

Fluxo mensal: retrospecto → metas propostas (com validação de soma e a lacuna
de período parcial explícita) → desafios propostos (com o porquê numérico) →
revisar e ativar. Quem escreve é o motor de diagnóstico.

---

## 15. Modo suporte

Admin global não tem acesso permanente a dado de franquia. Para investigar:
escolhe o tenant, escreve o motivo, ganha 2 horas de leitura, faixa permanente
na interface. **Somente leitura, com uma exceção:** pode disparar o sync leve —
o problema típico de suporte é dado desatualizado. O franqueado é notificado
("o suporte atualizou seus dados às 14:32"), limite 1× a cada 5 min, tudo em
log que o franqueado consulta.

**Transferência de propriedade** da credencial do ERP: pelo admin global, para
outro gestor ativo, registrada e notificada aos dois. Sem isso, se o
proprietário sair, a franquia fica sem como atualizar a credencial.

---

## 16. Fora de escopo

App nativo (é PWA). Login social, SSO, 2FA. Cadastro público. Domínio próprio
do franqueado. Segunda credencial do ERP. Fechamento de caixa, sangria, pedido
de compra. DRE e custo fixo detalhado (v2). Curva ABC. Escrita no ERP além da
lista branca. Vigilância de vendedora.

---

## 17. Pendências

**Bloqueia a camada de métricas:**
1. Relatório do ERP que ligue produto a `TIPO` e `DIVISAO` — os lookups dão o
   dicionário, não a atribuição

**Não bloqueiam:**
2. `CATALOG_GUID` do relatório de produtos por vendedor
3. `CUSTO_FRANQUIAS` inclui imposto? Afeta o lucro bruto da v1
4. Lista de `EVENTO`s — troca e devolução precisam ser abatidas
5. Brinde e bonificado aparecem no `VENDAS.Lista`?
6. `CANCELADA: null` traz as duas?
7. Campo `MKT` — se for taxa de marketing por produto, dispensa cadastro
8. Divisão 2 (SKINCARE) tem produto ativo?
9. Custo por produto independente de venda, para valorizar encalhe
10. Bloqueio do ERP é por geolocalização ou lista de IPs?
11. Duração real do ciclo de sync, por filial
12. Comissão sobre bruto ou líquido de desconto
13. Proprietário pode transferir a propriedade, ou só o admin?
14. Margem mínima aceitável: por filial ou por categoria?
15. `TIPO_COMISSAO` do ERP é usado por algum franqueado?