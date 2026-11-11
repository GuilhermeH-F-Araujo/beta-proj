# Configurações v72 — cargos e permissões

## Notificações e marca

Retorna à estrutura anterior de Notificações, sem os três resumos adicionados na v71 e sem os selos em cada evento. Todos os controles ligados ficam verdes. A coluna agora diz “No sino”, para esclarecer onde os avisos aparecem. A confirmação fica no fluxo da página, sem cobrir a lista. O vermelho é usado na navegação ativa, nos detalhes da marca e na criação de cargos; superfícies e controles de leitura permanecem neutros.

## Cargos e permissões

A antiga lista de usuários duplicava Funcionários e foi substituída por Cargos e permissões:

- Administrador integral protegido, sem redução acidental de acesso pelo editor.
- Modelos iniciais Mecânico e Gerente, sem pessoas vinculadas automaticamente.
- Criar e editar cargos, descrição, ativação e permissões por módulo.
- Matriz de Visualizar, Criar, Editar e Excluir. Ações exigem visualizar; Dashboard e Funcionários são de consulta para cargos personalizados. A exclusão de motocicletas continua desativada pela regra já existente do projeto.
- Modal com seleção de pessoas e pesquisa. Só permite vincular quem tem conta e não possui acesso administrativo integral.
- Cada pessoa pode ter um cargo de acesso. Transferir exige remover o vínculo anterior. O cargo de acesso não modifica a função profissional do cadastro.
- Desativar um cargo suspende esse acesso. Alterações concorrentes são detectadas por versão e não sobrescrevem silenciosamente uma edição anterior.
- Registro de alterações e vínculos no banco, com autor derivado da sessão.

## Aplicação das permissões

Pessoas sem cargo explícito não ganham entrada no painel web. Administradores atuais continuam com acesso integral. Contas não administrativas com cargo ativo e situação “ativo” podem entrar e recebem apenas os módulos liberados. Menu e rotas aplicam as permissões; as APIs usam a sessão autenticada e consultam novamente o cargo a cada solicitação. A interface atualiza a autorização ao receber foco e a cada minuto.

A gestão de cargos, criação de contas da equipe, alterações de acesso/senha de outras pessoas, segurança e configuração geral da oficina continuam exclusivas do administrador. Criar clientes é permitido somente quando o cargo libera essa ação; a API exige cargo e perfil Cliente, impedindo a criação de administradores ou funcionários por esse caminho. Cada usuário mantém acesso ao próprio perfil, preferências e notificações. O sino filtra os eventos pelos módulos autorizados. Dados de cliente, veículo, valores e pagamentos vinculados fazem parte da consulta de uma OS; editar OS inclui suas ações e pagamentos já existentes.

Serviços e Agendamentos ainda são módulos locais do projeto: seus dados não foram migrados ao servidor. Os pontos de gravação no navegador verificam as permissões, mas isso não equivale à proteção de dados compartilhados por API; quem controla o armazenamento local do próprio navegador continua podendo alterá-lo. As permissões de cargo em si permanecem salvas no banco e acompanham a conta. O seletor de mecânicos da agenda usa uma consulta reduzida, sem expor documentos ou contatos da equipe.

## Banco e segurança

Aplicadas ao projeto Supabase conectado, sem atribuir cargos a usuários ou apagar dados:

1. `20261108004156_cargos_permissoes.sql`: tabelas `cargo_acesso`, `cargo_vinculo`, `cargo_historico` e função transacional de salvamento. RLS habilitado e acesso às tabelas somente pelo servidor. A função usa SECURITY INVOKER, valida o administrador, protege os vínculos administrativos e registra auditoria.
2. `20261108005149_proteger_leitura_ordens_cargos.sql`: remove duas políticas antigas de leitura irrestrita de ordens e revoga a leitura anônima. A nova política verifica o cargo atribuído também em consultas diretas ao banco. Clientes autenticados ficam restritos às próprias motocicletas; administradores mantêm acesso integral; funcionários móveis ainda não vinculados mantêm a leitura autenticada legada, desde que ativos. A verificação fica em um predicado privado com SECURITY DEFINER, sem argumentos de identidade, search_path vazio e retorno apenas booleano; isso é necessário para consultar os vínculos privados dentro da RLS.

A mudança remove leitura de OS sem autenticação. Aplicações que dependam dessa leitura anônima precisam autenticar o usuário. Não há nova variável de ambiente. Publicar cliente e servidor juntos.

## Verificação

- Build completo do Render aprovado.
- 28 testes existentes de configurações e 13 testes de autorização e catálogo local aprovados.
- Testes transacionais reais no banco: criação, vínculo, auditoria, versão concorrente, bloqueio de elevação de privilégio e proteção de administradores. Todos os dados temporários foram revertidos.
- Testes reais como papel authenticated: cargo sem visualizar e cargo desativado não leem ordens; cargo autorizado e administrador conseguem ler. Leitura anônima revogada. Testes revertidos.
- Novas tabelas com RLS e sem políticas têm aviso informativo intencional, pois somente a API privilegiada as consulta. As funções de salvamento não são executáveis por anon/authenticated.
- O ambiente de prévia continua indisponível; não houve verificação visual no navegador nesta execução. Isto não é um pentest completo de todo o projeto ou dos aplicativos móveis.
