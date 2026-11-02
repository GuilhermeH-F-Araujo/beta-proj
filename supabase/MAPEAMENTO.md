# Contrato da simplificação — definido antes da implementação

O escopo são as tabelas criadas nas 24 migrations originais, preservadas intactas.
A transição final é 20261030215141_simplificar_admin.sql, aplicada atomicamente
no estacao-motos. Os rascunhos intermediários não foram aplicados separadamente.
Não se criam os_status/os_observacao operacionais intermediárias.

## Dependências encontradas

- `server/src/index.ts`: notificações, leitura individual, histórico de moto,
  detalhes da OS, observações, exclusão, edição, arquivamento, aprovação de imagens.
- `server/src/filaMiniaturas.ts`: enfileiramento, reivindicação atômica, retomada,
  tentativas, cota, revisão e finalização com token de posse.
- `client/src/services/apiAutenticacao.ts`, `miniaturasMotocicletas.ts`,
  `PainelNotificacoes.tsx`, `ModalPreviaModelo.tsx`, `DetalhesOrdem.tsx` e CSS:
  contratos, tipos de eventos, estados e sua apresentação.
- SQL: gatilhos de status/observação/avisos/fila, RPCs administrativas e da fila,
  grants por tabela/coluna, RLS, FKs, identidades e índices.
- Auth e pagamento: permanecem com os contratos e permissões existentes.

O usuário confirmou que esta revisão é somente do admin: mecânico e cliente
estão em outros repositórios e as estruturas solicitadas são do percurso admin.
Os gatilhos atendem alterações diretas na OS por outros percursos; o autor via
auth.uid() é mantido. Nenhuma alteração nos outros repositórios é parte da entrega.
O banco real foi inspecionado após a conexão ser restabelecida. Os corpos das
14 funções administrativas/privadas afetadas coincidiam com as migrations locais.
Foram encontradas duas dependências compartilhadas: os parâmetros app.order_actor
e app.order_note foram preservados para o cancelamento por recusa de orçamento;
gerar_notificacoes_temporais(interval) recebeu, com autorização específica, somente
a adaptação da leitura do histórico e seu filtro tipo=status. Suas regras e as
tabelas do mecânico não foram alteradas. Ver EXECUCAO.md para as evidências.

## Tabelas e colunas

| Origem original | Destino | Colunas antigas → novas |
| --- | --- | --- |
| admin_notifications | admin_notify | id; kind→tipo; order_id→id_os; title→titulo; body→mensagem; created_at→criado_em |
| admin_notification_receipts | admin_leitura | notification_id→id_aviso; admin_user_id→id_usuario; read_at→lido_em; dismissed_at→dispensado_em |
| client_admin_audit | cliente_historico | id; client_id→id_cliente; client_name→nome; admin_user_id→id_usuario; action→acao; reason→motivo; occurred_at→criado_em |
| motorcycle_thumbnail_jobs | miniaturas_motos | id; model_key→chave; model→modelo; status; attempts→tentativas; next_retry_at→tentar_em; locked_at→travado_em; locked_by→id_executor; last_error→erro; created_at→criado_em; updated_at→atualizado_em |
| order_admin_audit | os_historico | order_id→id_os; action→tipo; admin_user_id→id_usuario; occurred_at→criado_em; details→dados |
| order_status_history | os_historico | order_id→id_os; previous_status→anterior; next_status→novo; changed_at→criado_em; actor_user_id→id_usuario; note→texto; audit_id→id_auditoria |
| order_observation_history | os_historico | order_id→id_os; kind→tipo; body→texto; actor_user_id→id_usuario; created_at→criado_em |
| order_observation_migration_backup | recuperacao.os_backup | order_id→id_os; original_body→texto; saved_at→salvo_em. Conteúdo integral conferido antes/depois; não entra no histórico visível. |
| pagamento_os | sem alteração | Regra e permissões existentes. |

`os_historico`: id (nova identidade global), id_os (sem FK que apague auditoria),
tipo, id_usuario (nullable), criado_em, anterior, novo, texto, dados,
origem, id_origem, id_auditoria. Origem e IDs antigos preservam a rastreabilidade
e permitem conferir a cópia. Uma nota de status ocupa texto no mesmo evento,
não outro evento duplicado. Os dados JSON antigos são preservados integralmente
como evidência histórica. Novas exclusões usam permanente e ordem no JSON;
as chaves legadas permanent e os não são reescritas no conteúdo arquivado.

## Valores e funções

| Contexto | Antigo → novo |
| --- | --- |
| Aviso | new_order→nova_os; waiting_part→aguardando_peca; ready→pronta; cancelled→cancelada |
| Cliente | archive→arquivar |
| Histórico | status→status; edit→edicao; delete→exclusao; previous_observation→observacao_anterior; status_note→nota_status |
| Miniatura | pending→pendente; processing→processando; waiting_quota→aguardando_cota; retry→tentar_novamente; needs_review→aguardando_revisao; done→concluido |
| RPC | admin_order_status→alterar_status_os; admin_order_edit→editar_os; admin_order_delete→excluir_os; admin_client_archive→arquivar_cliente |
| RPC | claim_motorcycle_thumbnail_job→reservar_miniatura; finish_motorcycle_thumbnail_job→finalizar_miniatura; scan_motorcycle_thumbnail_jobs→revisar_miniaturas |
| Funções privadas | capture_order_status→registrar_status_os; capture_order_observation→registrar_observacao_os; capture_admin_order_notification→avisar_admin; enqueue_motorcycle_model→enfileirar_modelo; enqueue_order_motorcycle→enfileirar_moto; motorcycle_model_key→chave_modelo |

Parâmetros de RPC acompanham as colunas: p_id_os, p_status, p_texto, p_usuario;
edição usa p_nome, p_telefone, p_email, p_cpf, p_modelo, p_placa, p_ano, p_cor,
p_problema, p_observacoes; exclusão/arquivamento usam p_motivo; fila usa
p_executor, p_id, p_status, p_tentar_em, p_erro. RPCs preexistentes não relacionadas
à mudança (cadastro, pagamento, normalização) são mantidas.

HTTP mantém URLs e campos usados no painel; os valores de eventos/estados são
traduzidos nos dois lados. Ações edit/read/dismiss também passam a edicao/ler/dispensar.

## Unificação sem perda

Somente audit_id explícito prova que auditoria e transição representam o mesmo
evento antigo. Nesse caso o evento único conserva a auditoria completa em dados,
inclusive sua data, autor e ID. Sem vínculo explícito, os registros de auditoria
de status ficam com tipo auditoria_status, sem duplicar a timeline de transições.
Não se descarta nada por proximidade de texto/horário. Novas alterações de status
geram somente o evento do gatilho, inclusive via mecânico/app móvel.

Dados desconhecidos e divergências devem bloquear a migração, não ser corrigidos
por inferência. Os originais unificados são retirados de public somente depois
da conferência e ficam no schema recuperacao, sem acesso por APIs públicas.
Nenhuma tabela fora da lista é renomeada ou consolidada.

## Autorização

Não executar migrations, DDL, DML ou publicação no banco remoto sem autorização
expressa do usuário para o plano concreto. Até lá, apenas arquivos locais e testes.
