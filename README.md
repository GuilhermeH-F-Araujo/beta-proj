# Estacao Motos

Painel administrativo da oficina em React e TypeScript. O servidor usa Express e Supabase. O administrador acompanha clientes, motocicletas, funcionarios, ordens, pagamentos e configuracoes. Os aplicativos de cliente e mecanico usam contratos existentes e nao fazem parte deste pacote.

## Comecar

Requisito: Node compativel com o definido no Render e npm. Execute os comandos na raiz extraida do projeto.

```bash
npm run install:all
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run check:env
npm run dev
```

Preencha SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY no arquivo do servidor. No Windows, copie os arquivos pelo explorador ou use Copy-Item. O painel abre em http://localhost:5173. A API local usa http://localhost:3001.

As variaveis anteriores continuam aceitas. Nao precisa trocar os nomes ja configurados no Render de uma vez. O adaptador fica em server/scripts/env.mjs.

## Comandos

| Comando              | Uso                                                             |
| -------------------- | --------------------------------------------------------------- |
| npm run dev          | Inicia painel e servidor                                        |
| npm run build        | Compila servidor e painel                                       |
| npm start            | Inicia o servidor compilado                                     |
| npm run typecheck    | Confere tipos, variaveis, parametros e importacoes sem uso      |
| npm test             | Compila e executa testes de servidor e interface                |
| npm run doctor       | Confere conexao e configuracao local                            |
| npm run docs:api     | Sincroniza os validadores compartilhados com o contrato OpenAPI |
| npm run format       | Formata os arquivos do projeto                                  |
| npm run format:check | Confere a formatacao sem alterar arquivos                       |
| npm run build:render | Instala pelo arquivo de dependencias e compila para o Render    |

Os atalhos dev, build e start continuam disponiveis para ferramentas e hospedagem.

## Documentacao da API

Com o projeto iniciado, abra http://localhost:5173/documentacao/ ou http://localhost:3001/documentacao/. O titulo da interface e **Documentação**. O contrato fica em server/openapi.json e pode ser baixado em /documentacao/openapi.json.

No Render, o mesmo caminho fica disponivel depois do deploy deste codigo. Preparar o arquivo nao publica automaticamente uma alteracao no servico hospedado.

O Swagger permite testar consultas. Escritas ficam descritas, mas nao sao executadas pela interface, para evitar cadastros e exclusoes acidentais no banco real. As consultas protegidas precisam da sessao administrativa do mesmo dominio.

## Onde encontrar cada assunto

- ARQUITETURA.md: organizacao, responsabilidades e fluxo dos dados.
- CONFIGURACAO.md: ambiente, integracoes e compatibilidade.
- MANUTENCAO.md: como alterar, testar e documentar sem quebrar contratos.
- DEPLOY-RENDER.md: configuracao da hospedagem.
- supabase/TABELAS.md: estrutura e responsabilidade dos dados.
- AGENTS.md: regras para manter este padrao nas proximas alteracoes.

O projeto nao inclui credenciais, node_modules nem arquivos compilados. As pastas docs e motion-film foram removidas.

## Miniaturas de motocicletas

A central fica em /miniaturas. Consulte [MINIATURAS.md](MINIATURAS.md) para configurar Cloudflare, QR Code, pesquisa, fila e integracao de leitura dos outros percursos. O mesmo estudio e reutilizado no modal das motocicletas e das OS.
