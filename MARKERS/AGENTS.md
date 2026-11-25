# Regras do projeto

- Preserve funcionamento, regras de negocio e visual em uma refatoracao.
- Use nomes claros do dominio em portugues, sem acentos, e convencoes tecnicas comuns em ingles. Nao traduza termos usuais de React, Node e TypeScript por obrigacao.
- Use comentarios curtos somente para regras, motivos e limites importantes.
- Escreva documentacao tecnica simples, direta e sem acentos.
- Preserve os nomes exigidos por bibliotecas, HTTP, HTML, ambiente de hospedagem e contratos existentes.
- Mantenha compativel o formato dos dados consumidos pelos aplicativos de cliente e mecanico.
- Nao adicione rotulos de entrega ou numeracao de edicoes ao produto, aos arquivos e aos guias.
- Nao altere formatos persistidos no banco, Storage ou navegador sem migracao e teste de compatibilidade.
- Reutilize componentes. Menu lateral e cabecalho possuem uma unica implementacao.
- Hooks React proprios mantem o prefixo use. Use setters setNome, Props, req, res, next e request quando forem adequados.
- Nunca coloque chaves privadas, tokens ou senhas no navegador, em exemplos ou em comentarios.
- Toda rota protegida deve verificar identidade e permissao no servidor.
- Atualize server/openapi.json quando o contrato da API mudar.
- O Swagger usa o titulo Documentação e o caminho /documentacao/.
- Mantenha os guias em MARKERS; nao recrie docs ou motion-film.
- Rode os testes necessarios e a compilacao antes de entregar.

- Mantenha noUnusedLocals e noUnusedParameters ativos nos dois projetos.
- Prefira nomes de dominio claros. Use convencoes comuns do ecossistema sem traducao forcada.
- Separe estado, acoes e secoes visuais quando um formulario ficar dificil de acompanhar.
- Remova codigo apenas depois de conferir entradas, importacoes, chamadas dinamicas e testes.
- Nao remova controles de acesso nem contratos externos por parecerem sem uso na tela.

- Estrutura padrao: client, server, components, pages, hooks, services, scripts, routes, auth, validators e config.
- Prefira os comandos usuais npm run dev, npm run build, npm start, npm test e npm run typecheck.
