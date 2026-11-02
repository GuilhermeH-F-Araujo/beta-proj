# Aplicação no estacao-motos — 30/10/2026

Aplicada via plugin Supabase no projeto confirmado:

- Nome: estacao-motos.
- Referência: vjzheckhlvrnhwpokkox.
- Registro remoto: 20261030215141, nome simplificar_admin.
- Arquivo local: migrations/20261030215141_simplificar_admin.sql.

As três etapas preparadas (unificação, consulta temporal e retirada) foram
consolidadas em um registro atômico para evitar estado intermediário e manter
o histórico local alinhado ao remoto. As 24 migrations originais ficaram intactas.
Não executar novamente os rascunhos intermediários.

## Autorizações e preparação

O usuário autorizou a aplicação no banco e confirmou que API e worker estavam
parados. Também autorizou especificamente a adaptação da consulta de
gerar_notificacoes_temporais(interval), encontrada fora das migrations locais.
Somente essa leitura foi ajustada para os_historico com tipo=status.

Os parâmetros de sessão app.order_actor e app.order_note foram mantidos porque
orcamento_recusado_cancela_os() os usa. Essa função não foi alterada. Seu corpo
e suas permissões passaram na comparação das 79 funções fora do escopo.

Os dados e as definições foram exportados antes da alteração. A restauração local
do backup em PostgreSQL/PGlite seguida da transição atômica passou. A execução
remota teve lock_timeout de 10 segundos, statement_timeout de 90 segundos e uma
conferência sob lock que abortaria se os dados diferissem do backup.

## Conferência real antes/depois

| Origem | Destino | Linhas | Conteúdo preservado |
| --- | --- | --- | --- |
| admin_notifications | admin_notify | 2 | Sim, considerando a tradução. |
| admin_notification_receipts | admin_leitura | 0 | Sim. |
| client_admin_audit | cliente_historico | 0 | Sim. |
| motorcycle_thumbnail_jobs | miniaturas_motos | 5 | Sim, todas as colunas e estados. |
| order_admin_audit | recuperacao.os_auditoria e os_historico | 0 | Sim. |
| order_status_history | recuperacao.os_status e os_historico | 0 | Sim. |
| order_observation_history | recuperacao.os_observacao e os_historico | 0 | Sim. |
| order_observation_migration_backup | recuperacao.os_backup | 0 | Sim. |
| pagamento_os | pagamento_os | 0 | Sim, sem alteração. |

O histórico unificado está vazio porque as três fontes reais estavam vazias.
Casos com histórico preenchido, vínculos, autores nulos, duplicidades explícitas,
observações e OS excluída foram verificados nas fixtures locais.

Outras verificações no banco real:

- 17 tabelas fora do escopo mantiveram conteúdo, OID, RLS e ACL.
- 79 funções fora do escopo mantiveram corpo e ACL.
- As seis tabelas operacionais do escopo e os quatro arquivos privados mantêm RLS.
- anon e authenticated não têm SELECT nas tabelas administrativas.
- As sete novas RPCs permitem service_role e negam anon/authenticated.
- recuperacao não permite USAGE a public, anon, authenticated ou service_role.
- Nenhuma função operacional referencia os oito nomes antigos de tabelas.
- O registro da migration foi confirmado no histórico remoto.

## Backup privado

Pasta local ignorada pelo Git: .verificacao/backups/20261030.

- esquema-antes.json: colunas, constraints, índices, funções, grants e triggers.
- dados-antes.json: todas as linhas das nove tabelas, sequências e dependências.
- fora-do-escopo-antes.json: impressões das tabelas/funções preservadas.
- aplicado.sql: SQL efetivamente enviado, incluindo a conferência do backup.
- dados-depois.json e verificacao.json: estado final e comparação integral.

Esses arquivos podem conter informações privadas e não devem ser publicados.
O SQL versionado não inclui as linhas de produção usadas na guarda de execução.
As tabelas em recuperacao também permanecem privadas para recuperação.

## Limites e retomada

O banco está migrado; login real e operação do painel contra a API não foram
testados de ponta a ponta nesta aplicação. A API e o painel precisam iniciar
com os arquivos atualizados deste projeto, pois RPCs, colunas e estados mudaram.
Não reiniciar uma versão antiga do admin contra o esquema novo.

A consulta de segurança do Supabase foi executada antes/depois. Os avisos de
search_path e funções SECURITY DEFINER fora do escopo não foram alterados.
O aviso informativo de RLS sem políticas nas tabelas administrativas é esperado:
o acesso é restrito ao servidor, sem liberação para anon/authenticated.
Referências: [RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
