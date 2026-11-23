# Miniaturas de motocicletas

## Fluxo

O administrador cria uma solicitacao por modelo, ano e variante. Pode enviar ate quatro fotos opcionais pelo computador, pelo celular ou pelo QR Code temporario. A tela principal exige somente o modelo e o clique em Gerar. Foto, observacao e controles avancados ficam recolhidos. A opcao preservar orienta a edicao a manter a moto fotografada; referencia cria uma representacao a partir das fontes. Nenhum desses modos garante reconstruir partes ocultas sem referencias.

A fila persiste no Supabase. Ao iniciar e a cada hora, prepara os modelos cadastrados ainda sem miniatura aprovada; MINIATURAS_PREPARAR_CADASTRADAS=false desativa essa preparacao automatica. O executor reserva uma tarefa de cada vez por processo, com bloqueio entre instancias e limite diario global. Ao reiniciar, tarefas interrompidas podem ser recuperadas depois de 15 minutos. O servidor ou um worker dedicado precisa permanecer ativo; fechar o navegador nao interrompe o trabalho. Esta entrega nao provisiona Cloudflare Workflows nem altera o plano do Render.

A pesquisa gratuita consulta os indices de modelos do Bikez e MotorcycleSpecs, respeitando robots.txt, limites de tamanho, cache e tempo de resposta. Retorna nomes e links, sem reproduzir fichas, artigos ou fotografias desses catalogos. Quando encontra apenas uma versao proxima, identifica como sugestao da familia e nao a utiliza como prova da versao solicitada. Wikipedia fica como complemento. Fotos abertas vem de Openverse e Wikimedia Commons, com licenca CC0, dominio publico ou CC BY e autoria preservada. A busca tambem descobre paginas de produtos nos indices oficiais dos fabricantes. Fotos desses sites sao referencias privadas de identificacao, com direitos reservados, sem redistribuir o arquivo original. Sem foto, uma fonte textual que confirme o modelo permite gerar uma candidata, identificada como sem comparacao fotografica. Sem nenhuma fonte confirmada, informa a limitacao e permite corrigir o nome ou enviar foto opcional.

O administrador tambem pode importar uma foto a partir de uma pagina de fabricante permitida, declarando autorizacao de uso. A importacao valida dominio, robots, tipo e tamanho; nao segue redirecionamentos para destinos arbitrarios. Alguns fabricantes usam CDNs, JavaScript ou bloqueiam acesso automatico; nesses casos, envie a foto autorizada pelo computador ou celular. A declaracao do administrador nao substitui obter a autorizacao real.

A geracao usa Cloudflare. A verificacao visual tenta identificar direcao, enquadramento e defeitos evidentes. Uma segunda conferencia compara a candidata com a primeira referencia e aponta diferencas; isso nao certifica ano, cilindrada ou identidade. Se indisponivel ou inconclusiva, exige conferencia manual. O administrador confirma identidade, moto inteira, frente para a direita e autorizacao das referencias antes de publicar. Uma reprovacao automatica de enquadramento precisa ser corrigida.

## Ambiente do servidor

Copie os nomes abaixo para o ambiente do Render. Nunca coloque tokens em VITE\_\* ou no aplicativo.

```dotenv
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
MINIATURAS_MODELO_GERACAO=@cf/black-forest-labs/flux-2-klein-9b
MINIATURAS_MODELO_ALTERNATIVO=@cf/black-forest-labs/flux-2-dev
MINIATURAS_LIMITE_DIARIO=30
```

As credenciais Cloudflare existentes continuam aceitas, inclusive o formato anterior de contas JSON. A central usa a conta principal, sem alternar contas para contornar cotas. O limite diario representa reservas conservadoras de processamento, inclusive falhas e pedidos sem fonte adequada, nao um teto financeiro em moeda. Geracao, verificacao visual, pesquisa e armazenamento podem ter cobrancas proprias.

O token Cloudflare precisa de acesso a Workers AI na conta indicada. Habilite o modelo desejado no painel. Para usar Llama 3.2 Vision, aceite os termos da Meta na conta Cloudflare conforme a documentacao do modelo. Nao aceitamos termos automaticamente em nome do administrador.

Nenhuma API de busca paga e utilizada. Uma chave Brave antiga no ambiente e ignorada. Use o plano Workers Free no Cloudflare para manter o bloqueio de consumo excedente na propria conta; nao habilite creditos ou um plano pago se deseja custo zero. O aplicativo nao altera planos e nao consegue garantir ausencia de cobranca quando a conta foi configurada com faturamento pago. Ao receber esgotamento da cota diaria, preserva a solicitacao e agenda para a proxima janela UTC, sem descontar uma tentativa de geracao. A qualidade comparativa dos modelos deve ser medida com fotos reais; testes automatizados nao comprovam fidelidade de todas as motos.

## Banco

A migracao central_miniaturas cria:

- miniatura_catalogo: identidade exata, destino e publicacao atual.
- miniatura_pedidos: rascunho, referencias, pesquisa, verificacao, correcao e estado.
- miniatura_envios: hash de token temporario, validade e cancelamento.
- miniatura_publicacoes: historico imutavel para restauracao.
- miniatura_consumo: reservas diarias compartilhadas entre processos.

O bucket miniaturas-acervo e privado. As tabelas tem RLS e nao concedem acesso direto a anon ou authenticated. A API verifica a conta antes de usar a chave privada. As funcoes RPC de reserva/publicacao sao exclusivas de service_role e usam SECURITY INVOKER.

A chave combina modelo e variante normalizados, ano e destino. Nao agrupa por cilindrada nem por similaridade. Uma versao Spyder nao substitui a versao comum. Um ano especifico prevalece sobre a imagem generica quando a consulta inclui esse ano. Imagens particulares de uma moto nao entram no catalogo generico.

## Integracao dos percursos

A API e documentada em /documentacao/. Cliente e mecanico usam apenas leitura:

```http
GET /api/miniaturas/publicada?modelo=Honda%20CG%20150&ano=2012&tamanho=card
Authorization: Bearer <access_token do usuario Supabase>
```

Resposta:

```json
{
  "status": "publicada",
  "catalogoId": "identificador-do-catalogo",
  "revisao": 3,
  "imagem": "URL assinada temporaria",
  "atualizadoEm": "data ISO"
}
```

Use variante quando estiver separada do modelo. tamanhos: tabela, card, original. Sem publicacao, status e indisponivel e imagem e null. A consulta nao gera imagens. Nao salve a URL assinada como permanente: ela dura dez minutos. Reconsulte a API ao abrir a tela e periodicamente enquanto estiver visivel; compare revisao para atualizar a imagem. O admin consulta a cada minuto e atualiza imediatamente apos publicar na mesma aba.

Para uma foto exclusiva, informe motoId. O servidor resolve modelo/ano pelo cadastro e verifica propriedade do cliente, administrador ativo ou OS atribuida ao mecanico. O endpoint exige tambem modelo por compatibilidade com o contrato. Nunca envie a chave privada nos aplicativos. Configure MINIATURAS_ORIGENS com as origens web exatas dos percursos separadas por virgula. Essa permissao CORS vale somente para leitura de miniaturas. Aplicativos nativos nao usam CORS.

Os fontes dos outros dois aplicativos nao fazem parte deste ZIP. A API esta preparada, mas cada aplicativo deve adotar esse contrato para atualizar suas telas. Nao houve publicacao automatica dos aplicativos ou do servidor Render.

## QR Code

O link usa token aleatorio de 256 bits no fragmento, removido do endereco depois da leitura pelo aplicativo. Somente o hash e armazenado no banco. Dura vinte minutos; gerar outro invalida o anterior. O token so permite consultar modelo/quantidade e enviar fotos ao pedido vinculado. Nao permite ler fotos, gerar ou aprovar. HTTPS e necessario no celular; localhost do computador nao e acessivel por outro aparelho.

Arquivos sao decodificados com limite de pixels, reencodados sem EXIF/GPS e guardados privadamente. JPEG, PNG e WebP, ate 10 MB na entrada. HEIC nao e aceito nesta integracao; selecione JPEG/PNG/WebP. Referencias web nao podem indicar enderecos arbitrarios: o download automatico aceita somente Wikimedia, staticflickr e fabricantes/CDN explicitamente permitidos em fontesPublicas.ts, sem redirecionamentos arbitrarios.

## Manutencao

Codigo em server/src/miniaturas e componentes em client/src/components/miniaturas. O menu e cabecalho continuam compartilhados. A nova pagina e /miniaturas. O modal existente reutiliza o mesmo estudio.

A central substitui a geracao manual anterior em memoria. Rotas antigas de gerar/aprovar retornam 410 com o caminho substituto; leitura das imagens ja aprovadas continua compativel. Candidatas antigas permanecem privadas no bucket anterior. Gere uma nova solicitacao na central para substituir essas candidatas.

As correcoes por regiao orientam o modelo por texto e pela candidata anterior; nao sao uma mascara de inpainting com garantia de preservacao pixel a pixel. O resultado continua sujeito a revisao. A plataforma nao treina automaticamente os pesos do modelo nem disponibiliza um catalogo global entre oficinas. Uma futura comercializacao exige contratos de contribuicao e isolamento por organizacao.

Execute npm run typecheck, npm test e npm run format:check antes de entregar novas alteracoes.

## Worker dedicado opcional

Depois de npm run build, execute npm --prefix server run worker:miniaturas em um processo dedicado com o mesmo ambiente do servidor. As reservas no banco evitam executar duas vezes a mesma tarefa em paralelo com o servidor. A recuperacao apos queda tem janela de 15 minutos. Provisionar outro servico no Render depende do plano e nao foi feito automaticamente.

O arquivo integracao/miniaturas.ts e um cliente TypeScript sem dependencia de React para os outros percursos. Passe uma funcao que devolva o access token atual do Supabase, nunca uma chave privada. A integracao de cada tela precisa consultar novamente quando a revisao mudar ou a URL expirar.

## Fluxo rapido e lotes

O administrador informa somente a marca e o modelo, clica em gerar e pode continuar trabalhando. A IA busca fotografias abertas via Openverse e Wikimedia Commons; pesquisa textual e catalogos complementam a identificacao quando nao ha foto. Fotos CC0/PDM e CC BY sao aceitas, com origem e autor registrados. Openverse anonimo pode bloquear ou limitar consultas; nesses casos a pesquisa continua nas outras fontes. Nao depende de chave de busca paga.

Falhas de enquadramento e divergencias visuais detectadas provocam outra tentativa automaticamente, ate seis por solicitacao. Uma validacao de IA nao comprova identidade absoluta. Apenas o administrador publica; candidatos nunca sao entregues aos outros percursos. A aprovacao rapida e o clique explicito que confirma o modelo e o enquadramento.

A central recebe lotes de ate 100 modelos, um por linha, com deduplicacao no banco. Modelos publicados sao reutilizados. Mostra ate doze previas para selecionar e aprovar juntas. Uma aprovacao concorrente ou imagem reprovada continua bloqueada na API. O lote nao garante cem geracoes imediatas: velocidade e capacidade dependem da cota gratuita do Cloudflare e da disponibilidade das fontes. Nao ha estimativa artificial de conclusao.

O link do rodape e a pagina publica de fontes foram removidos do painel. Os metadados de origem continuam preservados na central e no contrato GET /api/miniaturas/creditos, usado pelas integracoes existentes; o SDK continua usando somente access token de usuario. Fotos particulares nao aparecem nessa lista. O endereco de uma fonte e autoria sao mantidos; o original encontrado nao e publicado como miniatura.

## Pesquisa e diagnostico reais

O indice de cada fabricante e reutilizado; nao existe uma lista fixa de motocicletas. Os conectores oficiais cobrem as marcas declaradas em fabricantes.ts; outras marcas continuam pelas fotos abertas e pelos catalogos que descobrem marcas dinamicamente. Isso amplia a cobertura, mas nao garante encontrar todo modelo, mercado ou ano historico. Um ano explicito nao usa uma pagina oficial de outro ano como referencia.

Fotos baixadas sao reencodadas e guardadas uma vez no pedido para reutilizacao nas tentativas. Se o download falha mas existe fonte textual confirmada, a geracao continua sem foto de comparacao; o aviso aparece na candidata. O sistema nunca publica automaticamente. O administrador pode corrigir o nome no proprio campo quando o pedido esta parado.

Pesquisa, geracao e conferencia aparecem como etapas. Uma mensagem de sucesso ao enfileirar nao permanece na tela depois de o pedido parar. MODEL_IMAGE_DAILY_LIMIT continua aceito como alias de MINIATURAS_LIMITE_DIARIO.

Use npm run doctor:image -- --modelo="Marca Modelo" para testar pesquisa e download sem gerar imagem. Acrescente --gerar para testar de verdade a chamada Cloudflare com o ambiente local, salvando a candidata em server/.verificacao/miniaturas/candidata.png. Esse comando consome a cota do provedor e nao publica nem grava pedidos no banco. Falta de credencial, de fonte ou falha do provedor e reportada sem apresentar simulacao como sucesso.

## Erro 3030 do provedor

O codigo isolado nao define a causa. O servidor preserva uma mensagem limitada do Cloudflare, com token e identificador da conta removidos, sem registrar o prompt ou as imagens. Mensagens de filtro (flagged, NSFW, copyright, moderation) recebem MODERACAO e encerram a tentativa sem reenviar automaticamente ou mudar de modelo. Outras mensagens 3030 continuam como falha de requisicao com o motivo original. A classificacao nao comprova falso positivo nem garante que uma nova geracao sera aceita.

Para reproduzir com o ambiente real: npm --prefix server run doctor:image -- --modelo="Marca Modelo" --gerar. A saida mostra o motivo quando o provedor recusa. Nao envie o arquivo .env nem suas chaves ao compartilhar esse diagnostico.
