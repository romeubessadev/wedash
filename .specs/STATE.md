# Project State

## Decisions

| ID | Decision | Rationale | Date |
| --- | --- | --- | --- |
| AD-001 | Ao vivo is a top-level menu item (not under Dashboard) | Operational/live board ? analytical dashboard | 2026-09-18 |
| AD-002 | No company block in Ao vivo header | User: remove empresa; store via Topbar selector | 2026-09-18 |
| AD-003 | KPIs show month primary + today secondary; no global Hoje\|M�s | Preserves live feel; dual readout on cards | 2026-09-18 |
| AD-004 | Ranking/Desafios/Metas always month; no Semestre/Ano on Ranking | Historical periods ? Ao vivo | 2026-09-18 |
| AD-005 | Vela components only; idea from SAAS refs | Product theme strict | 2026-09-18 |
| AD-006 | Share/TV/external page deferred | Implement in-app Ao vivo first | 2026-09-18 |
| AD-007 | IA Insights only in gestor app (mock MVP) | Not on TV; no real LLM yet | 2026-09-18 |
| AD-008 | Ao vivo header: Compartilhar + Modo TV (functional ? shell routes) | Next feature builds full external/TV UI | 2026-09-18 |
| AD-009 | Login = e-mail + senha (n�o CPF); Supabase Auth | Padr�o de apps; CPF fica para ERP | 2026-09-19 |
| AD-010 | Sess�o PWA sticky; multi-device; F5 n�o desloga | App instal�vel + push depois | 2026-09-19 |
| AD-012 | Produto chama-se WeDash (n�o Vela Franquias) | Nome do dash / projeto Supabase | 2026-09-19 |
| AD-013 | Schema/auth/edge em ingl�s (`identity`, `membership`, roles OWNER/MANAGER/SELLER) | Padr�o profissional; UI copy permanece PT | 2026-09-21 |
| AD-014 | Tenant URL = `wedash.app/{slug}` (path), n�o subdom�nio | Ops simples; slug auto do nome | 2026-09-21 | **superseded by AD-023** |
| AD-015 | Dashboard l� Postgres; Millennium s� via sync (worker BR) | Sess�o �nica ERP + IP + performance | 2026-09-21 |
| AD-016 | Backfill 3 meses; agregados di�rios (+ hora no dia); VG v1 = VENDAS.Lista | Custo/perf; CMV no pesado depois | 2026-09-21 |
| AD-017 | Canonical dashboard sales read model = `sales_day_agg` / `sales_hour_agg` | Overview e telas seguintes n�o leem Millennium | 2026-09-21 |
| AD-018 | Onboarding keeps Millennium session through SEED (no logout on store confirm) | Single ERP login slot; worker reuses token | 2026-09-21 |
| AD-019 | Atualizar (FORCE) = filtered period gaps + always today (not LIGHT) | LIGHT = auto today; FORCE = manual repair | 2026-09-21 |
| AD-020 | MVP worker gated by WeDash presence (heartbeat 5 min) | Solid path first; 24/7 later | 2026-09-21 | **superseded by AD-021** |
| AD-021 | Millennium disconnect only via Settings > Integra��o ERP; WeDash logout keeps ERP session | Allows HISTORY while gestor offline; explicit release for ERP desktop use | 2026-09-22 |
| AD-022 | SEED = previous calendar month ? today; LIGHT = today without filial; HISTORY monthly with filial sequential | Probe: multi-day without filial times out; dashboard needs MoM | 2026-09-22 |
| AD-024 | Regras de negócio de Gestão (metas, desafios) calculadas no navegador em módulos puros `*View.ts` com testes, a partir dos agregados do Postgres; dado novo por pessoa vem de relatório que o sincronizador já busca (sem chamada nova ao ERP) | Regra muda sem migration; testável; respeita sessão única do Millennium | 2026-10-02 |
| AD-025 | Desafio = Tipo (Quantidade · Valor · P.A. · Ticket médio) + O que conta (produtos · categorias · tudo, só Quantidade/Valor) + Quem ganha (Quem fizer mais · Quem chegar ao mínimo); editor em 1 card / 1 coluna; coluna `challenge.scope` | Dono: configuração mais simples que meta; mínimo com o nome do tipo deixava claro o que é inteiro × R$ × P.A. | 2026-10-02 |
| AD-023 | No white label: platform always shows WeDash; no slug / wedash.app/{slug} / {empresa}.wedash.app; access always via default WeDash URL | Company name kept only as account identification (profile, invites) | 2026-09-27 |

## Handoff

- **Feature:** `.specs/features/erp-integration`
- **Phase:** Execute complete (T1�T14 committed)
- **Completed:** spec, context, design, tasks, implementation
- **In-progress:** none
- **Next step:** Deploy Edge `erp-credential-persist` if not live; UAT onboarding ? SyncingPage ? Integra��o ERP; optional Verifier pass
- **Blockers:** none
- **Branch:** master (ahead of origin; push when ready)
