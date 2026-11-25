# Miniaturas de motocicletas

## Fluxo

O administrador cria uma solicitacao por modelo, ano e variante. Pode enviar ate quatro fotos opcionais pelo computador, pelo celular ou pelo QR Code temporario. A tela principal exige somente o modelo e o clique em Gerar. Foto, observacao e controles avancados ficam recolhidos. A opcao preservar orienta a edicao a manter a moto fotografada; referencia cria uma representacao a partir das fontes. Nenhum desses modos garante reconstruir partes ocultas sem referencias.

A fila persiste no Supabase. Ao iniciar e a cada hora, prepara os modelos cadastrados ainda sem miniatura aprovada; MINIATURAS_PREPARAR_CADASTRADAS=false desativa essa preparacao automatica. O executor reserva uma tarefa de cada vez por processo, com bloqueio entre instancias e limite diario global. Ao reiniciar, tarefas interrompidas podem ser recuperadas depois de 15 minutos. O servidor ou um worker dedicado precisa permanecer ativo; fechar o navegador nao interrompe o trabalho. Esta entrega nao provisiona Cloudflare Workflows nem altera o plano do Render.

A pesquisa gratuita consulta os indices de modelos do Bikez e MotorcycleSpecs, respeitando robots.txt, limites de tamanho, cache e tempo de resposta. Retorna nomes e links, sem reproduzir fichas, artigos ou fotografias desses catalogos. Quando encontra apenas uma versao proxima, identifica como sugestao da familia e nao a utiliza como prova da versao solicitada. Wikipedia fica como complemento. Fotos abertas vem de Openverse e Wikimedia Commons, com licenca CC0, dominio publico ou CC BY e autoria preservada. A busca tambem descobre paginas de produtos nos indices oficiais dos fabricantes. Fotos desses sites sao referencias privadas de identificacao, com direitos reservados, sem redistribuir o arquivo original. Sem foto, uma fonte textual que confirme o modelo permite gerar uma candidata, identificada como sem comparacao fotografica. Sem nenhuma fonte confirmada, gera uma previa estimada com aviso. Compare com uma foto ou ficha do modelo, ano e edicao antes de aprovar.

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

As credenciais Cloudflare existentes continuam aceitas, inclusive o formato anterior de contas JSON. A central tenta as contas configuradas no mesmo pedido quando uma conta recusa as credenciais ou esgota a cota. Uma recusa de termos, plano ou acesso fica restrita ao modelo consultado e nao invalida a conta para outros modelos. Recusas sao reavaliadas apos cinco minutos ou imediatamente quando o token muda. O limite diario representa reservas conservadoras de processamento, inclusive falhas e pedidos sem fonte adequada, nao um teto financeiro em moeda. Geracao, verificacao visual, pesquisa e armazenamento podem ter cobrancas proprias.

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


## Medicao fotografica

Rode `npm --prefix server run test:referencias-reais` na raiz do projeto. A rotina consulta
fontes externas, baixa as fotos aceitas e conta somente as que o servidor consegue decodificar
e preparar. Fotos encontradas apenas para a familia nao contam como acerto de ano ou edicao.
Use `-- --lista=caminho.json` para medir uma lista de pares `[modelo, ano]`, com ano nulo
quando nao solicitado. O diagnostico termina com erro se a cobertura ficar abaixo de 70%.

A busca usa arquivos e categorias no Commons e fotos de artigos em portugues e ingles.
Metadados trazem autoria e licenca. Fotos CC BY-SA preservam o vinculo com a licenca de origem.
Quando uma miniatura do Commons falha no download, o backend tenta o arquivo original
na mesma origem permitida. Por padrao, o teste mede referencias sem chamar a geracao Cloudflare. Com `-- --gerar`,
ele gera candidatas e roda a conferencia automatica. Essa opcao consome cota do provedor,
usa o ambiente do servidor e nao publica imagens.


## Transparencia e direcao

O Cloudflare gera a candidata em fundo magenta ou verde uniforme, escolhido conforme a pintura informada e a tentativa. O backend remove essa cor e
valida a silhueta antes de salvar o PNG e as duas variantes WebP com alfa. A listagem
aplica a cor cadastrada ao fundo do cartao. A aprovacao exige moto inteira, farol a
direita confirmados na conferencia automatica e recorte transparente. Gere novamente
candidatas antigas para publicar com a regra nova.


## Continuidade da geracao

Nomes com duas letras, como CG, sao aceitos, com ano e edicao opcionais. Um nome generico ou sem fonte confirmada gera uma previa estimada para conferencia; nao comprova a identidade da moto.

A conferencia visual tenta o modelo alternativo quando o modelo principal exige termos, plano ou acesso indisponivel. Se a conferencia continuar indisponivel, a candidata permanece em revisao manual, sem ser aprovada automaticamente. O sistema nao aceita termos nem altera planos em nome do administrador. A recusa 5016 da conferencia nao bloqueia as contas que geram imagens.

Pedidos podem ser enviados a qualquer hora. O servidor ou worker deve permanecer ativo para processa-los. A cota gratuita e a disponibilidade da Cloudflare continuam limitando o momento da geracao. Se as contas disponiveis estiverem sem cota, o pedido fica pendente ate a liberacao. Se todas recusarem o token, e preciso corrigir as credenciais no servidor. Depois de uma correcao, use Gerar miniatura no pedido salvo, sem criar outro pedido.

Referencia dos codigos do provedor: https://developers.cloudflare.com/workers-ai/platform/errors/


## Modal de geracao

ModalPreviaModelo abre o EstudioMiniatura diretamente no fluxo das motocicletas e ordens de servico. O formulario inicial exibe marca/modelo, ano, versao, quatro fotos, QR Code, importacao autorizada do fabricante, modos e observacoes. Opcoes avancadas iniciam abertas; a previa vazia ocupa a coluna direita. O resultado tem uma secao de conferencia e publicacao fora do formulario. O rodape conserva tentativas, descarte, cancelamento e gerar novamente.

As chamadas seguem usando centralMiniaturas e as rotas existentes da API. Fechar o modal nao apaga o pedido nem o rascunho da conta. A aprovacao continua exigindo confirmacao explicita e as validacoes do servidor. A importacao de fabricante exige autorizacao de uso. O envio de mais de quatro fotos e rejeitado antes do upload; se um arquivo falhar depois de outros serem recebidos, as referencias ja salvas sao recarregadas. O QR nao e apagado pela primeira criacao do pedido.

A aparencia foi conferida no navegador em 1536 x 1024 e 390 x 844, com o componente real e uma API controlada externa ao pacote. A sobreposicao usa o anexo 1 com opacidade de 50 por cento, mesma escala e alinhamento pelas bordas. O ambiente de comparacao e seus dados simulados nao fazem parte do aplicativo entregue.


## Atividade e conferencia em etapas

O modal reutiliza a logo oficial via LogoEstacao. Enviar fotos e Usar QR Code ficam vermelhos com texto e icones brancos no hover e no foco de teclado. O formulario e a conferencia sao etapas separadas; uma candidata recebida abre a segunda etapa, volta ao topo e limpa o aviso antigo de fila. E possivel retornar ao formulario sem perder o pedido.

Cancelar link utiliza o pedido que criou o QR, aguarda a confirmacao do servidor e so entao remove o codigo. Uma falha preserva o QR e mostra erro; o botao fica bloqueado durante a chamada. No backend, cancelarEnvios marca os links daquele pedido como cancelados e expirados. A consulta de envioValido deixa de aceitar o token. A operacao pode ser repetida.

O executor salva pesquisa.progresso no JSONB ja existente, sem novas tabelas, colunas ou mudancas no formato das chaves antigas. O campo e opcional. Pedidos antigos continuam legiveis; apenas novas execucoes possuem os registros detalhados. Os testes cobrem o formato legado sem progresso, o historico entre tentativas e a gravacao consultada pelo worker. O contrato OpenAPI documenta o campo opcional.

Cada evento registra etapa, descricao, tentativa, iniciado_em e, quando concluido, concluido_em e duracao_ms. Detalhes incluem fontes/referencias preparadas, modo, observacoes e correcao solicitadas, resultados da conferencia e condicao de parada ou espera. Correcao solicitada nao significa alteracao visual comprovada. Os tempos sao intervalos de parede observados entre etapas; nao representam tempo de CPU nem acesso ao raciocinio interno do modelo. O historico mantem ate 120 eventos recentes.

O comparador ajusta as duas imagens inteiras no enquadramento a 100 por cento. Ampliacao manual continua disponivel para detalhes, com rolagem; ao voltar a 100 por cento a imagem inteira volta a caber. Em telas estreitas as imagens ficam uma abaixo da outra. A candidata da segunda etapa tambem usa object-fit: contain.


## Cancelamento protegido, Log e aprovacao manual

Cancelar link usa o transporte autenticado central. Quando a API responde HTTP 428, o painel solicita a confirmacao administrativa existente e repete o DELETE apos a confirmacao. O QR somente desaparece depois do sucesso; nao ha timeout durante a entrada humana da confirmacao. O servidor continua invalidando o token.

O Log mostra etapas publicas, icones, fontes consultadas e horarios registrados. Pedidos antigos recuperam os fatos disponiveis nas referencias, pesquisa e candidata, sem inventar horarios ausentes. Novas execucoes registram a busca e a foto preparada com nome da fonte. Nao apresenta raciocinio interno.

Fidelidade inconclusiva ou divergente exige conferencia manual explicita com aviso visivel. Nao exige pontuacao automatica perfeita para essa conferencia humana. Permanecem obrigatorios os controles de identidade, permissao, revisao concorrente, confirmacoes e validacoes tecnicas de enquadramento, direcao e transparencia. A verificacao original e preservada; a publicacao registra confirmado_por, confirmado_em e fidelidade_confirmada_manualmente no JSON existente. Sem nova migracao SQL. Os botoes de remover referencias medem 32 por 32 pixels e possuem borda circular.


## Fundo removido nos vazios internos

O worker nao reaproveita mais fotos de estudio removendo pixels brancos: esse atalho confundia pintura branca com fundo e nao comprovava os vazios internos. Todas as novas candidatas passam pela geracao com fundo chave uniforme e recortarMiniatura. A instrucao exige a mesma chave fora e dentro dos aros, entre raios, tubos do quadro, motor e tanque, sem apagar pecas ou pintura. A remocao percorre todos os pixels, incluindo regioes internas desconectadas das bordas. PNG original e WebP derivados preservam alfa; a cor de fundo pertence ao sistema que exibe a miniatura. Candidatas antigas precisam ser geradas novamente; nao se presume que um fundo branco seja transparente.

Testes de pixels cobrem os dois fundos chave, vao entre raios e quadro, tanque branco preservado, detalhes metalicos e composicao com duas cores em todas as variantes. O teste do worker inclui foto branca de estudio e exige a geracao com fundo chave, sem atalho. Sao testes sinteticos, sem nova chamada real ao provedor.


## Revisao, referencias e cancelamento

- O estudio aceita upload, camera/galeria pelo QR e link HTTPS publico direto de JPEG, PNG, WebP ou pagina HTML. A importacao valida DNS e IP de cada destino/redirecionamento, fixa o IP validado na conexao, bloqueia redes privadas e limita tempo, tamanho e redirecionamentos. O arquivo continua passando pela decodificacao e reencodificacao antes do Storage.
- Cada tentativa refaz a pesquisa em fabricantes, fotos abertas, Commons, artigos, categorias e catalogos. Ate 24 candidatas fotograficas exatas sao tentadas para preencher as quatro imagens aceitas pelo gerador. Uma fonte da familia nao comprova ano ou versao. Nas novas tentativas, referencias automaticas podem ser substituidas, priorizando fontes ainda nao usadas; uploads manuais sao preservados.
- A conferencia permite selecionar cada referencia, voltar a preparacao e gerar novamente sem escrever uma correcao. O botao de gerar nao depende de submeter um formulario oculto.
- Quando o verificador visual esta indisponivel, a confirmacao manual explicita pode liberar a publicacao, com autoria e horario registrados. Transparencia continua obrigatoria. Um resultado automatico que detecta moto cortada ou direcao incorreta permanece bloqueado.
- Cancelar solicitacao marca o pedido como descartado, remove a reserva do executor e revoga o QR. Resultados de um executor cancelado nao podem atualizar o pedido. O estudio retorna a uma nova solicitacao com dados editaveis. A chamada de IA ja enviada pode terminar no provedor, mas seu resultado nao sera publicado.


## Aprovacao e compatibilidade com o banco

A aprovacao valida o arquivo original salvo no Storage antes de alterar o pedido. Metadados antigos de transparencia nao bloqueiam uma imagem cujo canal alfa foi conferido no arquivo. Imagem opaca, vazia, ausente ou corrompida nao e publicada.

Depois das quatro confirmacoes, a API salva direcao e enquadramento efetivos em formato aceito pela funcao publicar_miniatura existente. A resposta original da IA fica em verificacao.analise_original e a autoria, o horario e o caminho conferido ficam registrados. Uma direcao incorreta ou um corte identificados pela analise automatica continuam exigindo nova geracao.

A atualizacao usa status, candidata e atualizado_em para impedir que uma confirmacao sobrescreva uma alteracao concorrente. A funcao SQL existente tranca pedido e catalogo e valida a revisao antes de publicar. Repetir uma requisicao de pedido ja aprovado nao cria outra publicacao. Erros de revisao atualizam a tela sem publicar silenciosamente uma versao diferente. A falha de recarregar a previa apos sucesso nao e exibida como falha de publicacao.

Nao e necessaria uma nova migracao para esta correcao. O teste publicacao-sql.test.mjs executa a funcao PL/pgSQL original em PostgreSQL embarcado e cobre o caso antes bloqueado pela divergencia entre API e SQL.


## Central no menu e retomada do pedido

O item Miniaturas aparece no menu principal administrativo somente quando existe rascunho, pedido na fila/em processamento, revisao, falha ou informacao pendente, ou enquanto o modal oficial esta aberto. Publicadas e descartadas nao mantem o item visivel. A consulta GET /api/admin/miniaturas/pendencias devolve a contagem exata, sem assinar imagens e sem depender do limite de 500 linhas da listagem. A atualizacao acompanha os eventos de dados e o foco da janela, com consulta leve de recuperacao a cada 30 segundos quando a janela esta visivel.

A central apresenta somente trabalhos em aberto. Nova miniatura e Estudio de miniaturas abrem ModalPreviaModelo, o mesmo modal usado no restante do projeto. O lapis do card e a acao da tabela passam pedidoId para retomar o pedido, mantendo ano, versao, modo, observacoes, referencias e candidata existentes. Um novo pedido usa escopo de rascunho proprio para nao reabrir uma solicitacao anterior por engano.

Os indicadores usam CartaoIndicador com seu CSS compartilhado. Os botoes genericos da central nao sobrescrevem mais o alinhamento e a tipografia desses cards. O lapis e um botao separado da selecao do card, para que editar nao marque nem aprove uma imagem.

Atualize cliente e servidor juntos para disponibilizar a consulta de pendencias. Nao ha nova migracao de banco.


## Padrao de cor e enquadramento

A versao atual usa base neutra transparente e mascara pintura.png, com pintura restrita aos paineis. O container acompanha o tema, sem fundo derivado da cor da moto. Novas imagens exigem perfil lateral ortografico, com o farol para a direita. O fluxo atual esta em "Pintura por mascara de luz" e o registro anterior em HISTORICO.md.


## Acabamentos fixos e geracao atomica

Somente o tanque e superficies confirmadas como pintura variavel da versao recebem personalizacao. Acabamentos de fabrica de rodas, motor, escapamento, suspensao, suporte de placa, carenagens e paralamas padrao ficam preservados, inclusive suas cores. A base e neutralizada apenas na mascara; nao se converte a moto inteira para cinza.

O modal envia observacoes, modo e correcao diretamente em POST /:id/gerar. O servidor salva os dados e enfileira em uma unica atualizacao condicionada ao estado/revisao temporal. Um pedido ja na fila ou processando retorna jaNaFila sem duplicar a geracao ou tentar edita-lo. A tela atualiza o estado e conserva as alteracoes locais. As chamadas antigas sem novos campos continuam compativeis.

## Pintura por mascara de luz
A IA gera a moto uma vez, com os paineis coloriveis em ciano reservado sobre fundo chave. O servidor recorta o fundo e separa o ciano por matiz (170 a 208 graus, saturacao minima), porque o FLUX entrega um turquesa proximo de 185 graus mesmo quando o prompt pede #00B8FF. Pecas azuis de fabrica ficam acima de 210 graus e continuam fora.

Arquivos de cada candidata: original, card e tabela (base neutra completa), pintura.png (mascara de luz: vermelho e verde guardam a luminosidade, azul zero identifica o formato), previa.png e recorte.png. O navegador aplica a cor com `cor x luminosidade / 200`. Sem a mascara, a base neutra completa continua valida. Mascaras antigas (azul 255) seguem aceitas.

## Direcao, pessoas e filtro do provedor
- O FLUX copia a direcao das referencias. Com a frente para a esquerda na conferencia, a imagem e espelhada e o aviso pede para conferir o lado do escapamento.
- O prompt proibe pessoas, partes do corpo e cavaletes de pista; a conferencia registra "pessoa na imagem" e pede nova geracao.
- O 3030 com texto de prompt ou imagem de entrada e tratado como falso positivo: o pedido tenta o texto curto, depois uma foto e por fim nenhuma foto. Recusa real segue pedindo foto.
- Qwen 3.8 e o modelo de visao principal. O Llama 3.2 Vision exige aceite de licenca na conta e fica como reserva.

## Credenciais e tokens
- Account ID e token sao limpos de espacos, aspas, `Bearer` e fim de linha do Windows antes do uso.
- Cada token so funciona na conta onde foi criado. Depois de alterar o `.env`, reinicie o servidor.
- `GET /api/admin/miniaturas/situacao` informa pausa, credenciais recusadas ou tokens esgotados e o horario de retomada. O estudio mostra essa faixa antes de gerar.
- A cota gratuita renova as 00:00 UTC. Varias contas gratuitas para somar cota podem ser bloqueadas pela Cloudflare; para uso diario prefira o plano Workers Paid.

## Busca de referencias
Fontes, em ordem de confianca: paginas oficiais dos fabricantes (ate 3 fotos, incluindo og:image), Wikidata (P18, categoria P373 e arquivos marcados com P180 no Commons), categoria do modelo no Commons e ate 4 subcategorias, galeria do artigo da Wikipedia (pt e en, depois outros 6 idiomas), busca no Commons e Openverse.

- O nome digitado e limpo: marca repetida, ano dentro do nome e sufixo cc.
- Com menos de 3 fotos exatas, uma segunda rodada usa outras grafias (CG160, sem marca) e a versao base (sem acabamentos como S, R, SP, Tricolore, Superleggera, CVO).
- Ranking: foto do fabricante, foto deitada, recente e de perfil sobe; foto em pe, de salao, pista ou detalhe desce. Arquivo que cita outro codigo de modelo da marca (M1000R na busca da S 1000 RR) fica de fora.
- No maximo 3 consultas simultaneas a Wikimedia, com User-Agent identificavel (`WIKIMEDIA_CONTATO` ou `CLIENT_URL`) e nova tentativa em 429.

## Teste real
`npm run testar:ia-real` gera os modelos de amostra, recorta, separa a pintura, aplica vermelho e azul e confere com a visao. O resultado fica em `.teste-ia/<data>/index.html`. `--so-busca` mede so o buscador, sem gastar tokens. `--modelos="BMW R 1250 GS;Ducati Panigale V4 S|2023"` e `--saida=<pasta>` sao opcionais.

## Casos de uso
- Vale a ultima miniatura aprovada entre a do ano exato, a generica do modelo e uma antiga somente da moto.
- Criar outra miniatura do mesmo modelo e permitido; aprovar substitui a anterior, que fica no historico.
- O limite de seis tentativas vale para as correcoes automaticas; um novo clique em Gerar libera outra rodada. O limite diario continua valendo.
- A analise da IA vira alerta: com a confirmacao do administrador a publicacao segue e o alerta fica em `alerta_ia_ignorado`.
