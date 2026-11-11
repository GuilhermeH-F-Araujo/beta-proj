# Publicar no Render

Esta versão inclui server/src completo, o build de produção e o painel servido pelo próprio servidor.

1. Extraia o ZIP corrigido diretamente na raiz do repositório. As pastas `client/` e `server/`, além de `render.yaml` e `package.json`, devem ficar lado a lado. Não compile nem envie apenas `client/src` ou apenas `server/`.
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

Devem aparecer os nove arquivos TypeScript do servidor. Os erros TS18003/TS2307 indicam fontes ausentes ou raiz/pasta errada; trocar `include` não recupera arquivos ausentes. O `render.yaml` fixa `rootDir: .` e o comando de build confere as fontes do servidor e do cliente antes de compilar, com uma mensagem direta se o pacote estiver incompleto.

Os testes de build não validam credenciais, permissões nem as migrations do banco de produção.

## Atualização v78

Antes do deploy desta versão, executar `ATUALIZAR-BANCO-V78.sql` no Supabase correto. As instruções de CEP, dados anteriores e testes estão em `docs/ATUALIZACAO-V78.md`. A API oficial dos Correios requer credenciais de contrato; sem elas, a consulta usa ViaCEP quando permitido. Nenhuma credencial real foi incluída neste pacote.

## Atualização v79

As migrações v78 já foram aplicadas ao projeto `estacao-motos`. Basta publicar o pacote v79 completo para obter a correção da navegação. Nenhuma nova migração ou variável de ambiente foi acrescentada na v79.
