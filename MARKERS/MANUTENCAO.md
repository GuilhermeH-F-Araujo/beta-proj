# Manutencao

## Padrao de codigo

Use a nomenclatura normal de React, TypeScript e Node. Pastas como client, server, components, hooks, services, routes e config, tipos Props e setters setNome fazem parte do vocabulario usual de desenvolvimento.

Use portugues claro para conceitos da oficina, como cliente, ordemServico, salvarCliente e resumoPagamento. Nao traduza termos tecnicos conhecidos por obrigacao, nem transforme uma funcao simples em uma frase longa. Nao e necessario converter o codigo inteiro para ingles.

Prefira req, res e next nas rotas Express, request no transporte HTTP, createApp na inicializacao e schema nos validadores Zod. Um hook proprio continua com o prefixo use. Os nomes devem indicar a responsabilidade sem criar abreviacoes obscuras.

Campos JSON, propriedades publicas de componentes, seletores CSS, eventos entre abas e dados persistidos sao contratos. Uma mudanca de nomes internos nao pode alterar esses formatos. Os aliases de ambiente existentes continuam aceitos para preservar instalacoes ja configuradas.

Comentarios e guias tecnicos usam texto simples, sem acentos. Textos da interface continuam em portugues natural para o usuario. Comente regras, motivos e limites importantes. Nao comente atribuicoes, retornos obvios ou cada linha do JSX. Um nome claro e uma funcao pequena normalmente dispensam o comentario.

## Alterar uma funcionalidade

1. Identifique a pagina, o servico HTTP e a rota envolvidos.
2. Procure um componente ou gancho existente antes de criar outro.
3. Mantenha o estado no menor ponto compartilhado pelos consumidores.
4. Valide entrada e permissao no servidor. Nao confie no formulario.
5. Preserve filtros, foco e rascunhos quando atualizar os dados.
6. Atualize o contrato OpenAPI se mudar uma rota, campo ou resposta.
7. Rode a compilacao e os testes relacionados. Execute a suite completa antes de entregar uma mudanca abrangente.

## Testes

```bash
npm run typecheck
npm test
npm run format:check
```

A verificacao de codigo usa TypeScript com declaracoes e parametros sem uso proibidos. Antes de excluir uma exportacao, confira tambem chamadas dinamicas, tarefas e contratos que o compilador sozinho nao consegue identificar.

Os testes de servidor cobrem autorizacao, funcionarios, indicadores, configuracoes, preferencias, notificacoes, CEP, concorrencia e miniaturas. Os testes de interface usam React e um DOM simulado para exercitar as rotas, o menu compartilhado, os rascunhos e a atualizacao dos cards. Eles nao substituem uma verificacao visual em navegador real.

A fabrica createApp permite montar a API sem abrir portas ou iniciar a fila. O arquivo index.ts cuida apenas da execucao. Isso permite testar rotas e documentacao sem consultar o banco real.

Use npm run docs:api para sincronizar os esquemas dos validadores compartilhados com o OpenAPI. Revise manualmente respostas, regras condicionais e novas rotas.

O teste de documentacao compara as rotas registradas com o OpenAPI e verifica a entrega do Swagger. O contrato descreve formatos e limites de entrada; regras condicionais de negocio continuam nos validadores e servicos. Documente essas regras tambem quando forem alteradas.

## Banco e publicacao

Antes de criar ou aplicar uma migracao, compare supabase/migrations com o historico do banco (supabase_migrations.schema_migrations). Um arquivo que existe no projeto pode nunca ter sido aplicado, e uma funcao no banco pode estar mais nova que o arquivo. Recrie somente o que falta.

Nao renomeie tabelas, colunas, funcoes SQL ou arquivos de migracoes ja aplicadas apenas para reorganizar o codigo. Confira o historico do banco antes de executar SQL. Mantenha credenciais fora do repositorio e dos exemplos.

As migrations `20261121211628_logs_unificados_e_limpeza.sql`, `20261121212045_catalogo_servicos_agendamento.sql`, `20261121212220_indices_agendamento_logs.sql` e `20261121213441_acesso_api_agendamentos.sql` foram aplicadas ao Supabase conectado em 21/11/2026. O banco ativo agora usa `logs`, `servicos`, `categorias_servico` e a tabela existente `agendamento`; `oficina_painel` foi removida depois da validacao e migracao dos dados.

A migration `20261122210000_catalogo_realtime_e_categorias_vazias.sql` foi aplicada ao Supabase em 22/11/2026. Ela removeu os oito servicos de demonstracao e categorias vazias que vieram do catalogo legado, preservando servicos com outros IDs e suas categorias vinculadas, e habilitou a publicacao Realtime da revisao do catalogo. O banco foi conferido depois da mudanca: sem categorias ou servicos de demonstracao e com Realtime ativo.

O contrato do banco mudou. Publique a versao atual do servidor antes de usar o painel: ela contem as rotas de agendamentos, acesso relacional ao catalogo e notificacoes em tempo real. A migration de logs preservou os eventos existentes e interrompeu a limpeza se encontrasse vinculos ativos das estruturas rejeitadas ou arquivos privados preenchidos.

A pasta extraida deve ser a raiz do repositorio. Depois de publicar, confira /health, /documentacao/, entrada, navegacao, cadastros e uma operacao de teste autorizada. A refatoracao local nao publica o projeto no Render automaticamente.

## Referencias consultadas

- https://github.com/reactjs/react.dev/blob/main/src/content/learn/thinking-in-react.md
- https://github.com/reactjs/react.dev/blob/main/src/content/learn/extracting-state-logic-into-a-reducer.md
- https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
- https://github.com/swagger-api/swagger-ui

Essas referencias orientam separacao de responsabilidades e composicao. O projeto mantem React e a estrutura necessaria ao seu dominio, sem adotar ferramentas extras apenas por aparecerem nos exemplos.

## Autoridade administrativa

O dono aprova os novos administradores em Configuracoes > Seguranca > Autoridade e aprovacoes.
Administradores comuns podem cadastrar e solicitar uma conta administrativa. O cadastro fica
pendente e o login no painel e recusado ate a aprovacao do dono. Contas administrativas anteriores
a esta alteracao continuam ativas como administradores comuns.

O dono pode nomear superadministradores. Um superadministrador pode alterar ou bloquear um
administrador comum. Administradores nao podem alterar, bloquear ou redefinir a senha de outros
administradores. Superadministradores nao podem alterar pares ou o dono. O dono permanece
protegido contra remocao pelo painel.

A senha e solicitada novamente para aprovar, recusar ou alterar o nivel de um administrador. O servidor
consome a confirmacao uma vez e a vincula a sessao autenticada. Outras operacoes protegidas mantem
seu fluxo de confirmacao atual. Cinco erros pausam novas confirmacoes por cinco minutos; os contadores
ficam no banco e sao compartilhados entre as instancias da API.

As alteracoes de autoridade e as confirmacoes ficam em `logs`. As tabelas de autoridade, provas e
tentativas nao tem acesso anonimo nem de usuarios autenticados pela API publica. A chave `service_role`
deve ficar restrita ao servidor e ao ambiente de operacao.

A hierarquia exige a API atualizada. Em recuperacao operacional, uma pessoa com acesso confiavel
ao painel SQL do Supabase pode restaurar admin_autoridade. As credenciais do projeto Supabase
e a chave secreta do servidor ficam fora da hierarquia de usuarios da aplicacao.

A troca ou recuperacao de senha revoga todas as confirmacoes anteriores da conta. O botao Encerrar confirmacao de senha tambem permite exigir nova senha na proxima operacao sensivel.

Cadastros e edicoes comuns de funcionarios nao pedem nova senha. Bloqueio, troca de senha, concessao de administracao, alteracao de administradores existentes, pagamentos e exclusoes continuam protegidos. Consultas ao estado da confirmacao nao renovam sua validade.

Os indicadores das paginas usam CartaoIndicador. Os IDs data-editor-cartao permanecem estaveis para as preferencias individuais. Os graficos usam somente series reais; barras proporcionais usam os totais informados pela API.

