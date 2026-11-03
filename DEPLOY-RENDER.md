# Publicar no Render

Esta versão inclui server/src completo, o build de produção e o painel servido pelo próprio servidor.

1. Extraia o ZIP. Copie o conteúdo de estacao-motos-perc3 para a raiz do repositório, onde estão server, client e package.json. Não crie outra pasta estacao-motos-perc3 dentro do repositório.
2. Preserve seu .env local. Não envie senhas ao GitHub.
3. Execute na raiz:
   git add .
   git status
   git commit -m "Corrige build e deploy no Render"
   git push origin main
4. No serviço Web Service do Render, configure:
   - Branch: main
   - Root Directory: `.` ou vazio (a raiz do GitHub, onde ficam `server`, `client` e o `package.json` principal)
   - Build Command: npm run build:render
   - Start Command: npm start
   - Health Check Path: /health
5. Configure Environment:
   - NODE_ENV=production
   - NODE_VERSION=22.22.0
   - CLIENT_URL=https://SEU-SERVICO.onrender.com (URL pública exata do seu serviço, sem caminho)
   - SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY: os valores do seu projeto, somente no painel de variáveis do Render.
   Não configure VITE_API_URL para outro domínio: painel e API são publicados juntos.
6. Em Manual Deploy, selecione Clear build cache & deploy.
7. Nas configurações de autenticação do Supabase, autorize a URL pública do painel e o redirecionamento /redefinir-senha, caso utilize recuperação de senha.

Alternativa: criar um Blueprint usando render.yaml e preencher as variáveis solicitadas.
O render.yaml não reconfigura automaticamente um serviço já criado manualmente.

Verificação antes de enviar:
   git ls-files server/src

Devem aparecer os nove arquivos TypeScript do servidor. O erro TS18003 ocorre quando esses arquivos não chegam ao build ou quando a raiz do serviço aponta para a pasta errada; trocar `include` não recupera arquivos ausentes. O `render.yaml` fixa `rootDir: .` e o comando de build confere os arquivos essenciais antes de compilar.

Os testes de build não validam credenciais, permissões nem as migrations do banco de produção.
