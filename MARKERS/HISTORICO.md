# Historico de revisoes

Registro das rodadas anteriores de correcao e verificacao. Serve para entender por que uma regra existe. O comportamento atual fica nos guias tematicos: MINIATURAS.md para a IA de miniaturas, SEGURANCA.md para seguranca e MANUTENCAO.md para o fluxo de trabalho. Quando um registro abaixo contradiz um guia tematico, vale o guia tematico.

Os numeros de testes abaixo sao da rodada em que foram medidos e nao descrevem o estado atual.

## Painel e seguranca

### Revisao para a apresentacao

| Item | Resultado |
| --- | --- |
| Icone de Novo agendamento | Ajustado para 26 x 18 px, com largura fixa dentro do botao. |
| Documentacao | Arquivos Markdown do projeto movidos para MARKERS. |
| Geracao de imagens | Modulo do provedor movido para server/src/ia. Nomes de chaves e modelos seguem o contrato do provedor. |
| Limpeza | Removida a funcao cliente criarServicoDaOrdem, sem chamadas no codigo fonte. A rota externa foi preservada. |
| Cadastro de funcionario | Rascunho da etapa, dos campos e da foto. Senhas ficam em memoria e os dados sao limpos apos sucesso. |
| Nova OS | O teste existente confirmou recuperacao dos campos depois de fechar. Os campos de foto por angulo receberam nome para leitor de tela. |
| Catalogo | A API valida formato, duplicatas, referencias, versao e permissoes. Mudancas em categorias passam a exigir edicao no servidor. |
| Acessibilidade | Etapas do cadastro usam aria-current. Fotos informativas precisam de texto alternativo e imagens decorativas ficam com alt vazio. Falta revisar foco, contraste e leitores de tela nos demais fluxos. |
| Autorizacao | A entrada protegida busca sessao, perfil e permissoes no servidor. Ha testes pendentes de conciliacao com a regra atual de cargos fixos. |
| Rascunhos e codigo sem uso | A revisao de todos os formularios, carregamentos dinamicos e consumidores externos ainda esta pendente. |
| TikTok | Anexos recebidos e analisados. Veja "Recomendacoes dos videos" neste arquivo. |

#### Resultados

- Build de producao compila cliente e servidor.
- Servidor: 131 de 143 verificacoes passaram. Ha falhas em permissoes, dados compartilhados, contrato OpenAPI, pesquisa, historico e outros casos. O arquivo de testes de funcionarios precisa da configuracao local de Supabase para inicializar.
- Interface: a execucao registrou 46 aprovados e 17 reprovados antes do limite de tempo. A suite nao encerrou sozinha. Foram 17 de 63 cenarios com falha (27,0%). Esse dado nao mede a dificuldade percebida por pessoas.
- Proximos criterios para aprovar: resolver os testes vermelhos sem afrouxar permissoes, retestar os fluxos autenticados em ambiente de teste e fazer sessoes com tarefas reais, teclado e leitor de tela.

#### Correcoes adicionais

- Meu Perfil guarda apenas os campos pessoais editados em rascunho. Senhas e autenticador ficam em memoria.
- O contrato OpenAPI inclui as rotas de consulta e gravacao dos dados da oficina. A verificacao de correspondencia passou.
- O limite de requisicoes retorna 429 com Retry-After e foi validado por teste local. Contadores sao locais ao processo.
- O backup usa timeout de 15 segundos em chamadas HTTP.

#### Rodada de foco, rascunhos e permissoes

- Tab, Shift+Tab e retorno de foco cobertos por teste automatizado. O controle compartilhado foi aplicado aos principais modais. Confirmacao administrativa, previas e dialogos de configuracao usam dialog nativo onde indicado no codigo.
- Motivo de exclusao de cliente preservado por registro e limpo apos sucesso. Formularios de pagamento, cliente, moto, agenda, categoria e OS ja usam rascunho nos campos principais. Credenciais e confirmacoes nao sao persistidas.
- A rota antiga de criacao de servico exige permissao de criacao no catalogo. A criacao implicita da categoria Geral exige permissao de edicao. O teste de acesso passou.
- Build aprovado. Servidor: 139 de 149 testes. Interface: 47 de 64. Os tres testes focados em foco e rascunhos passaram.
- Validacao com leitor de tela real, banco implantado, historico Git e revisao exaustiva de codigo sem uso continuam pendentes. Nao houve aprovacao geral de seguranca.

### Recomendacoes dos videos

Leitura dos textos visiveis nos tres anexos. A = encontrado no codigo, P = parcial ou pendente de verificacao, M = mudanca nesta rodada, N = fora do fluxo atual. Encontrado no codigo nao equivale a aprovacao em producao.

#### Seguranca

| # | Medida | Situacao e evidencia |
|---|---|---|
| 1 | Autenticacao | A. Supabase Auth e sessao no servidor. |
| 2 | Chaves fora do navegador | A. Provedores leem env no servidor. |
| 3 | Banco protegido | P. Migracoes e autorizacao existem. Falta verificar as politicas implantadas. |
| 4 | HTTPS | M. HSTS em respostas HTTPS de producao. TLS depende da hospedagem. |
| 5 | Hash de senhas | A. Armazenamento delegado ao Supabase Auth. |
| 6 | Validacao no servidor | P. Zod em rotas de OS, autenticacao e catalogo. Cobertura total pendente. |
| 7 | XSS | P. React escapa texto por padrao. CSP basica aplicada. Diretivas estritas de scripts dependem de verificacao dos fluxos reais. |
| 8 | Monitoramento | P. Status e ID por requisicao. Alertas operacionais pendentes. |
| 9 | Rotas administrativas | P. Autorizacao no servidor. Existem testes de cargos reprovados. |
| 10 | Consultas parametrizadas | P. SDK e argumentos de RPC. Revisao completa das funcoes SQL pendente. |
| 11 | Variaveis de ambiente | A. Configuracao local e verificador no servidor. |
| 12 | Limites de requisicoes | P. M. Limites locais por IP antes da leitura do corpo, com regras para login e recuperacao. Contador distribuido pendente. |
| 13 | CORS | A. Origens permitidas no servidor. |
| 14 | Cabecalhos | A/M. Nosniff, bloqueio de iframe, politica de permissoes, no-referrer e HSTS. CSP basica aplicada para objetos, base, formularios e enquadramento. |
| 15 | Cookies | A. SameSite e Secure conforme ambiente. |
| 16 | CSRF | A. Escritas verificam origem. Revisar excecoes na hospedagem. |
| 17 | Expiracao da recuperacao | P. Delegada ao Supabase Auth. Conferir configuracao implantada. |
| 18 | Uploads | P. Limite de corpo e de pixels no processamento de miniaturas. Revisar outras rotas de imagem. |
| 19 | Preco e pagamento | P. Existem validadores e rotas de pagamento. Falta teste autenticado ponta a ponta. |
| 20 | Debug | P. Verificar configuracao efetiva de producao. |
| 21 | Dependencias atualizadas | P. Lockfiles existentes. Compatibilidade e auditoria de versoes pendentes. |
| 22 | Pacotes sem uso | P. Nao remover sem rastrear imports, scripts e carregamentos dinamicos. |
| 23 | Arquivos publicos | P. Express serve o build. Conferir exposicao na hospedagem. |
| 24 | Segredos no historico | P. Workspace sem historico Git para verificar. |
| 25 | Revogacao e rotacao | P. Depende de evidencia de exposicao e acesso aos provedores. |
| 26 | Revisao | P. Revisao de codigo e testes locais em andamento. |
| 27 | Testes e relatorio | P. Veja "Revisao para a apresentacao" neste arquivo e os numeros da rodada atual abaixo. |

#### Desempenho

| # | Medida | Situacao |
|---|---|---|
| 1 | Estados de carregamento | A. Ja presentes em varias telas. |
| 2 | WebP ou AVIF | A. Guia fotografico da OS usa WebP. Revisar outros ativos pesados. |
| 3 | Chamadas duplicadas | P. Medir trafego autenticado. |
| 4 | Debounce | A. Busca geral tem protecao contra respostas antigas e teste proprio. |
| 5 | Paginacao | A. Listas e consultas paginadas. |
| 6 | CDN | P. Depende da hospedagem. |
| 7 | Fila | A. Miniaturas usam fila persistente. |
| 8 | Consultas N+1 | P. Medir consultas por rota. |
| 9 | Brotli ou gzip | P. Conferir compressao na borda antes de adicionar middleware. |
| 10 | Redis | P. Depende de perfil de carga, privacidade dos dados e custo. |
| 11 | Dependencias sem uso | P. Inventario completo pendente. |
| 12 | Timeout externo | A. Busca de fotos e provedores de imagem usam AbortSignal. |
| 13 | Streaming de tokens | N. Geracao atual e de imagens em fila. |
| 14 | Atualizacao otimista | P. Avaliar apenas em acoes reversiveis com rollback. |
| 15 | Imagens sob demanda | P. Conferir por tela e viewport. |
| 16 | Paralelismo | A. Consultas independentes usam Promise.all em fluxos como catalogo. |
| 17 | Indices | A. Existem migracoes com indices. Falta medir planos reais. |
| 18 | Rastreamento distribuido | P. M. ID de requisicao e tempo de respostas lentas, sem registrar caminhos. OpenTelemetry pendente. |
| 19 | Regiao perto do banco | P. Confirmar regioes da hospedagem e do banco. |
| 20 | SSR ou pre-render | N. Painel privado usa SPA. Reavaliar com medicao antes de mudar arquitetura. |
| 21 | Scripts de terceiros | P. Revisar o caminho critico da pagina. |
| 22 | JS por pagina | A. Build gera pacotes de telas separados. |
| 23 | Virtualizacao | P. Paginacao ja reduz volume. Medir antes de virtualizar. |
| 24 | Colunas necessarias | P. Existem selects explicitos. Revisar consultas restantes. |
| 25 | Reuso de conexoes | P. Confirmar nas metricas do provedor. |
| 26 | Renderizacoes | P. Medir por tela em build de producao. |
| 27 | Cache estatico | M. JS e CSS versionados por hash podem ficar em cache por um ano. |
| 28 | Varias instancias | P. Depende de carga, custo e testes de concorrencia. |
| 29 | Fontes locais | P. Inventariar fontes e licencas antes de trocar arquivos. |
| 30 | Velocidade real | P. Falta medicao em ambiente autenticado. |
| 31 | Celular e rede lenta | P. Falta teste em aparelho ou navegador configurado para esse cenario. |

#### Controle de custos

| Pontos | Medida | Situacao |
|---|---|---|
| 1-4 | Segredos, rotacao, bots e abuso de cadastro | Segredos no servidor. Verificacao de exposicao e protecao de formularios publicos dependem de revisao adicional. |
| 5-7 | Cotas por usuario, limite de entrada e separacao de chaves | Ha limite diario da fila e texto de pesquisa limitado. Cota individual e chaves separadas dependem de configuracao. |
| 8-9 | Plano e checkout | N. Painel da oficina nao oferece assinatura nem checkout de cartao online. |
| 10-11 | Limites por usuario, IP e mensagens | M. Limites por IP na API e intervalo de recuperacao reservado antes do primeiro acesso externo. Limites do provedor ainda precisam ser verificados. |
| 12-14 | Modelos, saida e chamadas externas | Modelo configurado no servidor, dimensoes fixas na fila e timeouts. Nao ha saida de chat. |
| 15-18 | Concorrencia, repeticao, reserva e retentativa | Fila reserva tarefa no banco e verifica executor. Confirmar idempotencia e teto de retentativas em ambiente com multiplas instancias. |
| 19-22 | Uploads, arquivos compactados, URLs assinadas e gravacao | Limites de corpo/pixels presentes. Confirmar politicas de armazenamento e todos os endpoints implantados. |
| 23-26 | Temporarios, retencao, ciclos e duracao | P. Confirmar retencao de logs e artefatos, prazo de execucao e ausencia de reentrada em producao. |
| 27-30 | Tarefas sobrepostas, lotes, escalonamento e gastos | Fila evita sobreposicao local e limita reserva. Escalonamento e custos por usuario exigem metricas do provedor. |
| 31-34 | Alertas, teto de gastos e pausa | M. MINIATURAS_PAUSAR_GERACAO=true no ambiente do servidor, seguido de reinicio, pausa novas chamadas de geracao. Alertas e corte automatico do provedor pendentes. |
| 35 | Verificacao dos limites | P. Rodar cenarios autorizados em ambiente de teste, sem disparar consumo real. |

#### Verificacao da rodada

Build de producao aprovado. A suite de servidor manteve 131 de 143 verificacoes aprovadas.
A ultima rodada de interface registrou 46 aprovadas e 17 reprovadas com encerramento forcado apos os testes.
Para a apresentacao, falta validar os fluxos autenticados no ambiente da oficina.

Antes de mudar arquitetura, confirmar o objetivo e o custo de CDN externa, Redis, OpenTelemetry e
varias instancias. Para limitar gastos automaticamente, definir um teto por provedor e uma forma de
alerta. Uma CSP em modo de bloqueio exige testar login, documentos, preview de fotos e QR Code.

## Miniaturas

Superado pelo guia atual: a pintura usa a mascara de luz (MINIATURAS.md, "Pintura por mascara de luz") e a imagem virada para a esquerda e espelhada automaticamente (MINIATURAS.md, "Direcao, pessoas e filtro do provedor"). Os registros abaixo que proibem espelhar ou exigem buracos na base ficaram no historico.

### Base neutra e pintura por mascara (primeira versao)

#### Regras visuais

A geracao exige perfil lateral ortografico reto, com camera perpendicular a moto, sem tres quartos, frente ou traseira em perspectiva. A roda dianteira e o farol apontam para a direita. A verificacao visual recebe o campo vistaLateral. Uma analise automatica que identifica esquerda, corte ou vista em perspectiva bloqueia a publicacao e pede outra geracao. Se a analise estiver indisponivel ou inconclusiva, a conferencia manual exige explicitamente perfil lateral e frente a direita. Nao se espelha a fotografia para simular a orientacao.

#### Pintura

O fundo do componente bikes-thumb usa theme-surface: branco no tema claro e a superficie escura do tema escuro. Nao recebe a cor cadastrada da moto.

O gerador usa ciano reservado (#00B8FF) somente como codificacao intermediaria da pintura variavel da versao: tanque e outras superficies confirmadas como parte da opcao de cor. Carenagens, paralamas e tampas nao sao automaticamente incluidos: um acabamento padrao permanece original. Rodas, escapamento, motor, suspensao, suporte de placa, banco, adesivos e partes mecanicas nunca sao recoloridos automaticamente, mesmo que tenham cor de fabrica. O ciano e separado dos fundos de recorte verde/magenta.

separarPinturaMiniatura neutraliza somente os pixels marcados. Fora da mascara, os canais RGB e alfa sao preservados: azul de rodas, dourado de suspensao, bronze, cromado e preto de plastico nao viram cinza. A base transparente e neutra apenas nas areas que recebem a cor cadastrada; pintura.png identifica essas areas.

A mascara e validada em tamanho, cobertura e contencao na silhueta. Mascara ausente, vazia, espalhada por toda a silhueta ou invadindo o fundo impede publicar uma candidata nova marcada como personalizavel. A ausencia do marcador na geracao exige nova tentativa em vez de pintar o container.

A API de publicada devolve a URL assinada opcional mascara. As rotas binarias tambem oferecem X-Preview-Paint-Mask, exposto no CORS. O navegador aplica a cor somente aos pixels cobertos, preservando luminosidade e alfa da base. Falha ao obter uma mascara conserva a base, sem pintar a imagem inteira. Miniaturas antigas sem mascara nao sao automaticamente reinterpretadas como superficies pintaveis.

#### Atualizar

Atualize cliente e servidor juntos. Nao ha nova migracao SQL: os arquivos continuam no acervo existente, com pintura.png ao lado das variantes. As imagens antigas precisam ser geradas novamente pelo lapis da central, conferidas e aprovadas para receber o novo perfil e a mascara. A publicacao anterior continua ate a nova aprovacao.

#### Verificacao

Os testes incluem preservacao exata de acabamentos azuis e dourados fora da mascara, recorte verde e magenta sem perder a pintura variavel, aplicacao de oito cores, enfileiramento atomico, concorrencia e integracao com a funcao SQL original. Os resultados estao em "Verificacao dos acabamentos" neste arquivo.

A geracao real no provedor e o banco de producao nao foram acionados. Os testes verificam os controles e o processamento com imagens e respostas controladas; a conferencia visual de cada moto continua obrigatoria antes da publicacao.

### Camadas universais

Original PNG e variantes WebP sem fundo externo e com alfa zero nas regioes marcadas como pintura variavel. pintura.png armazena cobertura alfa e luminosidade nos canais R/G; B=0 identifica a mascara de camadas. O navegador compoe a cor atras da estrutura apenas nessa cobertura. Mascaras antigas brancas continuam suportadas. previa.png conserva a moto neutra completa para revisao e referencia de correcoes. Nenhuma migracao SQL. Regenerar modelos antigos para obter as camadas.

Teste isolado executado com Sharp e funcoes TypeScript transpiladas: recorte real, validacao, oito cores e cor neutra, preservacao de peca azul fixa e fundo externo. Nao equivale a teste de geracao real. A segmentacao ainda depende da qualidade do marcador ciano da IA. Nao foram testados Cloudflare, banco, navegador ou fluxo completo. Frontend dist antigo: executar npm ci e npm run build no client antes de usar. Servidor dist atualizado por transpilacao, nao por build completo. Nao foram realizadas novas alteracoes no motor de busca ou modal nesta revisao.

### Revisao do provedor e do canvas

Base: Camadas Universais. Preservadas instrucoes e historico.
- HTTP 3xx nao seguido automaticamente; 3030 tratado como falha temporaria; rotacao entre contas para falhas temporarias; resposta binaria aceita.
- Busca em oito Wikipedias, consultas adicionais Openverse e catalogo sem ano como familia. Sem referencia exata nem fonte textual confirmada, solicita foto.
- Canvas final 1024x1280 transparente, sem girar/espelhar a moto; mascara de camadas preservada.
- Estudio: nova solicitacao, limpeza de estado, fechamento apos aprovacao sem esperar nova leitura, controles maiores e rodape nao fixo.
- Publicacao universal por identidade (modelo, ano e versao); nao mistura geracoes diferentes. Historico mantido.
Validacao: transpileModule TS/TSX e teste sintetico Sharp de canvas. Nao houve build integral, teste de API real, banco ou navegador. O client/dist anterior nao foi recompilado: execute npm ci e npm run build em client e server antes de implantar. Nao ha garantia de identificacao perfeita da pintura ou disponibilidade de fontes externas. Nao foram alteradas credenciais nem banco de producao.

### Revisao de referencias, cota e modal

Alteracoes em codigo-fonte: canvas retrato 1024x1280, perfil lateral direito, consultas Commons adicionais, solicitacao de referencia quando nao houver fonte confirmada, publicacao compartilhada por modelo, mascara obrigatoria, aviso de cota, pop-up de erros e fechamento apos aprovacao no estudio. O historico anterior permanece.
Interpretacao: retrato e o formato do arquivo, a moto permanece apoiada nas duas rodas, sem rotacao.
Validacao: transpileModule do TypeScript nos arquivos modificados; nao substitui build completo nem teste de integracao. Execute npm ci e npm run build em server e client antes de publicar. O dist do cliente original nao foi recompilado. Verifique credenciais, cota, modelos Cloudflare, permissoes e geracao real em ambiente de homologacao. Nao foram alteradas credenciais nem banco remoto. A busca adicional usa fontes existentes, nao um novo motor comercial. Variantes especificas e consumidores legados devem ser testados.

### Continuidade e rodizio de credenciais

#### Causa do log
HTTP 401/codigo 10000 indica credenciais recusadas. HTTP 403/codigo 5016 indica termos do modelo de conferencia visual. A versao anterior classificava os dois como credenciais e mantinha as contas bloqueadas para todos os modelos, inclusive o gerador. Isso tambem impedia a alternativa de conferencia visual.

#### Correcoes
- 401 continua tentando a proxima conta no mesmo pedido.
- 5016 (termos), 5035 (plano) e 403 de acesso ficam restritos ao modelo; nao invalidam as credenciais de geracao.
- A conferencia tenta a alternativa ja existente. Se nenhuma conferencia estiver disponivel, salva a candidata em revisao com verificacao indisponivel. Nao aprova automaticamente nem remove os requisitos de publicacao.
- Recusas sao reavaliadas apos cinco minutos, ou imediatamente com um token diferente. Nenhum termo e aceito automaticamente e nenhum plano e alterado.
- Todas as contas com credenciais recusadas: erro de configuracao. Conta disponivel aguardando cota: pedido pendente ate a liberacao, sem gastar uma tentativa.
- CG com duas letras e aceito na API, no lote, no estudio e na interface rapida, por clique ou Enter. Ano e edicao continuam opcionais e separados no catalogo.
- Moderacao continua salvando o pedido e pedindo uma foto de referencia.

#### Validacao
npm run build: aprovado, servidor e cliente.
npm run typecheck: aprovado, servidor e cliente.
npm run test:server: 171/171 aprovados.
Interface de miniaturas: 11/11 aprovados, incluindo CG 2008 por Enter e Tenere 700 2026 por clique.
Testes de regressao reproduzem 401 seguido de duas contas com 403/5016, geracao de CG e Tenere 700 em sequencia, alternativa de visao disponivel/indisponivel, termos/plano/acesso por modelo e reavaliacao de credenciais corrigidas. As chamadas de IA sao simuladas, sem consumir cota ou credenciais reais.
O tsx precisou de preload temporario externo ao projeto pela falha uv_os_get_passwd/ENOMEM do ambiente isolado Windows.
A suite geral de interface apresentou falhas em outras telas na validacao anterior e nao esta sendo declarada aprovada; nesta correcao foram executados os testes de interface do fluxo afetado.

### Erros do terminal anexado

#### Conflito ao editar o pedido

O log registra PATCH 409: Este pedido nao pode ser editado agora. A tela salvava observacoes/modo em PATCH e depois enfileirava em outra chamada. Um pedido alterado ou colocado na fila por outra acao podia recusar a primeira etapa.

Agora o modal usa uma unica chamada POST /:id/gerar com observacoes, modo e correcao. O servidor grava os dados e muda o estado na mesma atualizacao condicional. Um pedido ja pendente/processando retorna 202 com jaNaFila, sem sobrescrever dados e sem duplicar a geracao. A tela recarrega o estado e conserva as alteracoes locais. Pedidos aprovados/descartados continuam protegidos contra edicao. Enquanto os dados iniciais de um pedido nao carregam, os botoes de geracao ficam bloqueados.

#### Recusas da Cloudflare

O anexo registra cota diaria gratuita esgotada, output flagged e termos pendentes do modelo llama-3.2-11b-vision-instruct.

- Cota: o provedor recusou por consumo da franquia. O codigo mantem o pedido para a proxima janela, sem gastar outra tentativa. Nao e corrigivel aumentando tentativas no cliente.
- Conteudo: a geracao foi bloqueada pelo filtro do provedor. O pedido permanece salvo e pode receber referencia autorizada apropriada. Nao se contorna o filtro.
- Termos: a conta precisa ter acesso autorizado ao modelo. O sistema ja tenta o modelo visual alternativo disponivel; sem analise valida, exige conferencia manual. Nenhum termo foi aceito automaticamente nesta rodada.

Os avisos de instalacao/deprecacao nao impediram a API e o Vite de iniciar no anexo. O launcher agora usa npm-cli.js via Node, sem shell intermediario, quando iniciado por npm run dev no Windows, removendo a origem do aviso DEP0190 nesse caminho. A sintaxe foi verificada; o teste de preparo npm run dev -- --check encontrou ausencia de server/.env neste checkout de entrega, que nao inclui credenciais. Preserve o seu server/.env na atualizacao.

#### Acabamentos da moto

Apenas tanque e superficies que identificam a opcao de cor da versao entram na mascara. Carenagens, paralamas e tampas padrao conservam a cor do modelo; so entram na pintura variavel quando as referencias comprovam essa funcao. Rodas, escapamento, motor, suspensao, suporte de placa, banco, quadro, ferragens e adesivos conservam as cores e acabamentos originais. O processamento nao converte essas pecas para cinza.

O marcador ciano de pintura e distinto dos fundos verde/magenta. Os testes passam a imagem pelo recorte e pela extracao de mascara, conferindo que acabamentos azuis e dourados permanecem iguais ao original e fora da mascara.

Atualize cliente e servidor juntos, preservando o arquivo de ambiente. Nenhum SQL novo e necessario. Imagens ja geradas pelo processamento anterior devem ser geradas novamente a partir das referencias para recuperar acabamentos que ja tinham sido convertidos em cinza.

### Atualizacao do modal

1. Substitua o projeto pelo conteudo desta pasta, preservando as variaveis de ambiente do servidor.
2. Instale as dependencias pelos lockfiles: npm ci, npm --prefix server ci e npm --prefix client ci.
3. Compile com npm run build e reinicie o servidor com a nova versao. O cliente e a API precisam ser atualizados juntos.
4. Reabra a solicitacao antiga e confira os quatro itens da imagem. Nao e necessario gerar novamente apenas por ausencia de metadados antigos de transparencia: a API agora verifica o arquivo salvo.

Esta correcao nao exige executar um novo SQL. A funcao publicar_miniatura ja existente continua sendo utilizada. A API passa a gravar as confirmacoes no formato aceito por ela e preserva a analise original.

Uma imagem confirmada como virada para a esquerda ou com partes cortadas continua exigindo nova geracao. Analise indisponivel ou direcao inconclusiva podem seguir pela conferencia manual explicita. O arquivo transparente continua sendo validado no servidor.

### Verificacao dos acabamentos

- Compilacao de cliente e servidor: aprovada.
- Servidor: 75 testes direcionados aprovados, cobrindo pintura, recorte verde/magenta, preservacao de acabamentos azuis/dourados, geracao atomica, pedidos ja na fila, concorrencia, provedor, aprovacao e funcao SQL original em PostgreSQL embarcado.
- Interface: 10 testes direcionados aprovados, cobrindo envio unico de dados para geracao, modal oficial, central, menu condicional, aplicacao de oito cores somente na mascara e uso da mascara assinada da imagem publicada.
- scripts/dev.mjs passou no node --check. A tentativa npm run dev -- --check parou corretamente por ausencia de server/.env neste checkout de entrega; nenhum servidor ou worker foi iniciado nesse teste. Preserve as credenciais do seu ambiente na atualizacao.
- Nenhum banco de producao, geracao real paga, aceite de termos ou alteracao de plano da Cloudflare foi realizado.
- A suite geral do aplicativo nao foi reexecutada integralmente. Os testes se concentram no fluxo alterado e suas regressoes.

### Verificacao da central

- Compilacao do servidor e do cliente: aprovada.
- Interface: 12 testes direcionados aprovados, cobrindo menu condicional, permissoes, retomada do pedido pelo lapis, modal oficial, geracao em lote e regressao do modal de conferencia. Os quatro testes diretamente relacionados ao menu/central/lote passaram novamente apos o ajuste final dos indicadores.
- Servidor: 21 testes aprovados, cobrindo contagem exata de pendencias, etapas abertas, aprovacao e integracao com a funcao SQL original em PostgreSQL embarcado.
- Nao foi alterado o banco de producao nem executada uma migracao. A nova rota utiliza as tabelas existentes e a mesma protecao administrativa.
- Atualizar cliente e servidor juntos. O menu depende de GET /api/admin/miniaturas/pendencias.
- O menu acompanha mudancas nos dados e modais em edicao. Ha consulta de recuperacao a cada 30 segundos apenas enquanto a janela esta visivel, para workers externos sem eventos Realtime.
- A suite geral do aplicativo nao foi executada integralmente nesta rodada. Esta verificacao se concentra no fluxo alterado e nas regressoes de aprovacao.

### Verificacao do modal

- Compilacao do servidor e do cliente: aprovada.
- Servidor, fila, provedor, recorte, progresso, aprovacao e SQL: 64 testes aprovados.
- Modal real, QR Code e nova conferencia: 8 testes aprovados.
- A funcao publicar_miniatura foi extraida da migracao original do projeto e executada em PostgreSQL embarcado (PGlite). O teste reproduz o erro anterior de enquadramento e verifica a aprovacao pela API corrigida.
- Casos cobertos: IA indisponivel, direcao inconclusiva, metadados antigos, arquivo opaco/ausente, candidata trocada, atualizacao concorrente, revisao desatualizada, conflito dentro da funcao SQL, repeticao de requisicao e de cliques, falha do refresh apos sucesso e bloqueio de imagem em processamento.
- Previa local inspecionada no navegador: conferencia em quatro itens, liberacao do botao, referencias separadas, layout responsivo e duas colunas em largura desktop.
- A suite geral do aplicativo nao foi reexecutada integralmente nesta revisao. A execucao anterior registrou falhas em menus, tema e personalizacao fora do fluxo de miniaturas.
- Nao houve geracao paga/real, envio por camera fisica ou acesso ao banco de producao nesta verificacao. Provedor e Storage usam respostas controladas nos testes; a funcao PL/pgSQL e executada em PostgreSQL real embarcado.
- A correcao funciona com a funcao SQL existente, sem nova migracao. Atualize servidor e cliente juntos; publicar somente o cliente conserva o erro antigo na API.
