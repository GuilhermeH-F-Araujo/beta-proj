# Configuracao

## Ambiente do servidor

| Nome padrao               | Alias aceito             | Uso                             |
| ------------------------- | ------------------------ | ------------------------------- |
| SUPABASE_URL              | URL_SUPABASE             | Endereco do projeto             |
| SUPABASE_PUBLISHABLE_KEY  | CHAVE_PUBLICA_SUPABASE   | Operacoes de sessao             |
| SUPABASE_SECRET_KEY       | CHAVE_PRIVADA_SUPABASE   | Acesso administrativo protegido |
| CLIENT_URL                | URL_CLIENTE              | Origem autorizada do painel     |
| MODEL_IMAGE_PROVIDER      | MINIATURAS_PROVEDOR      | Provedor de imagens             |
| MODEL_IMAGE_ACCOUNTS_JSON | MINIATURAS_CONTAS_JSON   | Contas do provedor              |
| MODEL_IMAGE_AI_MODEL      | MINIATURAS_MODELO        | Modelo de imagens               |
| MODEL_IMAGE_DAILY_LIMIT   | MINIATURAS_LIMITE_DIARIO | Limite de geracoes              |
| CLOUDFLARE_ACCOUNT_ID     | CLOUDFLARE_ID_CONTA      | Conta do provedor               |
| CLOUDFLARE_API_TOKEN      | CLOUDFLARE_TOKEN_API     | Token do provedor               |
| OPENAI_API_KEY            | OPENAI_CHAVE_API         | Chave do provedor opcional      |

Os nomes tecnicos usuais sao recomendados para novas instalacoes. Os aliases em portugues continuam funcionando. Se ambos ja estiverem definidos, o alias preserva a precedencia anterior; evite preencher os dois formatos com valores diferentes. SUPABASE_SERVICE_ROLE_KEY tambem continua aceito como alternativa da chave privada. O adaptador fica em server/scripts/env.mjs. PORT e NODE_ENV mantem os nomes usados pela hospedagem.

## Ambiente do navegador

VITE*URL_API vazio usa a mesma origem do painel. No desenvolvimento, o Vite encaminha /api, /health e /documentacao para a API local. VITE_URL_API continua aceito para ambientes existentes. Somente variaveis publicas podem usar o prefixo VITE*.

## CEP

CEP*PERMITIR_VIACEP=true permite consulta sem credenciais dos Correios. Nesse caso, os campos CORREIOS*\* podem ficar vazios.

Para usar o servico contratado dos Correios, configure CORREIOS_TOKEN ou CORREIOS_USUARIO, CORREIOS_CODIGO_ACESSO, CORREIOS_CONTRATO e CORREIOS_DR, conforme o contrato disponivel. Essas credenciais ficam no servidor. A API limita tentativas, usa prazo de resposta e valida o retorno. O usuario ainda pode corrigir o endereco e informar numero ou complemento.

## Miniaturas

Geracao de imagens e opcional. Sem credenciais, o restante do painel continua funcionando. A fila aguarda a configuracao. Uma conta pode usar CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN. A lista opcional de contas usa o contrato JSON existente com name, accountId e apiToken. Nunca exponha essa lista no navegador ou em documentacao publica.

Caminhos de provedores, nomes de pacotes, metodos das bibliotecas, atributos HTML e nomes persistidos no banco ou Storage permanecem nos formatos exigidos por esses contratos. Isso inclui identificadores tecnicos de protocolos e formatos de dados. Traduzir esses valores sem migracao alteraria o funcionamento.

## Dados existentes

Em Configuracoes > Preferencias > Interface, o tamanho dos botoes varia entre
80% e 150%. A mudanca aparece durante o movimento da barra e e salva
automaticamente na conta, pela mesma fila de preferencias de leitura. Contas e
clientes antigos sem tamanhoBotoes usam 100%; nao e necessario alterar os
registros JSON existentes no banco.

O perfil e a edicao de clientes precisam de SELECT e UPDATE em
cliente.complemento para service_role. A migracao permitir_complemento_cliente_painel
concede apenas essas permissoes de coluna, sem ampliar o acesso de anon ou
authenticated e sem alterar RLS. O ajuste tambem esta no consolidado
ATUALIZAR-BANCO.sql; em bancos existentes, prefira aplicar somente a migracao
pendente depois de conferir o historico.

As chaves locais da aplicacao passam a ter nomes estaveis. A inicializacao migra chaves antigas do armazenamento do navegador e preserva dados mais recentes no destino. O leitor de rascunhos tambem reconhece chaves antigas no IndexedDB.

Esta reorganizacao nao exige uma nova migracao SQL. Nao reaplique migracoes antigas apenas porque os arquivos foram reorganizados. O banco remoto nao foi alterado por esta refatoracao.

## Personalizacao e acessibilidade

O painel reutiliza preferenciasGlobais e a fila sincronizacaoConta. As novas
propriedades ficam no JSON leitura de usuario_preferencia, usando a mesma RPC
protegida por identidade. Nao ha tabela duplicada nem migracao de coluna.
Clientes antigos recebem valores padrao na normalizacao e na validacao da API.

Em Preferencias, Leitura inclui fontes de 90% a 200%, familia das letras,
espacamento, peso, contraste, foco e links. Interface inclui botoes, campos,
icones, area de toque e escalas independentes das regioes. Os perfis de conforto
preservam as excecoes individuais. As alteracoes sao imediatas; a fila salva na
conta apos uma pequena pausa e repete falhas de sincronizacao.

O atalho Personalizar a tela no cabecalho abre um painel nao modal. Escolher um
botao ou texto bloqueia a acao do clique durante a selecao. Escape cancela;
Tab e Enter permitem escolher controles pelo teclado. Cada excecao guarda
somente uma chave opaca e valores numericos, sem texto de cliente ou seletores
CSS. Ha ate 200 excecoes por conta. Escala individual substitui a escala geral
do elemento, mantendo a escala de sua regiao; a fonte individual substitui o
percentual geral das letras. Remover a excecao restaura os ajustes gerais.

A chave associa pagina, posicao estrutural e contexto do elemento. Alteracoes
no texto, na linha de uma tabela ou na estrutura da pagina podem exigir nova
selecao, evitando transferir silenciosamente a excecao para outro registro.
O editor fica com escala propria para manter os controles de recuperacao
acessiveis mesmo quando o restante da interface foi ampliado.

O login abre /dashboard. A logo do menu leva ao mesmo caminho. As permissoes
existentes continuam sendo verificadas pela rota protegida.

As referencias 60fps.design, godly.design, motionsites.ai e 21st.dev orientaram
hierarquia, agrupamento e acabamento. O painel preserva a identidade da oficina
e prioriza legibilidade, controles claros e movimento reduzido.

O motor de fontes conserva o tamanho original em memoria, separado do percentual
escolhido. Alterar icones, botoes, peso ou espacamento nao captura novamente
uma fonte ja ampliada. Medicoes de novos elementos desligam transicoes e
animacoes; redimensionamento, troca de classes e carregamento de folhas de
estilo renovam apenas as bases necessarias. A limpeza restaura os elementos
antes de uma remontagem do painel.

Os comandos das barras mantem tamanho fixo e os rotulos passam para outra linha
quando a largura nao comporta duas colunas. O ajuste de campos muda altura e
espaco interno, preservando a largura do formulario. Nenhum tamanho calculado
em pixels e persistido; contas com preferencias existentes nao precisam ser
apagadas ou migradas para receber a correcao.

## Organizacao da area de trabalho

Editar tela, no menu principal, ativa a edicao dos proprios elementos da pagina.
Clique em um elemento para ajustar tamanho ou trocar seu atalho. Os botoes nao
executam acoes durante a edicao. Os sinais + criam barras e inserem atalhos no
local; alcas e setas organizam os menus. Concluir edicao retoma o uso normal.
A configuracao fica na mesma preferencia de leitura da conta. O contrato aceita
contas antigas sem os campos novos; nenhuma migracao SQL e necessaria.

O mapa de componentes, limites e instrucoes para acrescentar atalhos/fontes esta
em PERSONALIZACAO.md. Os skeletons agora representam os modulos e o conteudo ja
carregado das telas principais e conservado em memoria durante a sessao.

## Busca e tema da conta

O campo padrao do cabecalho pesquisa em todos os cadastros autorizados. Escolha
um resultado ou use setas e Enter para abrir sua pagina. O botao de lua/sol
alterna o tema e salva a escolha na conta; a mesma opcao fica nas preferencias.
A transicao de iluminacao respeita Movimento reduzido e a preferencia do sistema.

Cada lado admite apenas um menu, incluindo o principal. Acima e abaixo do
cabecalho sao opcoes alternativas do lado superior. Remover um menu adicional
libera novamente aquele lado no editor. Nao e necessario apagar preferencias
existentes nem executar uma migracao SQL para estas alteracoes.
