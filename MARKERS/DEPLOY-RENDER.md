# Publicar no Render

Envie todo o conteudo extraido para a raiz do repositorio. Substitua a estrutura anterior completa, incluindo exclusoes. Nao misture arquivos antigos com a nova organizacao.

| Campo          | Valor                |
| -------------- | -------------------- |
| Tipo           | Web Service          |
| Root Directory | .                    |
| Build Command  | npm run build:render |
| Start Command  | npm start            |
| Health Check   | /health              |
| NODE_ENV       | production           |
| NODE_VERSION   | 24.22.3              |
| SKIP_INSTALL_DEPS | true              |

O render.yaml inclui a mesma configuracao. A compilacao verifica arquivos obrigatorios antes de instalar as dependencias do servidor e do cliente.

Configure SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY nas variaveis do servico. O Render fornece RENDER_EXTERNAL_URL para o dominio padrao. Se usar dominio proprio, defina CLIENT_URL com esse dominio. Configure GITHUB_BACKUP_REPOSITORY, GITHUB_BACKUP_TOKEN e GITHUB_BACKUP_BRANCH somente se usar o backup externo. Os nomes anteriores sao aceitos pelo adaptador de ambiente. CLIENT_URL deve ser a origem publica do painel, sem caminho e sem barra final. Mantenha chaves privadas somente no servidor.

Depois do deploy:

1. Abra /health e confirme a resposta da API.
2. Entre no painel com uma conta administrativa.
3. Confira /documentacao/ e /documentacao/openapi.json no mesmo dominio.
4. Teste a troca de tema pelo cabecalho e por Configuracoes, alem da navegacao e dos indicadores.

No Supabase, configure Site URL com a origem publica do painel e inclua a URL completa do painel terminada em /redefinir-senha em Redirect URLs. Nao execute tarefas de publicacao de emails ou alteracoes de banco sem revisar suas configuracoes.

Nao envie node_modules, dist ou arquivos .env preenchidos. Para um banco novo ou desatualizado, consulte CONFIGURACAO.md e supabase/ATUALIZAR-BANCO.sql antes do deploy.
