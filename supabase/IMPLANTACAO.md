# Implantação e recuperação

## Estado atual

A migration 20261030215141_simplificar_admin.sql foi aplicada com autorização no
estacao-motos (vjzheckhlvrnhwpokkox), sob o registro remoto simplificar_admin.
Dados e definições foram exportados, restaurados localmente para ensaio e
conferidos novamente no banco real. Ver EXECUCAO.md.

O painel e a API devem usar a versão atualizada deste projeto. As URLs HTTP
permanecem, mas as sete RPCs afetadas, seus parâmetros, os nomes de colunas e
os valores dos eventos/estados foram alterados nos dois lados. Auth, pagamento,
entidades principais e Storage mantêm seus contratos.

As 24 migrations originais e o arquivo final aplicado compõem o histórico local.
Os rascunhos intermediários não foram aplicados separadamente e foram removidos
da pasta de migrations, para impedir reaplicação acidental. Não executar a
transição novamente em um banco que já tem o registro simplificar_admin.

## Reproduzir em outra instância a partir do esquema anterior

1. Confirmar o projeto/ambiente e executar inspecao.sql em modo somente leitura.
   Comparar nomes, tipos, índices, constraints, RLS, grants, triggers, funções e
   dependências com o backup e as migrations locais. Não sobrescrever alterações
   remotas desconhecidas nem usar CASCADE para remover dependências.
2. Exportar as nove tabelas do escopo, suas sequências e os objetos afetados,
   incluindo corpos de funções e ACLs. Guardar a versão anterior da aplicação.
   Validar a restauração em uma instância de teste antes do corte. Um pg_dump
   custom com seleção dos objetos também é uma opção quando disponível.
3. Confirmar autorização para o destino e a versão exata do SQL. Parar API e
   worker do admin; impedir escritas durante o corte.
4. Aplicar o único arquivo 20261030215141_simplificar_admin.sql. Ele executa as
   três etapas numa transação: renomeação/unificação, adaptação autorizada da
   consulta temporal e retirada dos originais para recuperacao. As comparações
   de conteúdo, relações, autores e datas ocorrem dentro da mesma transação.
   lock_timeout e statement_timeout evitam espera indefinida. Uma falha desfaz
   a transação inteira; não existe commit parcial entre as etapas.
5. Comparar todas as linhas/colunas usando a tradução do dicionário. Conferir
   RLS, grants, referências antigas e dados/metadados das entidades externas.
   Verificar o registro no histórico de migrations.
6. Publicar/iniciar painel e API atualizados juntos. O PostgREST recebe NOTIFY
   para recarregar seu schema. Testar login admin, criação/edição/exclusão de OS,
   cancelamento com motivo, histórico, arquivamento, leitura individual de avisos,
   fila/revisão de miniaturas e pagamento antes de liberar tráfego normal.

O cancelamento por recusa de orçamento continua usando app.order_note; o autor
continua usando app.order_actor/auth.uid(). Esses contratos compartilhados foram
preservados. gerar_notificacoes_temporais(interval) conserva todas as suas regras,
com somente a leitura de status adaptada para os_historico.

## Recuperação

Antes de liberar escritas de produção, restaurar o backup validado dos objetos
do escopo, suas funções/triggers/grants e a versão anterior da aplicação. Com
pg_restore, revisar o TOC (--list) e usar --use-list limitado aos objetos afetados.
Não restaurar indiscriminadamente public nem auth/storage: há outras tabelas fora
do escopo. As definições originais também estão no backup JSON privado.

No mecanismo de migrations, reconciliar a versão restaurada somente depois de
confirmar o esquema; não apagar registros de histórico para simular sucesso.
A recuperação altera o banco e precisa de autorização específica para seu SQL.

Se já houve escritas após o corte, parar o admin e exportar antes todos os dados
atuais das seis tabelas operacionais e os arquivos em recuperacao. Restaurar em
uma instância de teste e transformar os eventos novos de os_historico (origem
nula) para as estruturas anteriores: status para histórico de status,
edicao/exclusao para auditoria, observacao_anterior/nota_status para observações.
Preservar os IDs unificados na exportação, gerar um mapeamento dos IDs reintroduzidos,
manter datas/autores/notas/JSON e conferir as contagens antes de importar.
Fazer o inverso das traduções das outras tabelas.

Esse retorno com novas escritas exige SQL próprio, revisão e autorização.
Não há downgrade automático que descarte eventos novos. As cópias privadas
contêm os dados anteriores à unificação, não as escritas posteriores ao corte.
