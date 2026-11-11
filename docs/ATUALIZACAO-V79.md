# v79 — navegação estável e sessão compartilhada

## Correção

- O menu lateral sempre exibe a estrutura normal, logo e itens; não contém skeleton.
- A estrutura administrativa agora pertence diretamente à rota protegida e permanece montada no carregamento inicial e nas trocas de página.
- A checagem inicial bloqueia apenas o conteúdo protegido. Os itens do menu aguardam a autorização sem desaparecer; ações de conta ficam indisponíveis até a sessão ser validada.
- Removidas as consultas duplicadas de identidade de Clientes, Motocicletas, Ordens, Agendamentos, Detalhes, Histórico e Meu perfil. As telas consomem a sessão validada no contexto compartilhado.
- Nenhuma troca de página dispara nova consulta de identidade. A revalidação de sessão ocorre em segundo plano, no máximo uma vez por minuto, sem substituir a interface por uma tela de carregamento. Eventos de foco próximos são agrupados por esse intervalo.
- Requisições protegidas que retornam 401 notificam a estrutura e encaminham para o login. A API continua verificando autenticação e autorização em cada operação.
- A consulta inicial é reutilizada na repetição de efeitos do React StrictMode.
- A antiga classe de carregamento de acesso não pode mais cobrir a navegação fixa.
- Skeletons de dados continuam na área do conteúdo; não foram removidos das tabelas e cards que aguardam dados.

## Verificação

Build completo aprovado. 83 testes de servidor/regras e 18 testes de interface aprovados (101 no total).

Novos testes verificam a identidade dos elementos DOM do menu e do cabeçalho após várias navegações, preservação do recolhimento, ausência de novas chamadas de acesso durante a navegação e em repetidos eventos de foco, sidebar normal durante a consulta inicial e uma única consulta de acesso com StrictMode.

Os testes de interface usam React/JSDOM e respostas simuladas. Não houve inspeção visual em navegador real nesta execução.

## Publicação

Publicar o pacote completo no Render com a configuração habitual. Esta versão não exige nova variável de ambiente nem migração adicional.

As duas alterações da v78 já foram aplicadas e verificadas no Supabase `estacao-motos` em 11/11/2026:

- `20261111163849` — `complemento_cliente`;
- `20261111163857` — `dados_compartilhados_painel`.

A coluna de complemento e a tabela compartilhada foram confirmadas. A tabela tem RLS, acesso direto bloqueado para `anon`/`authenticated` e permissões de operação para o servidor. Os arquivos SQL permanecem no pacote para instalação em outros ambientes; não é necessário executá-los novamente nesse projeto.
