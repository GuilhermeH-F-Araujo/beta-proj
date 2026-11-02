# Dicionário do banco do admin

Escopo confirmado pelo usuário: as estruturas administrativas criadas nas
migrations desta pasta. Mecânico e cliente usam outros repositórios. A revisão
não altera suas entidades principais nem suas regras de acesso.

O conjunto de 9 tabelas originais passa a **6 tabelas operacionais**: as cinco
abaixo e pagamento_os, mantida sem alteração. Os dados antigos unificados ficam
em recuperação privada, não como tabelas paralelas de uso da aplicação.

## admin_notify

| Coluna | Significado |
| --- | --- |
| id | Identificação do aviso. |
| tipo | nova_os, aguardando_peca, pronta ou cancelada. |
| id_os | Ordem relacionada; FK existente, com exclusão em cascata. |
| titulo | Título do aviso. |
| mensagem | Texto do aviso. |
| criado_em | Data original de criação. |

## admin_leitura

| Coluna | Significado |
| --- | --- |
| id_aviso | FK para admin_notify. |
| id_usuario | FK para auth.users, identificando o administrador. |
| lido_em | Data de leitura; nula enquanto não lido. |
| dispensado_em | Data do descarte individual; opcional. |

A chave primária composta mantém um estado por aviso e administrador.
Dispensar ou ler um aviso não altera a leitura dos demais administradores.

## cliente_historico

| Coluna | Significado |
| --- | --- |
| id | Identificação do evento. |
| id_cliente | FK para o cadastro do cliente. |
| nome | Nome registrado no momento da ação. |
| id_usuario | Administrador responsável. |
| acao | arquivar, único evento registrado pelo comportamento existente. |
| motivo | Justificativa de 5 a 500 caracteres. |
| criado_em | Data do evento. |

O arquivamento continua sendo exclusão lógica em cliente.excluido_em.
Seus vínculos com motos e ordens não são removidos.

## miniaturas_motos

| Coluna | Significado |
| --- | --- |
| id | Identificação do trabalho. |
| chave | Modelo normalizado sem acentos; único. |
| modelo | Nome do modelo a ilustrar. |
| status | pendente, processando, aguardando_cota, tentar_novamente, aguardando_revisao ou concluido. |
| tentativas | Quantidade de reservas do trabalho. |
| tentar_em | Próxima execução permitida. |
| travado_em | Início da execução; permite retomar após 5 minutos. |
| id_executor | Token UUID do processo que reservou o trabalho. |
| erro | Último erro, limitado a 500 caracteres na finalização. |
| criado_em | Data de criação. |
| atualizado_em | Última atualização. |

A reserva mantém FOR UPDATE SKIP LOCKED e a finalização exige o token atual.
Revisão, cota e retentativas foram traduzidas também no worker e no painel.
As imagens continuam nos mesmos buckets, com reutilização por modelo e aprovação.

## os_historico

| Coluna | Significado |
| --- | --- |
| id | Identidade global do evento no histórico unificado. |
| id_os | Identificação da OS, sem FK que apague seu histórico. |
| tipo | status, edicao, exclusao, observacao_anterior, nota_status ou auditoria_status. |
| id_usuario | Autor; nulo quando o registro antigo não identifica autor. |
| criado_em | Data original; eventos novos usam now(). |
| anterior | Status anterior, quando aplicável. |
| novo | Status resultante, quando aplicável. |
| texto | Observação anterior ou nota associada à transição. |
| dados | Dados da edição/exclusão; cópia integral de auditoria vinculada. |
| origem | auditoria, status ou observacao para os registros migrados; nula nos novos. |
| id_origem | ID antigo correspondente, junto de origem. |
| id_auditoria | audit_id original, preservando o vínculo explícito. |

Não é preciso repetir uma coluna acao: tipo já expressa a ação/evento.
Notas novas acompanham o evento de status, sem gerar uma cópia separada.
Os metadados origem/id_origem permitem conferir a migração e rastrear IDs antigos.

Somente audit_id explícito permite unir auditoria e status em um único registro.
A cópia completa da auditoria fica em dados.auditoria, inclusive autor, data e
justificativa. Auditorias de status sem vínculo ficam como auditoria_status:
preservam a evidência sem aparecer como segunda transição na timeline.
Eventos parecidos sem vínculo não são descartados.

O painel usa os tipos status e edicao na timeline e observacao_anterior,
nota_status e status com texto no histórico de observações. Cancelamento continua
exigindo motivo. A alteração via gatilho preserva auth.uid(), inclusive do mecânico.

## Recuperação privada

recuperacao.os_auditoria e recuperacao.os_status guardam os originais unificados.
recuperacao.os_observacao guarda as observações antigas, com id_os, tipo, texto,
id_usuario e criado_em. recuperacao.os_backup é a própria tabela de backup
original, movida e renomeada com id_os, texto e salvo_em. Seu conteúdo integral
é conferido antes e depois dessa operação, sem apagar/recriar as linhas. Não entra
no histórico visível nem é retornado pela API.

O schema não recebe USAGE de public, anon, authenticated ou service_role.
As tabelas mantêm RLS e não recebem acesso operacional. Não adicionar esse schema
à lista de schemas expostos na Data API. As cópias são material de recuperação;
nenhuma exclusão definitiva delas foi programada.

## Arquivos relacionados

- MAPEAMENTO.md: dependências e tradução de tabelas, colunas, valores e funções.
- IMPLANTACAO.md: ordem de implantação, conferências e recuperação.
- VALIDACAO.md: verificações executadas e limites da evidência local.
- inspecao.sql: levantamento somente leitura para comparar o banco real.

A migration 20261030215141_simplificar_admin.sql foi aplicada no Supabase remoto.
As evidências e o local do backup estão em EXECUCAO.md.
